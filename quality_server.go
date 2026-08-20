package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

const defaultQualityPort = "8098"
const qualityWindowTokens = 80

var qualityTokenPattern = regexp.MustCompile(`(?i)[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*|[.!?]`)

type qualityRequest struct {
	Text          string          `json:"text"`
	Language      string          `json:"language,omitempty"`
	Mode          string          `json:"mode,omitempty"`
	DisabledRules []string        `json:"disabledRules,omitempty"`
	RuleOverrides map[string]bool `json:"ruleOverrides,omitempty"`
}

type qualityResponse struct {
	Backend     string              `json:"backend"`
	Suggestions []qualitySuggestion `json:"suggestions"`
	Antecedents []qualityAntecedent `json:"antecedents"`
}

type qualitySuggestion struct {
	Start              int                 `json:"start"`
	End                int                 `json:"end"`
	Replacement        string              `json:"replacement,omitempty"`
	Category           string              `json:"category"`
	Message            string              `json:"message"`
	Confidence         float64             `json:"confidence"`
	Source             string              `json:"source"`
	RelatedOccurrences []qualityOccurrence `json:"relatedOccurrences,omitempty"`
	Antecedent         *qualityAntecedent  `json:"antecedent,omitempty"`
	// An alternative wording, offered rather than applied. A candidate carries
	// its own edit range because a rewrite usually spans more than the words the
	// finding underlines: the passive is flagged on "was reviewed" and rewritten
	// across the whole clause.
	RewordCandidates []qualityRewordCandidate `json:"rewordCandidates,omitempty"`
}

type qualityRewordEdit struct {
	Start           int    `json:"start"`
	End             int    `json:"end"`
	ReplacementText string `json:"replacementText"`
}

type qualityRewordCandidate struct {
	ReplacementText string              `json:"replacementText"`
	Edits           []qualityRewordEdit `json:"edits"`
	Rationale       string              `json:"rationale"`
	Source          string              `json:"source"`
	Confidence      float64             `json:"confidence"`
	MeaningRisk     string              `json:"meaningRisk"`
	Scope           string              `json:"scope"`
}

type qualityOccurrence struct {
	Start int    `json:"start"`
	End   int    `json:"end"`
	Text  string `json:"text"`
}

type qualityAntecedent struct {
	Pronoun         string  `json:"pronoun"`
	Start           int     `json:"start"`
	End             int     `json:"end"`
	Antecedent      string  `json:"antecedent"`
	AntecedentStart int     `json:"antecedentStart"`
	AntecedentEnd   int     `json:"antecedentEnd"`
	Confidence      float64 `json:"confidence"`
	Agreement       string  `json:"agreement,omitempty"`
}

type qualityToken struct {
	Text      string
	Lower     string
	Start     int
	End       int
	Sentence  int
	Paragraph int
}

var qualityStopWords = map[string]bool{
	"a": true, "an": true, "and": true, "are": true, "as": true, "at": true,
	"be": true, "been": true, "by": true, "can": true, "could": true,
	"did": true, "do": true, "does": true, "for": true, "from": true,
	"had": true, "has": true, "have": true, "he": true, "her": true,
	"hers": true, "him": true, "his": true, "how": true, "i": true,
	"if": true, "in": true, "into": true, "is": true, "it": true,
	"its": true, "me": true, "more": true, "most": true, "my": true,
	"no": true, "not": true, "of": true, "on": true, "or": true,
	"our": true, "ours": true, "she": true, "should": true, "so": true,
	"some": true, "such": true, "than": true, "that": true, "the": true,
	"their": true, "theirs": true, "them": true, "they": true, "this": true,
	"those": true, "to": true, "too": true, "us": true, "was": true,
	"we": true, "were": true, "what": true, "when": true, "where": true,
	"which": true, "who": true, "will": true, "with": true, "would": true,
	"you": true, "your": true, "yours": true,
}

var qualityPronouns = map[string]bool{
	"he": true, "her": true, "hers": true, "him": true, "his": true,
	"it": true, "its": true, "she": true, "they": true, "them": true,
	"their": true, "theirs": true, "this": true, "that": true,
	"these": true, "those": true, "we": true, "us": true, "our": true,
	"ours": true, "you": true, "your": true, "yours": true,
}

var qualityDeterminers = map[string]bool{
	"a": true, "an": true, "the": true, "this": true, "that": true,
	"these": true, "those": true, "my": true, "your": true, "his": true,
	"her": true, "its": true, "our": true, "their": true, "some": true,
	"any": true, "each": true, "every": true, "no": true, "one": true,
}

// The noun heuristic below intentionally recognizes common plural nouns by
// their trailing "s". Keep common third-person verb forms out of that bucket,
// otherwise a sentence like "Plants produces its..." can attach "its" to
// "produces" instead of to the subject "Plants".
var qualityVerbForms = map[string]bool{
	"adds": true, "allows": true, "appears": true, "causes": true,
	"changes": true, "claims": true, "compares": true, "contains": true,
	"creates": true, "depends": true, "describes": true, "does": true,
	"drives": true, "enables": true, "ends": true, "explains": true,
	"feels": true, "finds": true, "follows": true, "generates": true,
	"gives": true, "goes": true, "has": true, "helps": true,
	"includes": true, "increases": true, "indicates": true, "influences": true,
	"is": true, "keeps": true, "leads": true, "looks": true,
	"makes": true, "means": true, "offers": true, "opens": true,
	"performs": true, "provides": true, "produces": true, "proves": true,
	"reaches": true, "receives": true, "refers": true, "remains": true,
	"represents": true, "requires": true, "results": true, "seems": true,
	"serves": true, "shows": true, "starts": true, "supports": true,
	"takes": true, "uses": true, "varies": true, "works": true,
}

var qualityTooAdjectives = map[string]bool{
	"bad": true, "big": true, "close": true, "early": true, "far": true,
	"fast": true, "few": true, "good": true, "hard": true, "late": true,
	"little": true, "long": true, "many": true, "much": true, "often": true,
	"quickly": true, "short": true, "slow": true, "soon": true, "tired": true,
	"well": true, "young": true,
}

// Only followers that make the numeral reading impossible belong here. Words
// like "that", "you", "work", "read", and "see" follow the numeral at least as
// often as the preposition ("I have two that fit", "two work shifts"), so
// including them turned correct text into a 0.91-confidence error. "them" stays
// because "two them" is never grammatical.
var qualityToFollowers = map[string]bool{
	"a": true, "an": true, "her": true, "him": true, "his": true,
	"me": true, "my": true, "our": true, "the": true, "their": true,
	"them": true, "this": true, "us": true,
}

// Bare verbs are the infinitive reading of "to", but on their own they fail the
// rule above: "The two get along well" and "Only two make the cut" are a plural
// subject followed by its verb, so listing them as followers flagged correct
// text. They only settle the reading after a verb that takes an infinitive
// complement — "I want two go" — where "two" cannot be both that verb's object
// and the subject of the next one.
var qualityInfinitiveVerbs = map[string]bool{
	"be": true, "do": true, "get": true, "go": true,
	"learn": true, "make": true, "write": true,
}

var qualityInfinitiveHeads = map[string]bool{
	"going": true, "had": true, "has": true, "have": true, "hope": true,
	"hoped": true, "hopes": true, "like": true, "liked": true, "likes": true,
	"need": true, "needed": true, "needs": true, "plan": true, "planned": true,
	"plans": true, "tried": true, "tries": true, "try": true, "used": true,
	"want": true, "wanted": true, "wants": true,
}

var qualityClauseStarters = map[string]bool{
	"he": true, "i": true, "it": true, "my": true, "she": true,
	"they": true, "this": true, "we": true, "you": true,
}

var qualityIndefinitePronouns = map[string]bool{
	"anybody": true, "anyone": true, "anything": true, "everybody": true,
	"everyone": true, "everything": true, "nobody": true, "nothing": true,
	"somebody": true, "someone": true, "something": true,
}

// isPluralQualityNoun detects plurals by a trailing "s", which misses these.
// That let "children" reach the missing-article rule and produce "a children",
// and let irregular plurals take singular pronouns in the agreement check.
var qualityIrregularPlurals = map[string]bool{
	"children": true, "feet": true, "geese": true, "men": true,
	"mice": true, "oxen": true, "people": true, "teeth": true,
	"women": true,
}

var qualityArticleNouns = map[string]bool{
	"car": true, "child": true, "children": true, "factory": true,
	"family": true, "friend": true, "house": true, "idea": true,
	"job": true, "name": true, "problem": true, "question": true,
	"sentence": true, "story": true, "wife": true, "word": true,
}

var qualityWordFamilies = map[string]string{
	"different":     "differ",
	"difference":    "differ",
	"differently":   "differ",
	"effective":     "effect",
	"effectively":   "effect",
	"effectiveness": "effect",
	"significant":   "signific",
	"significance":  "signific",
	"similarly":     "similar",
	"similarity":    "similar",
	"important":     "import",
	"importance":    "import",
	"relevant":      "relev",
	"relevance":     "relev",
}

var qualityPassiveAuxiliaries = map[string]bool{
	"am": true, "are": true, "be": true, "been": true, "being": true,
	"aren't": true, "get": true, "gets": true, "getting": true, "got": true,
	"he's": true, "is": true, "isn't": true, "it's": true, "she's": true,
	"that's": true, "there's": true, "was": true, "wasn't": true, "we're": true,
	"were": true, "weren't": true, "what's": true, "who's": true, "they're": true,
	"you're": true,
}

var qualityPassiveSupports = map[string]bool{
	"can": true, "can't": true, "could": true, "couldn't": true, "had": true,
	"hadn't": true, "has": true, "hasn't": true, "have": true, "haven't": true,
	"may": true, "might": true, "mightn't": true, "must": true, "mustn't": true,
	"shall": true, "should": true, "shouldn't": true, "will": true, "won't": true,
	"would": true, "wouldn't": true,
}

var qualityPassiveAdverbs = map[string]bool{
	"already": true, "also": true, "automatically": true, "commonly": true,
	"directly": true, "fully": true, "generally": true, "never": true,
	"not": true, "often": true, "partially": true, "quickly": true,
	"still": true, "successfully": true, "typically": true, "usually": true,
	"widely": true,
}

// This list covers irregular participles and common technical verbs whose
// -ed forms are useful passive-voice signals. The suffix fallback below is
// only used when an explicit by-agent makes the construction unambiguous.
var qualityPassiveParticiples = map[string]bool{
	"affected": true, "allowed": true, "approved": true, "assigned": true,
	"based": true, "built": true, "called": true, "caused": true, "changed": true,
	"chosen": true, "compared": true, "connected": true, "considered": true,
	"created": true, "described": true, "designed": true, "developed": true,
	"determined": true, "discovered": true, "enabled": true, "established": true,
	"estimated": true, "expected": true, "explained": true, "found": true,
	"formed": true, "given": true, "identified": true, "improved": true,
	"included": true, "increased": true, "influenced": true, "installed": true,
	"intended": true, "introduced": true, "involved": true, "known": true,
	"limited": true, "located": true, "made": true, "managed": true,
	"measured": true, "mentioned": true, "needed": true, "observed": true,
	"offered": true, "opened": true, "operated": true, "organized": true,
	"planned": true, "presented": true, "processed": true, "produced": true,
	"protected": true, "provided": true, "published": true, "raised": true,
	"read": true, "received": true, "reduced": true, "removed": true,
	"replaced": true, "reported": true, "required": true, "resolved": true,
	"returned": true, "revealed": true, "saved": true, "selected": true,
	"sent": true, "shared": true, "shown": true, "signed": true,
	"started": true, "stored": true, "supported": true, "tested": true,
	"treated": true, "used": true, "updated": true, "verified": true,
	"viewed": true, "written": true,
}

// Words that cannot continue a by-agent's noun phrase.
//
// The agent walk is greedy: it reads forward from "by" and has no way to see
// where the phrase ends, so without this it swallows whatever follows —
// "reviewed by the team yesterday afternoon" reads the afternoon as part of the
// actor. A preposition or a conjunction opens something new, a relativiser
// opens a clause, and a time word belongs to the verb rather than to the actor.
//
// "of" is absent on purpose: "by the team of engineers" names one actor.
var qualityAgentBoundary = map[string]bool{
	"about": true, "above": true, "across": true, "after": true, "again": true,
	"against": true, "along": true, "already": true, "although": true,
	"among": true, "and": true, "around": true, "as": true, "at": true,
	"because": true, "before": true, "behind": true, "below": true,
	"beneath": true, "beside": true, "between": true, "beyond": true,
	"but": true, "despite": true, "down": true, "during": true, "earlier": true,
	"except": true, "for": true, "from": true, "here": true, "however": true,
	"if": true, "in": true, "inside": true, "instead": true, "into": true,
	"later": true, "near": true, "now": true, "on": true, "once": true,
	"onto": true, "or": true, "out": true, "outside": true, "over": true,
	"past": true, "per": true, "recently": true, "since": true, "so": true,
	"soon": true, "still": true, "than": true, "that": true, "then": true,
	"there": true, "though": true, "through": true, "throughout": true,
	"to": true, "today": true, "tomorrow": true, "tonight": true,
	"toward": true, "towards": true, "twice": true, "under": true,
	"underneath": true, "unless": true, "until": true, "up": true,
	"upon": true, "via": true, "when": true, "where": true, "which": true,
	"while": true, "who": true, "whom": true, "whose": true, "with": true,
	"within": true, "without": true, "yesterday": true, "yet": true,

	// Calendar words. A bare one after the actor is when the verb happened, not
	// more actor: "approved by the board Monday" is the board, on Monday.
	"afternoon": true, "evening": true, "friday": true, "monday": true,
	"month": true, "morning": true, "night": true, "saturday": true,
	"sunday": true, "thursday": true, "tuesday": true, "wednesday": true,
	"week": true, "year": true,
}

// Abbreviations whose own period the sentence numbering reads as a full stop.
//
// The list is titles and company suffixes on purpose: those are the ones that
// turn up inside a by-agent, where a truncated phrase names the wrong actor
// rather than merely losing a rewrite. Anything else falls to the shape tests
// in agentEndsAtAbbreviation.
var qualityAbbreviations = map[string]bool{
	"assn": true, "atty": true, "capt": true, "co": true, "col": true,
	"corp": true, "dept": true, "dr": true, "fr": true, "gen": true,
	"gov": true, "hon": true, "inc": true, "jr": true, "lt": true,
	"ltd": true, "messrs": true, "mr": true, "mrs": true, "ms": true,
	"mt": true, "prof": true, "rep": true, "rev": true, "sen": true,
	"sgt": true, "sr": true, "st": true, "univ": true,
}

// Words that open a new phrase inside a by-agent rather than continuing it.
//
// A determiner heads a noun phrase, so one arriving after the agent's own head
// has already started belongs to something else: the "last" in "approved by the
// board last week" opens the week, and the "this" in "reviewed by the team this
// morning" opens the morning. Neither is part of the actor.
//
// These only break past the first word of the agent, where the determiner is
// the agent's own — "by this team" names an actor like any other.
var qualityAgentPhraseBreak = map[string]bool{
	"last": true, "next": true,
}

var qualityPassiveAdjectiveForms = map[string]bool{
	"concerned": true, "convinced": true, "excited": true, "interested": true,
	"married": true, "pleased": true, "related": true, "satisfied": true,
	"surprised": true, "tired": true, "worried": true,
}

func runQualityServer() {
	port := qualityServerPort()

	mux := http.NewServeMux()
	mux.HandleFunc("/health", qualityHealthHandler)
	mux.HandleFunc("/v1/analyze", qualityAnalyzeHandler)
	mux.HandleFunc("/v1/rules", qualityRulesHandler)
	mux.HandleFunc("/v1/synonyms", qualitySynonymsHandler)

	host := strings.TrimSpace(os.Getenv("IKMAL_BIND_HOST"))
	if host == "" {
		host = "127.0.0.1"
	}
	addr := host + ":" + port
	warnIfNotLoopback("quality sidecar", host)
	fmt.Println("ikmal quality sidecar listening on http://" + addr)
	if err := http.ListenAndServe(addr, qualityCORS(mux)); err != nil {
		fmt.Printf("Quality sidecar stopped: %v\n", err)
	}
}

func qualityCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		allowedHeaders := r.Header.Get("Access-Control-Request-Headers")
		if allowedHeaders == "" {
			allowedHeaders = "Content-Type, Accept, X-Requested-With"
		}
		w.Header().Set("Access-Control-Allow-Headers", allowedHeaders)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Private-Network", "true")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func qualityHealthHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	writeQualityJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"backend": "deterministic",
	})
}

func qualityAnalyzeHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var request qualityRequest
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&request); err != nil {
		writeQualityRequestError(w, err, "invalid JSON request")
		return
	}
	if strings.TrimSpace(request.Text) == "" {
		writeQualityJSON(w, http.StatusBadRequest, map[string]string{"error": "text is required"})
		return
	}

	response := analyzeQualityTextReq(request)
	writeQualityJSON(w, http.StatusOK, response)
}

func writeQualityJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

// writeQualityRequestError answers a request whose body could not be read.
//
// A body that exceeded the handler's limit is a different answer from a
// malformed one: the caller can act on 413 by sending less text, and can do
// nothing at all with 400. LanguageTool answers its own length limit with 413,
// so a caller that already handles one handles both.
func writeQualityRequestError(w http.ResponseWriter, err error, message string) {
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		writeQualityJSON(w, http.StatusRequestEntityTooLarge, map[string]any{
			"error": fmt.Sprintf("request body exceeds this server's limit of %d bytes", tooLarge.Limit),
			"limit": tooLarge.Limit,
		})
		return
	}
	writeQualityJSON(w, http.StatusBadRequest, map[string]string{"error": message})
}

var qualityClichesJargonMap = map[string]string{
	"at the end of the day":      "ultimately",
	"think outside the box":     "be creative",
	"low-hanging fruit":         "easy wins",
	"circle back":               "follow up",
	"touch base":                "contact",
	"paradigm shift":            "fundamental change",
	"synergy":                   "cooperation",
	"hit the ground running":    "start immediately",
	"game changer":              "major innovation",
	"move the needle":           "make progress",
	"avoid like the plague":     "avoid",
	"give 110 percent":          "do your best",
	"give 110%":                 "do your best",
	"take it to the next level": "improve",
	"push the envelope":         "innovate",
	"win-win situation":         "mutually beneficial outcome",
	"in this day and age":       "today",
	"few and far between":       "rare",
	"read between the lines":    "look for hidden meaning",
	"actionable insights":       "useful findings",
}

var qualityWeakWordsMap = map[string]string{
	"very unique":      "unique",
	"very essential":   "essential",
	"very complete":    "complete",
	"very main":        "main",
	"really important": "crucial",
	"really good":      "excellent",
	"really big":       "huge",
	"basically":        "essentially",
	"literally":        "actually",
	"stuff and things": "details",
}

func analyzeQualityText(text string) qualityResponse {
	return analyzeQualityTextReq(qualityRequest{Text: text})
}

func analyzeQualityTextReq(request qualityRequest) qualityResponse {
	text := request.Text
	tokens := tokenizeQualityText(text)
	suggestions := make([]qualitySuggestion, 0)
	antecedents := make([]qualityAntecedent, 0)

	ruleActive := func(ruleID string) bool {
		return isQualityRuleEnabled(ruleID, request.RuleOverrides, request.DisabledRules)
	}

	if ruleActive("pronoun-antecedent") || ruleActive("repetition") || ruleActive("word-family-echo") {
		lastContent := make(map[string]qualityToken)
		lastFamily := make(map[string]qualityToken)
		for i, token := range tokens {
			if !isQualityWord(token) {
				continue
			}

			if ruleActive("pronoun-antecedent") && qualityPronouns[token.Lower] {
				if antecedent, confidence, found := findQualityAntecedent(tokens, i); found {
					agreement := antecedentAgreement(token.Lower, antecedent.Lower)
					antecedents = append(antecedents, qualityAntecedent{
						Pronoun:         token.Text,
						Start:           qualityUTF16Offset(text, token.Start),
						End:             qualityUTF16Offset(text, token.End),
						Antecedent:      antecedent.Text,
						AntecedentStart: qualityUTF16Offset(text, antecedent.Start),
						AntecedentEnd:   qualityUTF16Offset(text, antecedent.End),
						Confidence:      confidence,
						Agreement:       agreement,
					})
					if agreement != "" {
						antecedentLink := antecedents[len(antecedents)-1]
						suggestions = append(suggestions, qualitySuggestion{
							Start:       qualityUTF16Offset(text, token.Start),
							End:         qualityUTF16Offset(text, token.End),
							Replacement: pronounAgreementReplacement(token.Lower, antecedent.Lower),
							Category:    "pronoun-antecedent",
							Message:     fmt.Sprintf("The pronoun %q may not agree with the antecedent %q.", token.Text, antecedent.Text),
							Confidence:  confidence,
							Source:      "quality-sidecar",
							Antecedent:  &antecedentLink,
						})
					}
				}
			}

			if ruleActive("repetition") && isQualityContentWord(token, tokens, i) {
				if previous, ok := lastContent[token.Lower]; ok && sameQualityWindow(token, previous, i, tokens) {
					suggestions = append(suggestions, qualitySuggestion{
						Start:              qualityUTF16Offset(text, token.Start),
						End:                qualityUTF16Offset(text, token.End),
						Category:           "repetition",
						Message:            fmt.Sprintf("The content word %q repeats nearby. Consider varying the wording if the repetition is not intentional.", token.Text),
						Confidence:         0.86,
						Source:             "quality-sidecar",
						RelatedOccurrences: qualityOccurrencePair(text, previous, token),
					})
				}
				lastContent[token.Lower] = token
			}

			if ruleActive("word-family-echo") {
				if family, ok := qualityWordFamilies[token.Lower]; ok {
					if previous, found := lastFamily[family]; found && sameQualityWindow(token, previous, i, tokens) && previous.Lower != token.Lower {
						suggestions = append(suggestions, qualitySuggestion{
							Start:              qualityUTF16Offset(text, token.Start),
							End:                qualityUTF16Offset(text, token.End),
							Category:           "word-family-echo",
							Message:            fmt.Sprintf("%q echoes the nearby word %q. Consider varying the wording.", token.Text, previous.Text),
							Confidence:         0.78,
							Source:             "quality-sidecar",
							RelatedOccurrences: qualityOccurrencePair(text, previous, token),
						})
					}
					lastFamily[family] = token
				}
			}
		}
	}

	if ruleActive("homophones") {
		suggestions = append(suggestions, analyzeQualityHomophones(text, tokens)...)
	}
	if ruleActive("sentence-structure") {
		suggestions = append(suggestions, analyzeQualitySentenceStructure(text, tokens)...)
		suggestions = append(suggestions, analyzeQualityMissingArticles(text, tokens)...)
	}
	if ruleActive("passive-voice") {
		suggestions = append(suggestions, analyzeQualityPassiveVoice(text, tokens)...)
	}
	if ruleActive("oxford-comma") {
		suggestions = append(suggestions, analyzeQualityOxfordComma(text, tokens)...)
	}
	if ruleActive("cliches-jargon") {
		suggestions = append(suggestions, analyzeQualityClichesJargon(text)...)
	}
	if ruleActive("weak-words") {
		suggestions = append(suggestions, analyzeQualityWeakWords(text)...)
	}
	if ruleActive("readability") {
		suggestions = append(suggestions, analyzeQualityReadability(text, tokens)...)
	}
	if ruleActive("punctuation") {
		suggestions = append(suggestions, analyzeQualityPunctuation(text)...)
	}
	if ruleActive("unnecessary-adverbs") {
		suggestions = append(suggestions, analyzeQualityUnnecessaryAdverbs(text, tokens)...)
	}
	if ruleActive("formality-tone") {
		suggestions = append(suggestions, analyzeQualityFormalityTone(text)...)
	}
	if ruleActive("style-guide") {
		suggestions = append(suggestions, analyzeQualityStyleGuide(text)...)
	}

	return qualityResponse{
		Backend:     "deterministic",
		Suggestions: suggestions,
		Antecedents: antecedents,
	}
}

var qualityOxfordIntroWords = map[string]bool{
	"however": true, "therefore": true, "meanwhile": true, "furthermore": true,
	"moreover": true, "firstly": true, "secondly": true, "finally": true,
	"currently": true, "recently": true, "today": true, "yesterday": true,
	"tomorrow": true, "additionally": true, "consequently": true, "besides": true,
}

var qualityOxfordCommonVerbs = map[string]bool{
	"grew": true, "fell": true, "rose": true, "increased": true, "decreased": true,
	"expanded": true, "spoke": true, "wrote": true, "ran": true, "walked": true,
	"said": true, "thought": true, "went": true, "came": true, "took": true,
}

func analyzeQualityOxfordComma(text string, tokens []qualityToken) []qualitySuggestion {
	suggestions := make([]qualitySuggestion, 0)
	re := regexp.MustCompile(`(?i)\b([a-zA-Z0-9'-]+),\s+([a-zA-Z0-9'-]+)\s+(and|or)\s+([a-zA-Z0-9'-]+)\b`)
	matches := re.FindAllStringSubmatchIndex(text, -1)
	for _, m := range matches {
		item1Text := strings.ToLower(text[m[2]:m[3]])
		item2Text := text[m[4]:m[5]]
		conjText := text[m[6]:m[7]]

		if qualityOxfordIntroWords[item1Text] || regexp.MustCompile(`^\d{4}$`).MatchString(item1Text) {
			continue
		}
		if qualityOxfordCommonVerbs[strings.ToLower(item2Text)] || qualityVerbForms[strings.ToLower(item2Text)] {
			continue
		}

		start := m[4]
		end := m[7]
		replacement := item2Text + ", " + conjText

		suggestions = append(suggestions, qualitySuggestion{
			Start:       qualityUTF16Offset(text, start),
			End:         qualityUTF16Offset(text, end),
			Replacement: replacement,
			Category:    "oxford-comma",
			Message:     fmt.Sprintf("In a list of three or more items, an Oxford comma is recommended before '%s'.", conjText),
			Confidence:  0.88,
			Source:      "quality-sidecar",
		})
	}
	return suggestions
}

func analyzeQualityClichesJargon(text string) []qualitySuggestion {
	suggestions := make([]qualitySuggestion, 0)
	lowerText := strings.ToLower(text)
	for phrase, replacement := range qualityClichesJargonMap {
		for cursor := 0; cursor < len(lowerText); {
			rel := strings.Index(lowerText[cursor:], phrase)
			if rel < 0 {
				break
			}
			start := cursor + rel
			end := start + len(phrase)
			if qualityStyleGuideBoundary(text, start, true) && qualityStyleGuideBoundary(text, end, false) {
				suggestions = append(suggestions, qualitySuggestion{
					Start:       qualityUTF16Offset(text, start),
					End:         qualityUTF16Offset(text, end),
					Replacement: replacement,
					Category:    "cliches-jargon",
					Message:     fmt.Sprintf("The phrase %q is an overused cliché or corporate jargon. Consider using %q instead.", text[start:end], replacement),
					Confidence:  0.86,
					Source:      "quality-sidecar",
				})
			}
			cursor = end
		}
	}
	return suggestions
}

func analyzeQualityWeakWords(text string) []qualitySuggestion {
	suggestions := make([]qualitySuggestion, 0)
	lowerText := strings.ToLower(text)
	for phrase, replacement := range qualityWeakWordsMap {
		for cursor := 0; cursor < len(lowerText); {
			rel := strings.Index(lowerText[cursor:], phrase)
			if rel < 0 {
				break
			}
			start := cursor + rel
			end := start + len(phrase)
			if qualityStyleGuideBoundary(text, start, true) && qualityStyleGuideBoundary(text, end, false) {
				suggestions = append(suggestions, qualitySuggestion{
					Start:       qualityUTF16Offset(text, start),
					End:         qualityUTF16Offset(text, end),
					Replacement: replacement,
					Category:    "weak-words",
					Message:     fmt.Sprintf("%q is a weak word or filler phrase. Consider replacing it with %q.", text[start:end], replacement),
					Confidence:  0.82,
					Source:      "quality-sidecar",
				})
			}
			cursor = end
		}
	}
	return suggestions
}

func analyzeQualityReadability(text string, tokens []qualityToken) []qualitySuggestion {
	suggestions := make([]qualitySuggestion, 0)
	sentenceTokens := make(map[int][]qualityToken)
	for _, tok := range tokens {
		if isQualityWord(tok) {
			sentenceTokens[tok.Sentence] = append(sentenceTokens[tok.Sentence], tok)
		}
	}
	for _, toks := range sentenceTokens {
		if len(toks) > 30 {
			first := toks[0]
			last := toks[len(toks)-1]
			suggestions = append(suggestions, qualitySuggestion{
				Start:      qualityUTF16Offset(text, first.Start),
				End:        qualityUTF16Offset(text, last.End),
				Category:   "readability",
				Message:    fmt.Sprintf("This sentence contains %d words. Sentences longer than 30 words can be difficult to read; consider splitting it into shorter sentences.", len(toks)),
				Confidence: 0.85,
				Source:     "quality-sidecar",
			})
		}
	}
	return suggestions
}

func analyzeQualityPunctuation(text string) []qualitySuggestion {
	suggestions := make([]qualitySuggestion, 0)
	reSpaces := regexp.MustCompile(`[^\S\r\n]{2,}`)
	for _, m := range reSpaces.FindAllStringIndex(text, -1) {
		suggestions = append(suggestions, qualitySuggestion{
			Start:       qualityUTF16Offset(text, m[0]),
			End:         qualityUTF16Offset(text, m[1]),
			Replacement: " ",
			Category:    "punctuation",
			Message:     "Multiple spaces detected. Use a single space between words.",
			Confidence:  0.95,
			Source:      "quality-sidecar",
		})
	}
	reSpacePunct := regexp.MustCompile(`[^\S\r\n]+([,.\?!;:])`)
	for _, m := range reSpacePunct.FindAllStringSubmatchIndex(text, -1) {
		suggestions = append(suggestions, qualitySuggestion{
			Start:       qualityUTF16Offset(text, m[0]),
			End:         qualityUTF16Offset(text, m[1]),
			Replacement: text[m[2]:m[3]],
			Category:    "punctuation",
			Message:     "Unexpected space before punctuation mark.",
			Confidence:  0.92,
			Source:      "quality-sidecar",
		})
	}
	reRepPunct := regexp.MustCompile(`(\?\?+|!!+)`)
	for _, m := range reRepPunct.FindAllStringIndex(text, -1) {
		suggestions = append(suggestions, qualitySuggestion{
			Start:       qualityUTF16Offset(text, m[0]),
			End:         qualityUTF16Offset(text, m[1]),
			Replacement: string(text[m[0]]),
			Category:    "punctuation",
			Message:     "Repeated punctuation detected. Use a single punctuation mark.",
			Confidence:  0.90,
			Source:      "quality-sidecar",
		})
	}
	return suggestions
}

var qualityFormalityFormalMap = map[string]string{
	"aforementioned":  "mentioned",
	"henceforth":      "from now on",
	"heretofore":      "previously",
	"notwithstanding": "despite",
	"perchance":       "perhaps",
	"whilst":          "while",
	"thusly":          "thus",
	"hereto":          "to this",
	"whereupon":       "then",
	"inasmuch as":     "since",
	"hitherto":        "until now",
}

var qualityFormalityInformalMap = map[string]string{
	"gonna":      "going to",
	"wanna":      "want to",
	"gotta":      "got to",
	"kinda":      "kind of",
	"sorta":      "sort of",
	"cuz":        "because",
	"no worries": "no problem",
	"bunch of":   "several",
	"a lot of":   "many",
	"awesome":    "excellent",
	"kids":       "children",
}

var qualityAdverbExclusions = map[string]bool{
	"only": true, "early": true, "daily": true, "weekly": true, "monthly": true,
	"yearly": true, "family": true, "apply": true, "reply": true, "supply": true,
	"rely": true, "fly": true, "ally": true, "jelly": true, "ugly": true,
	"holy": true, "lonely": true, "silly": true, "friendly": true, "lovely": true,
	"currently": true, "recently": true, "finally": true, "initially": true,
	"previously": true, "specifically": true, "generally": true, "usually": true,
	"frequently": true, "occasionally": true, "normally": true, "typically": true,
	"similarly": true, "consequently": true, "accordingly": true, "additionally": true,
	"merely": true, "hardly": true, "scarcely": true, "barely": true,
}

func analyzeQualityUnnecessaryAdverbs(text string, tokens []qualityToken) []qualitySuggestion {
	suggestions := make([]qualitySuggestion, 0)
	for _, token := range tokens {
		if !isQualityWord(token) {
			continue
		}
		lower := token.Lower
		if qualityAdverbExclusions[lower] {
			continue
		}
		isLyAdverb := strings.HasSuffix(lower, "ly") && len([]rune(lower)) > 4
		isFillerAdverb := lower == "very" || lower == "really" || lower == "basically" || lower == "actually" || lower == "virtually" || lower == "quite"
		if !isLyAdverb && !isFillerAdverb {
			continue
		}

		suggestions = append(suggestions, qualitySuggestion{
			Start:       qualityUTF16Offset(text, token.Start),
			End:         qualityUTF16Offset(text, token.End),
			Replacement: "",
			Category:    "unnecessary-adverbs",
			Message:     fmt.Sprintf("The adverb %q may be unnecessary or weak. Consider omitting it or using a stronger verb.", token.Text),
			Confidence:  0.80,
			Source:      "quality-sidecar",
		})
	}
	return suggestions
}

func analyzeQualityFormalityTone(text string) []qualitySuggestion {
	suggestions := make([]qualitySuggestion, 0)
	lowerText := strings.ToLower(text)

	for phrase, replacement := range qualityFormalityFormalMap {
		for cursor := 0; cursor < len(lowerText); {
			rel := strings.Index(lowerText[cursor:], phrase)
			if rel < 0 {
				break
			}
			start := cursor + rel
			end := start + len(phrase)
			if qualityStyleGuideBoundary(text, start, true) && qualityStyleGuideBoundary(text, end, false) {
				suggestions = append(suggestions, qualitySuggestion{
					Start:       qualityUTF16Offset(text, start),
					End:         qualityUTF16Offset(text, end),
					Replacement: replacement,
					Category:    "formality-tone",
					Message:     fmt.Sprintf("%q is overly formal or archaic. Consider using %q for more natural prose.", text[start:end], replacement),
					Confidence:  0.88,
					Source:      "quality-sidecar",
				})
			}
			cursor = end
		}
	}

	for phrase, replacement := range qualityFormalityInformalMap {
		for cursor := 0; cursor < len(lowerText); {
			rel := strings.Index(lowerText[cursor:], phrase)
			if rel < 0 {
				break
			}
			start := cursor + rel
			end := start + len(phrase)
			if qualityStyleGuideBoundary(text, start, true) && qualityStyleGuideBoundary(text, end, false) {
				suggestions = append(suggestions, qualitySuggestion{
					Start:       qualityUTF16Offset(text, start),
					End:         qualityUTF16Offset(text, end),
					Replacement: replacement,
					Category:    "formality-tone",
					Message:     fmt.Sprintf("%q is overly informal or colloquial. Consider using %q for a professional tone.", text[start:end], replacement),
					Confidence:  0.88,
					Source:      "quality-sidecar",
				})
			}
			cursor = end
		}
	}

	return suggestions
}

// analyzeQualityPassiveVoice reports the passive construction without trying
// to invent an active rewrite. Passive voice is a valid choice in many
// contexts; the signal is useful when the writer wants to check whether the
// actor should be made more prominent.
func analyzeQualityPassiveVoice(text string, tokens []qualityToken) []qualitySuggestion {
	suggestions := make([]qualitySuggestion, 0)
	seen := make(map[int]bool)
	for index, token := range tokens {
		if !isQualityWord(token) || !qualityPassiveAuxiliaries[token.Lower] {
			continue
		}

		participleIndex := index + 1
		for skipped := 0; participleIndex < len(tokens) && skipped < 3; skipped++ {
			next := tokens[participleIndex]
			if next.Sentence != token.Sentence || !isQualityWord(next) || !qualityPassiveAdverbs[next.Lower] {
				break
			}
			participleIndex++
		}
		if participleIndex >= len(tokens) {
			continue
		}
		participle := tokens[participleIndex]
		if participle.Sentence != token.Sentence || !isQualityWord(participle) {
			continue
		}

		byAgent := passiveHasByAgent(text, tokens, participleIndex)
		// The -ed suffix alone does not distinguish a passive from a copular
		// adjective ("the door is closed"), so that fallback is only used when
		// an explicit by-agent makes the construction unambiguous. Known
		// participles need no such evidence.
		inList := qualityPassiveParticiples[participle.Lower]
		suffixOK := strings.HasSuffix(participle.Lower, "ed") &&
			!qualityPassiveAdjectiveForms[participle.Lower] && byAgent
		if !inList && !suffixOK {
			continue
		}
		// "be used to" is the accustomed-to idiom far more often than it is a
		// passive with an instrumental infinitive, and "used" is on the
		// participle list, so the by-agent rule above does not reach it.
		if participle.Lower == "used" && !byAgent &&
			participleIndex+1 < len(tokens) && tokens[participleIndex+1].Lower == "to" {
			continue
		}

		startIndex := index
		for startIndex > 0 {
			previous := tokens[startIndex-1]
			if previous.Sentence != token.Sentence {
				break
			}
			if qualityPassiveSupports[previous.Lower] || qualityPassiveAuxiliaries[previous.Lower] || qualityPassiveAdverbs[previous.Lower] {
				startIndex--
				continue
			}
			break
		}
		start := tokens[startIndex].Start
		if seen[start] {
			continue
		}
		seen[start] = true
		confidence := 0.84
		message := "This phrase may use passive voice. Consider active voice if the actor matters."
		if byAgent {
			confidence = 0.96
			message = "This clause uses passive voice. Consider naming the actor first if the actor matters."
		}
		suggestion := qualitySuggestion{
			Start:      qualityUTF16Offset(text, start),
			End:        qualityUTF16Offset(text, participle.End),
			Category:   "passive-voice",
			Message:    message,
			Confidence: confidence,
			Source:     "quality-sidecar",
		}
		// The rewrite is offered only where the actor is in the sentence, which
		// is also the only place it can be derived rather than invented.
		if rewriteStart, rewriteEnd, replacement, ok := passiveActiveRewrite(text, tokens, startIndex, participleIndex); ok {
			suggestion.RewordCandidates = []qualityRewordCandidate{{
				ReplacementText: replacement,
				Edits: []qualityRewordEdit{{
					Start:           qualityUTF16Offset(text, rewriteStart),
					End:             qualityUTF16Offset(text, rewriteEnd),
					ReplacementText: replacement,
				}},
				Rationale:  "Names the actor first.",
				Source:     "quality-sidecar",
				Confidence: 0.8,
				// The clause is restructured and the verb is left as the
				// participle, so this wants reading before it is taken.
				MeaningRisk: "medium",
				Scope:       "sentence",
			}}
		}
		suggestions = append(suggestions, suggestion)
	}
	return suggestions
}

// passiveActiveRewrite turns an agentive passive clause into its active form:
// "The results were reviewed by the team" becomes "The team reviewed the
// results". It returns the span it rewrites and the replacement, or ok=false.
//
// This only ever fires with an explicit by-agent, and that is the whole design
// rather than a limitation. Without one — "The results were reviewed" — the
// actor is not in the sentence, so no rewrite can recover it and anything
// offered would be invented. A checker may say a clause is passive without
// knowing who acted; it must not put a subject into someone's prose.
//
// The participle is converted to a past tense, and the clause is declined
// outright when that conversion is not known — see qualityPastTense. Subject
// agreement is still not resolved, which is why the candidate carries a medium
// meaning risk and is offered as an alternative rather than applied as a
// correction.
func passiveActiveRewrite(text string, tokens []qualityToken, auxIndex, participleIndex int) (start, end int, replacement string, ok bool) {
	sentence := tokens[participleIndex].Sentence

	// Only a plain past auxiliary is rewritten. The clause this builds is simple
	// past, and everything else in front of the participle says something the
	// active form would have to say too: "will be reviewed" is not a past
	// obligation, "has been reviewed" is not a past event, "is reviewed" is a
	// habit whose active form needs a subject agreement this rule cannot
	// resolve. Rewriting any of them into "The team reviewed the report" states
	// something the writer did not. The contracted "wasn't" is excluded by the
	// same test, which is the point: see the negation below.
	if tokens[auxIndex].Lower != "was" && tokens[auxIndex].Lower != "were" {
		return 0, 0, "", false
	}

	// Adverbs between the auxiliary and the participle are carried into the
	// active clause, where they sit in front of the verb and read the same:
	// "were quickly reviewed by the team" becomes "the team quickly reviewed".
	// A negation cannot be carried and cannot be dropped. The rewrite rebuilds
	// the span from the subject to the agent, so anything not carried is
	// deleted, and deleting "not" leaves a sentence that asserts the opposite of
	// what the writer wrote. It declines instead.
	adverbs := make([]string, 0, 3)
	for index := auxIndex + 1; index < participleIndex; index++ {
		token := tokens[index]
		if token.Lower == "not" || token.Lower == "never" || !qualityPassiveAdverbs[token.Lower] {
			return 0, 0, "", false
		}
		adverbs = append(adverbs, token.Text)
	}

	byIndex := -1
	for index := participleIndex + 1; index < len(tokens) && index <= participleIndex+8; index++ {
		token := tokens[index]
		if token.Sentence != sentence || token.Text == "." || token.Text == "!" || token.Text == "?" {
			break
		}
		// A "by" on the far side of a comma belongs to another clause and names
		// another actor: in "The results were reviewed, and the report was
		// written by Ian", Ian wrote the report and who reviewed the results is
		// not in the sentence at all.
		if !qualityTokensAdjoin(text, tokens[index-1], token) {
			break
		}
		if token.Lower == "by" {
			byIndex = index
			break
		}
	}
	if byIndex < 0 || byIndex+1 >= len(tokens) {
		return 0, 0, "", false
	}

	// The agent runs from "by" to the end of its noun phrase: the clause ends,
	// punctuation closes it, or a word arrives that cannot be part of it.
	agentEnd := byIndex
	for index := byIndex + 1; index < len(tokens); index++ {
		token := tokens[index]
		if token.Sentence != sentence || !isQualityWord(token) {
			break
		}
		if !qualityTokensAdjoin(text, tokens[index-1], token) {
			break
		}
		// A conjunction joins two actors — "by the team and the board" — or it
		// opens a clause. The word is the same either way, so the phrase behind
		// it has to look like the actor it claims to be; see
		// coordinatedAgentEnd. Where it does not, this is the boundary the list
		// below says it is.
		if index > byIndex+1 && (token.Lower == "and" || token.Lower == "or") {
			if end, ok := coordinatedAgentEnd(text, tokens, byIndex, index, sentence); ok {
				agentEnd = end
			}
			break
		}
		if qualityAgentBoundary[token.Lower] {
			break
		}
		if index > byIndex+1 && (qualityDeterminers[token.Lower] || qualityAgentPhraseBreak[token.Lower]) {
			break
		}
		agentEnd = index
	}
	if agentEnd == byIndex {
		return 0, 0, "", false
	}
	// The sentence the agent ends may not be a sentence. Sentences are numbered
	// on ".!?" alone, so the period in "reviewed by Dr. Smith" ends one, and the
	// walk above stops at a phrase that was never finished: the rewrite named Dr
	// as the actor and left "Smith." standing behind it. The stranding guard
	// below cannot see that — what follows the agent is the period, and the name
	// belongs to the next sentence as far as the tokens know.
	if agentEndsAtAbbreviation(text, tokens, agentEnd) {
		return 0, 0, "", false
	}
	// The agent has to be the last thing in its sentence. The rewrite moves it
	// to the front, and anything left standing behind it is stranded next to a
	// phrase it was never about: "approved by the board, which met on Tuesday"
	// would become findings that met on Tuesday, and "reviewed by the team
	// yesterday afternoon" would leave the afternoon with nothing to attach to.
	// Where the agent ends the sentence there is nothing to strand.
	if agentEnd+1 < len(tokens) {
		next := tokens[agentEnd+1]
		if next.Sentence == sentence && isQualityWord(next) {
			return 0, 0, "", false
		}
	}

	// The subject is the noun phrase in front of the auxiliary: back to the
	// determiner that heads it, or to the start of the sentence. Anything left
	// in front of it belongs to a clause this rule cannot see the boundaries of
	// — "He said the report was reviewed by the team" is about what he said, not
	// about the team — so it declines rather than guessing.
	subjectStart := auxIndex
	for index := auxIndex - 1; index >= 0; index-- {
		token := tokens[index]
		if token.Sentence != sentence || !isQualityWord(token) {
			break
		}
		if !qualityTokensAdjoin(text, token, tokens[index+1]) {
			break
		}
		subjectStart = index
		if qualityDeterminers[token.Lower] {
			// A quantifier or a focus word sits in front of the determiner and
			// still belongs to the phrase — "both the reports", "only the
			// summary" — where anything else in front of it is another clause.
			// The walk takes one such word and stops, so "Both the reports were
			// reviewed by Ian" rewrites while "This week the report was
			// reviewed by Ian" still declines.
			if index > 0 && tokens[index-1].Sentence == sentence &&
				qualityQuantifierHeads[tokens[index-1].Lower] &&
				qualityTokensAdjoin(text, tokens[index-1], token) {
				subjectStart = index - 1
			}
			break
		}
	}
	if subjectStart >= auxIndex {
		return 0, 0, "", false
	}
	if subjectStart > 0 && tokens[subjectStart-1].Sentence == sentence {
		return 0, 0, "", false
	}
	// The subject's head has to be a word that can head a noun phrase. The walk
	// back stops at a determiner, and a subject without one has nothing to stop
	// it: it runs through whatever opened the sentence and takes it along. "In
	// 2024 reports were reviewed by Ian" offered "Ian reviewed in 2024 reports",
	// and "Yesterday reports were reviewed by Ian" moved the day into the
	// object. A determiner-headed subject already declines on the phrase in
	// front of it — "This week the report was reviewed by Ian" — and this is
	// that same refusal for the subjects that have no determiner to find it.
	if qualityAgentBoundary[tokens[subjectStart].Lower] || qualityAgentPhraseBreak[tokens[subjectStart].Lower] {
		return 0, 0, "", false
	}
	subject := strings.TrimSpace(text[tokens[subjectStart].Start:tokens[auxIndex-1].End])
	agent := strings.TrimSpace(text[tokens[byIndex+1].Start:tokens[agentEnd].End])
	verb, known := pastTenseOf(tokens[participleIndex].Text)
	if subject == "" || agent == "" || !known {
		return 0, 0, "", false
	}

	// An agent headed by an object pronoun needs its subject form. Only the head
	// changes and the rest of the phrase comes through as written, so "by them
	// all" is "They all" rather than "They".
	//
	// "her" is the exception, and the reason this once looked at one-word agents
	// only: standing alone it is the pronoun, and in front of a noun it is the
	// possessive, so "by her team" is "Her team". The other four are never
	// determiners, and a noun behind them changes nothing.
	agentHead := tokens[byIndex+1]
	if subjectForm, ok := qualitySubjectPronouns[agentHead.Lower]; ok &&
		(agentEnd == byIndex+1 || agentHead.Lower != "her") {
		agent = subjectForm + text[agentHead.End:tokens[agentEnd].End]
	}

	// The subject the rewrite displaces lands in object position, where a
	// subject pronoun is the wrong form the other way round: "The panel
	// interviewed I" is as ungrammatical as "Him reviewed the report", and the
	// lower-casing below made it "the panel interviewed i". None of these five
	// is ever a determiner, so only the head changes here too and "We engineers
	// were reviewed" becomes "us engineers".
	subjectHead := tokens[subjectStart]
	if objectForm, ok := qualityObjectPronouns[subjectHead.Lower]; ok {
		subject = objectForm + text[subjectHead.End:tokens[auxIndex-1].End]
	}

	agent = upperFirst(agent)
	if subjectTakesLowerCase(tokens[subjectStart], tokens[auxIndex]) {
		subject = lowerFirst(subject)
	}
	parts := append([]string{agent}, adverbs...)
	parts = append(parts, verb, subject)
	return tokens[subjectStart].Start, tokens[agentEnd].End, strings.Join(parts, " "), true
}

// coordinatedAgentEnd returns the end of a second actor joined onto a by-agent
// by "and" or "or", and whether there is one.
//
// "The results were reviewed by the team and the board" names two actors, and
// the conjunction is all there is between them. "The results were reviewed by
// the team and the board approved the plan" uses the same word to open a
// clause, and reading that as more actor builds a sentence about a board that
// approved the plan reviewing the results. Nothing in the word tells them
// apart, so this asks the phrase behind it to be shaped like an actor: a
// determiner and one word, or one word alone, ending the sentence and reading
// as nothing that could be a verb. Anything longer or less certain declines,
// which is what the rewrite does everywhere else it cannot see a boundary.
//
// Pronouns are left out of coordination entirely. "by Ian and me" is the
// correct object form where it stands and wants "Ian and I" in front of the
// verb, and a rule that rewrites one conjunct is not going to get the pair
// right.
func coordinatedAgentEnd(text string, tokens []qualityToken, byIndex, conjunction, sentence int) (int, bool) {
	if _, pronoun := qualitySubjectPronouns[tokens[byIndex+1].Lower]; pronoun {
		return 0, false
	}
	end, words := conjunction, 0
	for index := conjunction + 1; index < len(tokens); index++ {
		token := tokens[index]
		if token.Sentence != sentence || !isQualityWord(token) {
			break
		}
		if !qualityTokensAdjoin(text, tokens[index-1], token) {
			break
		}
		if _, pronoun := qualitySubjectPronouns[token.Lower]; pronoun {
			return 0, false
		}
		if qualityAgentBoundary[token.Lower] || qualityAgentPhraseBreak[token.Lower] ||
			looksLikeQualityVerb(token.Lower) {
			return 0, false
		}
		if index == conjunction+1 && qualityDeterminers[token.Lower] {
			end = index
			continue
		}
		if qualityDeterminers[token.Lower] || words == 1 {
			return 0, false
		}
		words++
		end = index
	}
	if words == 0 {
		return 0, false
	}
	return end, true
}

// looksLikeQualityVerb reports whether a word could be the verb of the clause a
// conjunction opened. It only has to be right about the words that turn up in
// that position — a past tense — because the alternative reading is a noun
// phrase, and a noun phrase does not contain one.
func looksLikeQualityVerb(lower string) bool {
	if qualityPassiveParticiples[lower] || qualityPassiveAuxiliaries[lower] {
		return true
	}
	if _, ok := qualityPastTense[lower]; ok {
		return true
	}
	return strings.HasSuffix(lower, "ed")
}

// agentEndsAtAbbreviation reports whether the period that closed the agent's
// sentence belongs to an abbreviation rather than to the sentence.
//
// Three shapes say it does. The word in front of the period is a known
// abbreviation — "by Dr." — or the period is followed with no space at all,
// which is a letter inside one: "by the U.S. team" stops the walk at "U". A
// lone letter is an initial when the name it belongs to continues behind the
// period, and a name of its own when nothing does: "by team B." at the end of
// the text is a team, and that rewrite is a good one.
func agentEndsAtAbbreviation(text string, tokens []qualityToken, agentEnd int) bool {
	if agentEnd+1 >= len(tokens) {
		return false
	}
	period := tokens[agentEnd+1]
	last := tokens[agentEnd]
	if period.Text != "." || period.Start != last.End {
		return false
	}
	if qualityAbbreviations[last.Lower] {
		return true
	}
	if agentEnd+2 < len(tokens) && tokens[agentEnd+2].Start == period.End {
		return true
	}
	if len([]rune(last.Text)) != 1 {
		return false
	}
	// A lone letter is an initial — "by J. Smith", "by John F. Kennedy" — or it
	// is the tail of a name, "by team B.". Nothing in the letter tells them
	// apart; what follows the period does. An initial always has the rest of the
	// name behind it on the same line, and a name that ends the text ends it.
	// Where a name is followed by a real sentence this reads it as an initial
	// and declines, which loses a rewrite rather than naming half an actor.
	return agentEnd+2 < len(tokens) && qualityTokensAdjoin(text, period, tokens[agentEnd+2])
}

// The past tense of the participles that do not simply end in -ed.
//
// A regular verb's past tense and past participle are the same word, so
// "reviewed by the team" becomes "the team reviewed" with no conversion at all.
// Irregulars are where a naive swap produces "Ian written the report" — which is
// not stiff, it is ungrammatical, and worse than offering nothing. Only the ones
// listed here can be rewritten; anything else without an -ed ending declines.
//
// The list is closed on purpose. It covers the irregulars the participle list
// admits, and an unknown irregular refuses rather than guessing at a form.
var qualityPastTense = map[string]string{
	"built": "built", "chosen": "chose", "found": "found", "given": "gave",
	"known": "knew", "made": "made", "read": "read", "sent": "sent",
	"shown": "showed", "written": "wrote",
}

// pastTenseOf returns the past tense for a participle, and whether one is known.
func pastTenseOf(participle string) (string, bool) {
	if past, ok := qualityPastTense[strings.ToLower(participle)]; ok {
		return past, true
	}
	if strings.HasSuffix(strings.ToLower(participle), "ed") {
		return participle, true
	}
	return "", false
}

func upperFirst(value string) string {
	runes := []rune(value)
	if len(runes) == 0 {
		return value
	}
	return string(unicode.ToUpper(runes[0])) + string(runes[1:])
}

func lowerFirst(value string) string {
	runes := []rune(value)
	if len(runes) == 0 {
		return value
	}
	return string(unicode.ToLower(runes[0])) + string(runes[1:])
}

func passiveHasByAgent(text string, tokens []qualityToken, participleIndex int) bool {
	for index := participleIndex + 1; index < len(tokens) && index <= participleIndex+8; index++ {
		token := tokens[index]
		if token.Sentence != tokens[participleIndex].Sentence {
			break
		}
		if token.Text == "." || token.Text == "!" || token.Text == "?" {
			break
		}
		// The by-agent is the evidence that an -ed word is a participle rather
		// than an adjective, and evidence from the next clause is not evidence:
		// the "by" in "The door is closed, and the letter was signed by Ian"
		// says nothing about "closed".
		//
		// A single line break is not a clause boundary though, it is where the
		// paragraph was wrapped, and reading it as one lost the finding outright
		// for "The results were reviewed\nby the team." The rewrite still
		// declines across the wrap; only the evidence reads through it.
		//
		// It reads through a wrap that lands directly in front of the "by" and
		// no further. Sentences are numbered on ".!?" alone, so in line-oriented
		// prose — bullets, notes, headings — the next line is the same sentence
		// as far as the tokens know, and walking on into it let the "by" of "The
		// letter was signed by Ian" become evidence about the "closed" of "The
		// door is closed" a line above: a copular adjective called passive at
		// the highest confidence this rule emits.
		if !qualityTokensAdjoin(text, tokens[index-1], token) {
			if token.Lower != "by" || !qualityTokensWrap(text, tokens[index-1], token) {
				break
			}
		}
		if token.Lower == "by" {
			return true
		}
	}
	return false
}

// subjectTakesLowerCase reports whether a sentence-initial subject's capital is
// the sentence's rather than the word's.
//
// Moving the agent to the front of the clause moves the sentence's capital with
// it, and the displaced subject should go back to lower case. Only where the
// capital is the sentence's: a name keeps its own. Nothing here can tell "Ian"
// from "Mistakes" in the abstract, so this asks for a positive reason to lower
// the case — the word is a function word, or a plain plural — and leaves the
// writer's capital alone otherwise. "The team reviewed Feedback" reads oddly;
// "the team reviewed ian's report" is wrong about a person.
func subjectTakesLowerCase(head, aux qualityToken) bool {
	if head.Lower == "i" {
		return false
	}
	// A word in capitals throughout carries its own: an acronym, or a line the
	// writer shouted. Lowering the first rune of one produced "THE TEAM REVIEWED
	// tHE REPORT", which is neither the sentence's capital nor the word's.
	if isShoutedQualityWord(head.Text) {
		return false
	}
	if qualityStopWords[head.Lower] || qualityDeterminers[head.Lower] ||
		qualityIndefinitePronouns[head.Lower] || qualityQuantifierHeads[head.Lower] {
		return true
	}
	// A possessive ends in "s" without being a plural, and "Ian's" is exactly
	// the case this must not lower.
	if strings.ContainsAny(head.Text, "'’") {
		return false
	}
	// A bare word ending in "s" is a plural common noun or it is a name, and
	// nothing in the word separates "Mistakes" from "James". The auxiliary
	// does: "were" agrees with a plural and "was" does not, so a subject under
	// "was" keeps the capital it came with. Without this, "James was
	// interviewed by the panel" offered "The panel interviewed james".
	if aux.Lower != "were" {
		return false
	}
	return isPluralQualityNoun(head.Lower)
}

// isShoutedQualityWord reports whether a word is written in capitals
// throughout. One letter is no evidence of anything — the "A" of "A report was
// reviewed" is a determiner wearing the sentence's capital — so this asks for
// two.
func isShoutedQualityWord(value string) bool {
	letters := 0
	for _, r := range value {
		if !unicode.IsLetter(r) {
			continue
		}
		if !unicode.IsUpper(r) {
			return false
		}
		letters++
	}
	return letters > 1
}

// Quantifiers and focus words that can head a subject without being anyone's
// name. They are not determiners — "both the reports" puts the determiner after
// them — but they take the sentence's capital the same way a determiner does.
var qualityQuantifierHeads = map[string]bool{
	"all": true, "another": true, "both": true, "either": true, "few": true,
	"half": true, "many": true, "much": true, "neither": true, "only": true,
	"several": true,
}

// The subject form of the pronouns that change shape in object position.
//
// The rewrite moves the agent into subject position, where "by him" has to
// become "he": "Him reviewed the report" is not stiff, it is ungrammatical, and
// the rule would rather offer nothing. "you" and "it" are the same word in both
// positions and need no entry.
var qualitySubjectPronouns = map[string]string{
	"her": "she", "him": "he", "me": "I", "them": "they", "us": "we",
}

// The object form of the pronouns that change shape in subject position: the
// same trade as qualitySubjectPronouns, made in the other direction for the
// subject the rewrite displaces. "They were reviewed by the team" has to become
// "The team reviewed them", never "reviewed they".
var qualityObjectPronouns = map[string]string{
	"he": "him", "i": "me", "she": "her", "they": "them", "we": "us",
}

// qualityTokensAdjoin reports whether two neighbouring tokens sit in the same
// run of words, with nothing but spaces between them.
//
// The tokenizer emits words and terminal punctuation and nothing else, so a
// comma, a semicolon or a dash is invisible to a walk over token indices — a
// loop looking for the end of a clause runs straight past it and into the next
// one. The text between two tokens is where that boundary actually is. A line
// break counts as one too: sentences are numbered on ".!?" alone, so two
// unpunctuated lines are otherwise read as a single clause.
func qualityTokensAdjoin(text string, left, right qualityToken) bool {
	gap := text[left.End:right.Start]
	return strings.TrimSpace(gap) == "" && !strings.Contains(gap, "\n")
}

// qualityTokensWrap is qualityTokensAdjoin with one line break allowed.
//
// Hard-wrapped prose breaks a line wherever the column runs out, so a single
// newline between two words says nothing about the sentence — it is the same
// clause, seen twice. A blank line is different: that is a paragraph, and the
// words on either side of it were never in one clause to begin with.
func qualityTokensWrap(text string, left, right qualityToken) bool {
	gap := text[left.End:right.Start]
	return strings.TrimSpace(gap) == "" && strings.Count(gap, "\n") <= 1
}

// These are deliberately narrow context rules. A checker should not rewrite
// every occurrence of a homophone, but “too kids” and “two the store” are
// strong enough signals to surface without a statistical grammar model.
func analyzeQualityHomophones(text string, tokens []qualityToken) []qualitySuggestion {
	suggestions := make([]qualitySuggestion, 0)
	for index, token := range tokens {
		if !isQualityWord(token) || index+1 >= len(tokens) || !isQualityWord(tokens[index+1]) {
			continue
		}
		next := tokens[index+1]
		switch token.Lower {
		case "too":
			if !isPluralQualityNoun(next.Lower) || qualityTooAdjectives[next.Lower] {
				continue
			}
			suggestions = append(suggestions, qualitySuggestion{
				Start: qualityUTF16Offset(text, token.Start), End: qualityUTF16Offset(text, token.End),
				Replacement: "two", Category: "homophone", Confidence: 0.94, Source: "quality-sidecar",
				Message: fmt.Sprintf("Use %q for the number; %q means also or excessively.", "two", "too"),
			})
		case "two":
			if !qualityToFollowers[next.Lower] && !hasInfinitiveHead(text, tokens, index) {
				continue
			}
			suggestions = append(suggestions, qualitySuggestion{
				Start: qualityUTF16Offset(text, token.Start), End: qualityUTF16Offset(text, token.End),
				Replacement: "to", Category: "homophone", Confidence: 0.91, Source: "quality-sidecar",
				Message: fmt.Sprintf("Use %q here for the preposition or infinitive.", "to"),
			})
		}
	}
	return suggestions
}

// True when tokens[index] ("two") sits between a verb that takes an infinitive
// complement and the bare verb that follows it: "I want two go". A clause break
// in between makes it a numeral again — "I want two, get me one" — so any
// separating punctuation withdraws the evidence.
func hasInfinitiveHead(text string, tokens []qualityToken, index int) bool {
	if index == 0 || !qualityInfinitiveVerbs[tokens[index+1].Lower] {
		return false
	}
	previous := tokens[index-1]
	if !isQualityWord(previous) || !qualityInfinitiveHeads[previous.Lower] {
		return false
	}
	return !strings.ContainsAny(text[previous.End:tokens[index+1].Start], ".!?;:,\n")
}

func analyzeQualitySentenceStructure(text string, tokens []qualityToken) []qualitySuggestion {
	suggestions := make([]qualitySuggestion, 0)
	for index := 0; index+1 < len(tokens); index++ {
		previous, current := tokens[index], tokens[index+1]
		if !isQualityWord(previous) || !isQualityWord(current) || !qualityClauseStarters[current.Lower] {
			continue
		}
		if previous.Lower == "and" || previous.Lower == "or" || previous.Lower == "but" {
			continue
		}
		gap := text[previous.End:current.Start]
		if strings.ContainsAny(gap, ".!?;:\n") || !startsWithUppercase(current.Text) {
			continue
		}
		// A capitalized pronoun after “Ian and I” is the same clause, not a
		// sentence boundary. Coordinating conjunctions make the boundary
		// heuristic inapplicable.
		if gapHasConjunction(gap) {
			continue
		}
		// “I” is the one clause starter that is capitalized mid-sentence, so
		// capitalization alone cannot separate a new sentence from a relative
		// clause. When the previous token heads a noun phrase — “the report I
		// wrote” — or is an indefinite pronoun — “Everything I do” — the
		// relative-clause reading is the likely one and the boundary evidence
		// is gone. Bare nouns keep firing, so “in factory I have a wife” is
		// still caught.
		if current.Lower == "i" && headsRelativeClause(tokens, index) {
			continue
		}
		suggestions = append(suggestions, qualitySuggestion{
			Start: qualityUTF16Offset(text, previous.Start), End: qualityUTF16Offset(text, previous.End),
			Replacement: previous.Text + ".", Category: "sentence-structure", Confidence: 0.84, Source: "quality-sidecar",
			Message: "This may be a run-on sentence. Consider ending the previous clause before the new sentence.",
		})
	}
	return suggestions
}

func gapHasConjunction(gap string) bool {
	for _, word := range strings.Fields(strings.ToLower(gap)) {
		word = strings.Trim(word, ",")
		if word == "and" || word == "or" || word == "but" {
			return true
		}
	}
	return false
}

// The article follows the sound rather than the spelling, but every noun in
// qualityArticleNouns is regular, so the first letter decides: "an idea", not
// the "a idea" a fixed "a " produced. Keep that true of anything added to the
// list — a silent "h" ("an hour") or a consonant-sounding "u" ("a user") would
// need the sound, not the letter.
func qualityIndefiniteArticle(lower string) string {
	switch {
	case lower == "":
		return "a"
	case strings.ContainsRune("aeiou", rune(lower[0])):
		return "an"
	default:
		return "a"
	}
}

func analyzeQualityMissingArticles(text string, tokens []qualityToken) []qualitySuggestion {
	suggestions := make([]qualitySuggestion, 0)
	articleContexts := map[string]bool{"at": true, "have": true, "has": true, "in": true, "need": true, "on": true, "want": true, "with": true}
	for index, token := range tokens {
		if !articleContexts[token.Lower] || index+1 >= len(tokens) {
			continue
		}
		next := tokens[index+1]
		if !isQualityWord(next) || !qualityArticleNouns[next.Lower] || isPluralQualityNoun(next.Lower) {
			continue
		}
		gap := text[token.End:next.Start]
		if gap == "" || strings.ContainsAny(gap, ".!?;:\n") {
			continue
		}
		suggestions = append(suggestions, qualitySuggestion{
			Start: qualityUTF16Offset(text, next.Start), End: qualityUTF16Offset(text, next.End),
			Replacement: qualityIndefiniteArticle(next.Lower) + " " + next.Text, Category: "missing-word", Confidence: 0.76, Source: "quality-sidecar",
			Message: fmt.Sprintf("A missing article may be needed before %q.", next.Text),
		})
	}
	return suggestions
}

// headsRelativeClause reports whether the token at index is the kind of noun
// phrase a relative clause attaches to: either preceded by a determiner, or an
// indefinite pronoun that takes one directly.
func headsRelativeClause(tokens []qualityToken, index int) bool {
	head := tokens[index]
	if qualityIndefinitePronouns[head.Lower] {
		return true
	}
	if index == 0 {
		return false
	}
	previous := tokens[index-1]
	return previous.Sentence == head.Sentence && qualityDeterminers[previous.Lower]
}

func startsWithUppercase(value string) bool {
	for _, r := range value {
		return unicode.IsUpper(r)
	}
	return false
}

type qualityStyleGuideRule struct {
	ID           string
	Kind         string
	Match        string
	Replacement  string
	Alternatives []string
	Message      string
	Section      string
}

// analyzeQualityStyleGuide is intentionally fed only approved contextual rows
// from the active guide. Hard replacements stay in the LanguageTool XML pack;
// draft, disabled, and do-not-activate rows never reach this path.
func analyzeQualityStyleGuide(text string) []qualitySuggestion {
	rules := loadActiveQualityStyleGuideRules()
	suggestions := make([]qualitySuggestion, 0)
	for _, rule := range rules {
		for _, position := range qualityStyleGuideMatchPositions(text, rule.Match) {
			replacement := rule.Replacement
			if replacement == "" && len(rule.Alternatives) > 0 {
				replacement = rule.Alternatives[0]
			}
			message := rule.Message
			if message == "" {
				if rule.Kind == "do_not_equate" {
					message = fmt.Sprintf("The active style guide distinguishes %q; verify that this term is appropriate here.", rule.Match)
				} else if replacement != "" {
					message = fmt.Sprintf("Prefer %q instead of %q in this context.", replacement, rule.Match)
				} else {
					message = fmt.Sprintf("Review the style-guide guidance for %q in this context.", rule.Match)
				}
			}
			if rule.Section != "" {
				message = "In " + rule.Section + ": " + message
			}
			confidence := 0.78
			suggestions = append(suggestions, qualitySuggestion{
				Start:       qualityUTF16Offset(text, position[0]),
				End:         qualityUTF16Offset(text, position[1]),
				Replacement: replacement,
				Category:    "style-guide",
				Message:     message,
				Confidence:  confidence,
				Source:      "style-guide-sidecar",
			})
		}
	}
	return suggestions
}

func loadActiveQualityStyleGuideRules() []qualityStyleGuideRule {
	selection, err := loadStyleGuideSelection()
	if err != nil || !selection.Enabled {
		return nil
	}
	guide, err := loadActiveStyleGuide()
	if err != nil {
		return nil
	}
	rows, err := loadStyleGuideReviewRows(guide.ID)
	if err != nil {
		return nil
	}
	rules := make([]qualityStyleGuideRule, 0)
	for _, row := range rows {
		if strings.ToLower(strings.TrimSpace(row.Status)) != "approved" {
			continue
		}
		kind := normalizeStyleGuideRuleKind(row.Kind)
		if kind != "contextual_preference" && kind != "do_not_equate" {
			continue
		}
		match := strings.TrimSpace(row.Match)
		if match == "" || strings.ContainsAny(match, "\r\n<>") || len(strings.Fields(match)) > 8 {
			continue
		}
		replacement := strings.TrimSpace(row.Replacement)
		if replacement != "" && strings.ContainsAny(replacement, "\r\n<>") {
			continue
		}
		alternatives := make([]string, 0, len(row.Alternatives))
		for _, alternative := range row.Alternatives {
			alternative = strings.TrimSpace(alternative)
			if alternative != "" && !strings.ContainsAny(alternative, "\r\n<>") {
				alternatives = append(alternatives, alternative)
			}
		}
		if kind == "contextual_preference" && replacement == "" && len(alternatives) == 0 {
			continue
		}
		rules = append(rules, qualityStyleGuideRule{
			ID: row.ID, Kind: kind, Match: match, Replacement: replacement,
			Alternatives: alternatives, Message: strings.TrimSpace(row.Message), Section: strings.TrimSpace(row.Section),
		})
	}
	return rules
}

func qualityStyleGuideMatchPositions(text, match string) [][2]int {
	match = strings.TrimSpace(match)
	if match == "" {
		return nil
	}
	lowerText := strings.ToLower(text)
	lowerMatch := strings.ToLower(match)
	positions := make([][2]int, 0)
	for cursor := 0; cursor < len(lowerText); {
		relative := strings.Index(lowerText[cursor:], lowerMatch)
		if relative < 0 {
			break
		}
		start := cursor + relative
		end := start + len(match)
		if qualityStyleGuideBoundary(text, start, true) && qualityStyleGuideBoundary(text, end, false) {
			positions = append(positions, [2]int{start, end})
		}
		cursor = end
	}
	return positions
}

func qualityStyleGuideBoundary(text string, offset int, start bool) bool {
	if start {
		if offset == 0 {
			return true
		}
		_, size := utf8.DecodeLastRuneInString(text[:offset])
		last, _ := utf8.DecodeLastRuneInString(text[:offset])
		return !unicode.IsLetter(last) && !unicode.IsDigit(last) && size > 0
	}
	if offset >= len(text) {
		return true
	}
	next, _ := utf8.DecodeRuneInString(text[offset:])
	return !unicode.IsLetter(next) && !unicode.IsDigit(next)
}

func qualityRangesOverlap(startA, endA, startB, endB int) bool {
	return startA < endB && startB < endA
}

func tokenizeQualityText(text string) []qualityToken {
	matches := qualityTokenPattern.FindAllStringIndex(text, -1)
	tokens := make([]qualityToken, 0, len(matches))
	sentence, paragraph := 0, 0
	lastEnd := 0
	for _, match := range matches {
		if strings.Contains(text[lastEnd:match[0]], "\n\n") {
			paragraph++
		}
		value := text[match[0]:match[1]]
		token := qualityToken{
			Text:      value,
			Lower:     strings.ToLower(value),
			Start:     match[0],
			End:       match[1],
			Sentence:  sentence,
			Paragraph: paragraph,
		}
		tokens = append(tokens, token)
		if value == "." || value == "!" || value == "?" {
			sentence++
		}
		lastEnd = match[1]
	}
	return tokens
}

func qualityUTF16Offset(text string, byteOffset int) int {
	units := 0
	for _, r := range text[:byteOffset] {
		if r > 0xFFFF {
			units += 2
		} else {
			units++
		}
	}
	return units
}

func qualityOccurrencePair(text string, first, second qualityToken) []qualityOccurrence {
	occurrences := []qualityOccurrence{
		{Start: qualityUTF16Offset(text, first.Start), End: qualityUTF16Offset(text, first.End), Text: first.Text},
		{Start: qualityUTF16Offset(text, second.Start), End: qualityUTF16Offset(text, second.End), Text: second.Text},
	}
	if occurrences[0].Start > occurrences[1].Start {
		occurrences[0], occurrences[1] = occurrences[1], occurrences[0]
	}
	return occurrences
}

func isQualityWord(token qualityToken) bool {
	if token.Text == "" {
		return false
	}
	r, _ := utf8FirstRune(token.Text)
	return unicode.IsLetter(r) || unicode.IsDigit(r)
}

func utf8FirstRune(value string) (rune, int) {
	return utf8.DecodeRuneInString(value)
}

func isQualityContentWord(token qualityToken, tokens []qualityToken, index int) bool {
	if !isQualityWord(token) || qualityStopWords[token.Lower] || len([]rune(token.Lower)) < 4 {
		return false
	}
	if qualityPronouns[token.Lower] || isLikelyQualityNoun(token, tokens, index) {
		return false
	}
	return true
}

func isLikelyQualityNoun(token qualityToken, tokens []qualityToken, index int) bool {
	if qualityPronouns[token.Lower] {
		return false
	}
	if qualityVerbForms[token.Lower] {
		return false
	}
	if index > 0 && tokens[index-1].Sentence == token.Sentence && qualityDeterminers[tokens[index-1].Lower] {
		return true
	}
	if strings.HasSuffix(token.Lower, "tion") || strings.HasSuffix(token.Lower, "ment") ||
		strings.HasSuffix(token.Lower, "ness") || strings.HasSuffix(token.Lower, "ity") ||
		strings.HasSuffix(token.Lower, "ance") || strings.HasSuffix(token.Lower, "ence") ||
		strings.HasSuffix(token.Lower, "ship") || strings.HasSuffix(token.Lower, "ism") {
		return true
	}
	if strings.HasSuffix(token.Lower, "s") && !strings.HasSuffix(token.Lower, "ss") &&
		!strings.HasSuffix(token.Lower, "us") && !strings.HasSuffix(token.Lower, "is") {
		return true
	}
	return false
}

func sameQualityWindow(current, previous qualityToken, index int, tokens []qualityToken) bool {
	return current.Paragraph == previous.Paragraph && index > 0 &&
		index-1 >= 0 && current.Start >= previous.Start && index-findQualityTokenIndex(tokens, previous) <= qualityWindowTokens
}

func findQualityTokenIndex(tokens []qualityToken, target qualityToken) int {
	for i := len(tokens) - 1; i >= 0; i-- {
		if tokens[i].Start == target.Start && tokens[i].End == target.End {
			return i
		}
	}
	return len(tokens)
}

func findQualityAntecedent(tokens []qualityToken, pronounIndex int) (qualityToken, float64, bool) {
	pronoun := tokens[pronounIndex]
	for i := pronounIndex - 1; i >= 0 && pronounIndex-i <= 40; i-- {
		candidate := tokens[i]
		if candidate.Paragraph != pronoun.Paragraph || qualityPronouns[candidate.Lower] || !isLikelyQualityNoun(candidate, tokens, i) {
			continue
		}
		confidence := 0.55
		if candidate.Sentence == pronoun.Sentence {
			confidence = 0.82
		}
		return candidate, confidence, true
	}
	return qualityToken{}, 0, false
}

func antecedentAgreement(pronoun, antecedent string) string {
	pluralAntecedent := isPluralQualityNoun(antecedent)
	pluralPronoun := pronoun == "they" || pronoun == "them" || pronoun == "their" || pronoun == "theirs"
	singularPronoun := pronoun == "it" || pronoun == "its" || pronoun == "itself"
	if (pluralAntecedent && singularPronoun) || (!pluralAntecedent && pluralPronoun) {
		return "number"
	}
	return ""
}

func isPluralQualityNoun(word string) bool {
	if qualityIrregularPlurals[word] {
		return true
	}
	return strings.HasSuffix(word, "s") && !strings.HasSuffix(word, "ss") &&
		!strings.HasSuffix(word, "us") && !strings.HasSuffix(word, "is") && !qualityVerbForms[word]
}

func pronounAgreementReplacement(pronoun, antecedent string) string {
	if isPluralQualityNoun(antecedent) {
		switch pronoun {
		case "it":
			return "they"
		case "its":
			return "their"
		case "itself":
			return "themselves"
		}
	}
	switch pronoun {
	case "they", "them":
		return "it"
	case "their", "theirs":
		return "its"
	default:
		return ""
	}
}

package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

const defaultQualityPort = "8098"
const qualityWindowTokens = 80

var qualityTokenPattern = regexp.MustCompile(`(?i)[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*|[.!?]`)

type qualityRequest struct {
	Text     string `json:"text"`
	Language string `json:"language,omitempty"`
	Mode     string `json:"mode,omitempty"`
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

// qualityTransformerBackend keeps the gateway independent from the inference
// runtime. The current implementation is HTTP; a future ONNX backend can
// implement this interface without changing the response-merging logic.
type qualityTransformerBackend interface {
	Analyze(text string) (qualityResponse, error)
}

type qualityHTTPTransformer struct {
	URL    string
	Client *http.Client
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

var qualityPassiveAdjectiveForms = map[string]bool{
	"concerned": true, "convinced": true, "excited": true, "interested": true,
	"married": true, "pleased": true, "related": true, "satisfied": true,
	"surprised": true, "tired": true, "worried": true,
}

func runQualityServer() {
	port := qualityServerPort()

	var transformerProcess *exec.Cmd
	if qualityTransformerRequested() && strings.TrimSpace(os.Getenv("IKMAL_TRANSFORMER_URL")) == "" {
		transformerProcess = startManagedQualityTransformer()
		if transformerProcess != nil {
			os.Setenv("IKMAL_TRANSFORMER_URL", "http://127.0.0.1:"+qualityTransformerPort()+"/v1/analyze")
		}
	}
	if transformerProcess != nil {
		defer stopManagedQualityTransformer(transformerProcess)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", qualityHealthHandler)
	mux.HandleFunc("/v1/analyze", qualityAnalyzeHandler)

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

func qualityTransformerRequested() bool {
	if value := strings.TrimSpace(os.Getenv("IKMAL_QUALITY_TRANSFORMER")); value != "" && value != "0" && value != "false" {
		return true
	}
	for _, argument := range os.Args[2:] {
		if argument == "--quality-transformer" || argument == "--with-transformer" || argument == "quality-transformer" {
			return true
		}
	}
	return false
}

func qualityTransformerPort() string {
	if port := strings.TrimSpace(os.Getenv("IKMAL_TRANSFORMER_PORT")); port != "" {
		return port
	}
	return "8099"
}

func startManagedQualityTransformer() *exec.Cmd {
	qualityDir, adapterPath := qualityRuntimePaths()
	transformerPackage := filepath.Join(qualityDir, "node_modules", "@huggingface", "transformers")
	if _, err := os.Stat(adapterPath); os.IsNotExist(err) || os.Getenv("IKMAL_QUALITY_FORCE_SETUP") == "1" {
		// Setup installs third-party code and model weights, so it asks first
		// even on this implicit path. Declining leaves the deterministic
		// checks running rather than failing the server.
		fmt.Println("Managed transformer runtime is not set up.")
		runQualitySetup()
	}
	if _, err := os.Stat(adapterPath); err != nil {
		fmt.Println("Continuing with deterministic quality checks only.")
		return nil
	}
	if _, err := os.Stat(transformerPackage); err != nil {
		fmt.Println("Managed transformer dependencies are unavailable; run --quality-setup first.")
		return nil
	}
	nodePath := findQualityExecutable("node")
	if nodePath == "" {
		fmt.Println("Node.js was not found; continuing with deterministic quality checks.")
		return nil
	}

	command := exec.Command(nodePath, adapterPath)
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	if os.Getenv("IKMAL_TRANSFORMER_CACHE_DIR") == "" {
		cacheDir := filepath.Join(filepath.Dir(qualityDir), "models")
		command.Env = append(os.Environ(), "IKMAL_TRANSFORMER_CACHE_DIR="+cacheDir)
	}
	if err := command.Start(); err != nil {
		fmt.Printf("Could not start managed transformer: %v\n", err)
		return nil
	}

	endpoint := "http://127.0.0.1:" + qualityTransformerPort() + "/health"
	client := &http.Client{Timeout: 300 * time.Millisecond}
	for attempt := 0; attempt < 40; attempt++ {
		response, err := client.Get(endpoint)
		if err == nil {
			response.Body.Close()
			if response.StatusCode == http.StatusOK {
				fmt.Println("Managed Transformers.js/ONNX adapter is ready on port " + qualityTransformerPort())
				return command
			}
		}
		time.Sleep(250 * time.Millisecond)
	}
	fmt.Println("Managed transformer did not become ready; continuing with deterministic quality checks.")
	_ = command.Process.Kill()
	_ = command.Wait()
	return nil
}

func stopManagedQualityTransformer(command *exec.Cmd) {
	if command == nil || command.Process == nil {
		return
	}
	_ = command.Process.Kill()
	_ = command.Wait()
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

	response := analyzeQualityTextWithTransformer(request.Text)
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

func analyzeQualityText(text string) qualityResponse {
	tokens := tokenizeQualityText(text)
	suggestions := make([]qualitySuggestion, 0)
	antecedents := make([]qualityAntecedent, 0)

	lastContent := make(map[string]qualityToken)
	lastFamily := make(map[string]qualityToken)
	for i, token := range tokens {
		if !isQualityWord(token) {
			continue
		}

		if qualityPronouns[token.Lower] {
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

		if isQualityContentWord(token, tokens, i) {
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

	suggestions = append(suggestions, analyzeQualityHomophones(text, tokens)...)
	suggestions = append(suggestions, analyzeQualitySentenceStructure(text, tokens)...)
	suggestions = append(suggestions, analyzeQualityMissingArticles(text, tokens)...)
	suggestions = append(suggestions, analyzeQualityPassiveVoice(text, tokens)...)
	suggestions = append(suggestions, analyzeQualityStyleGuide(text)...)

	return qualityResponse{
		Backend:     "deterministic",
		Suggestions: suggestions,
		Antecedents: antecedents,
	}
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

		byAgent := passiveHasByAgent(tokens, participleIndex)
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
		suggestions = append(suggestions, qualitySuggestion{
			Start:      qualityUTF16Offset(text, start),
			End:        qualityUTF16Offset(text, participle.End),
			Category:   "passive-voice",
			Message:    message,
			Confidence: confidence,
			Source:     "quality-sidecar",
		})
	}
	return suggestions
}

func passiveHasByAgent(tokens []qualityToken, participleIndex int) bool {
	for index := participleIndex + 1; index < len(tokens) && index <= participleIndex+8; index++ {
		token := tokens[index]
		if token.Sentence != tokens[participleIndex].Sentence {
			break
		}
		if token.Text == "." || token.Text == "!" || token.Text == "?" {
			break
		}
		if token.Lower == "by" {
			return true
		}
	}
	return false
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

func analyzeQualityTextWithTransformer(text string) qualityResponse {
	local := analyzeQualityText(text)
	backend := configuredQualityTransformer()
	if backend == nil {
		return local
	}

	remote, err := backend.Analyze(text)
	if err != nil {
		return local
	}
	for i := range remote.Suggestions {
		if remote.Suggestions[i].Source == "" {
			remote.Suggestions[i].Source = "transformer"
		}
	}
	local.Suggestions = mergeQualitySuggestions(local.Suggestions, remote.Suggestions)
	local.Antecedents = mergeQualityAntecedents(local.Antecedents, remote.Antecedents)
	local.Backend = "deterministic+transformer"
	return local
}

func configuredQualityTransformer() qualityTransformerBackend {
	transformerURL := strings.TrimSpace(os.Getenv("IKMAL_TRANSFORMER_URL"))
	if transformerURL == "" {
		return nil
	}
	return qualityHTTPTransformer{
		URL:    transformerURL,
		Client: &http.Client{Timeout: 3 * time.Second},
	}
}

func (backend qualityHTTPTransformer) Analyze(text string) (qualityResponse, error) {
	payload, err := json.Marshal(qualityRequest{Text: text, Language: "en-US", Mode: "check"})
	if err != nil {
		return qualityResponse{}, err
	}
	client := backend.Client
	if client == nil {
		client = &http.Client{Timeout: 3 * time.Second}
	}
	response, err := client.Post(backend.URL, "application/json", bytes.NewReader(payload))
	if err != nil {
		return qualityResponse{}, err
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return qualityResponse{}, fmt.Errorf("transformer returned HTTP %s", response.Status)
	}

	body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return qualityResponse{}, err
	}
	var remote qualityResponse
	if err := json.Unmarshal(body, &remote); err != nil {
		return qualityResponse{}, err
	}
	return remote, nil
}

func mergeQualitySuggestions(local, remote []qualitySuggestion) []qualitySuggestion {
	merged := append([]qualitySuggestion{}, local...)
	for _, candidate := range remote {
		overlaps := false
		for _, existing := range local {
			if existing.Category == candidate.Category && qualityRangesOverlap(existing.Start, existing.End, candidate.Start, candidate.End) {
				overlaps = true
				break
			}
		}
		if !overlaps {
			merged = append(merged, candidate)
		}
	}
	return merged
}

func mergeQualityAntecedents(local, remote []qualityAntecedent) []qualityAntecedent {
	merged := append([]qualityAntecedent{}, local...)
	for _, candidate := range remote {
		duplicate := false
		for _, existing := range local {
			if existing.Start == candidate.Start && existing.End == candidate.End {
				duplicate = true
				break
			}
		}
		if !duplicate {
			merged = append(merged, candidate)
		}
	}
	return merged
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

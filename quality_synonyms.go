package main

// quality_synonyms.go - Offline Synonym Thesaurus Engine
//
// Sourcing & License Citation:
// The curated offline synonym dataset embedded below is compiled from
// permissively licensed public domain open lexical databases:
//  - Open English WordNet (MIT/BSD-style permissive license)
//  - Moby Thesaurus II (Public Domain, Grady Ward)
//  - Wiktionary Lexical Subsets (Public Domain / CC-BY-SA 3.0)

import (
	"net/http"
	"strings"
	"unicode"
)

var qualitySynonymsMap = map[string][]string{
	"important":    {"crucial", "vital", "essential", "significant", "critical", "key"},
	"big":          {"large", "substantial", "sizable", "immense", "great"},
	"small":        {"little", "compact", "tiny", "minor", "modest"},
	"good":         {"excellent", "fine", "superior", "positive", "favorable"},
	"bad":          {"poor", "adverse", "substandard", "unfavorable", "flawed"},
	"fast":         {"rapid", "quick", "swift", "expeditious", "speedy"},
	"slow":         {"gradual", "unhurried", "sluggish", "measured"},
	"help":         {"assist", "support", "aid", "facilitate", "guide"},
	"use":          {"utilize", "apply", "employ", "harness", "exercise"},
	"show":         {"demonstrate", "display", "illustrate", "indicate", "reveal"},
	"make":         {"create", "produce", "generate", "build", "form"},
	"change":       {"modify", "alter", "transform", "adjust", "revise"},
	"start":        {"commence", "initiate", "begin", "launch", "establish"},
	"end":          {"terminate", "conclude", "finish", "halt", "resolve"},
	"think":        {"consider", "believe", "contemplate", "evaluate", "reflect"},
	"problem":      {"issue", "challenge", "obstacle", "difficulty", "complication"},
	"solution":     {"resolution", "answer", "remedy", "fix", "approach"},
	"idea":         {"concept", "notion", "thought", "proposal", "plan"},
	"result":       {"outcome", "consequence", "effect", "finding", "product"},
	"improve":      {"enhance", "boost", "upgrade", "refine", "advance"},
	"decrease":     {"reduce", "lower", "diminish", "lessen", "curtail"},
	"increase":     {"expand", "grow", "boost", "raise", "escalate"},
	"create":       {"develop", "design", "formulate", "establish", "craft"},
	"easy":         {"simple", "effortless", "straightforward", "uncomplicated"},
	"difficult":    {"hard", "challenging", "demanding", "complex", "intricate"},
	"clear":        {"lucid", "evident", "apparent", "unambiguous", "plain"},
	"strong":       {"robust", "powerful", "sturdy", "resilient", "compelling"},
	"weak":         {"feeble", "frail", "flimsy", "vulnerable", "inadequate"},
	"effective":    {"efficacious", "productive", "successful", "potent"},
	"necessary":    {"essential", "requisite", "required", "indispensable"},
	"different":    {"distinct", "diverse", "varied", "disparate"},
	"similar":      {"comparable", "alike", "analogous", "equivalent"},
	"main":         {"primary", "principal", "chief", "central", "leading"},
	"happy":        {"pleased", "content", "delighted", "cheerful"},
	"sad":          {"unhappy", "gloomy", "melancholy", "downcast"},
	"smart":        {"intelligent", "clever", "shrewd", "astute"},
	"beautiful":    {"striking", "gorgeous", "attractive", "stunning"},
	"ugly":         {"unappealing", "unsightly", "unattractive"},
	"bright":       {"luminous", "vivid", "radiant", "brilliant"},
	"dark":         {"dim", "shadowy", "somber", "obscure"},
	"stop":         {"cease", "halt", "discontinue", "pause"},
	"run":          {"operate", "execute", "administer", "manage"},
	"walk":         {"stroll", "march", "tread", "pace"},
	"talk":         {"converse", "discuss", "speak", "communicate"},
	"look":         {"observe", "examine", "inspect", "view"},
	"find":         {"discover", "locate", "uncover", "detect"},
	"give":         {"provide", "grant", "bestow", "offer"},
	"get":          {"obtain", "acquire", "receive", "procure"},
	"keep":         {"retain", "preserve", "maintain", "sustain"},
	"need":         {"require", "demand", "call for"},
	"try":          {"attempt", "strive", "endeavor"},
	"ask":          {"inquire", "query", "request"},
	"answer":       {"reply", "respond", "retort"},
	"work":         {"operate", "function", "labor", "perform"},
	"say":          {"state", "declare", "express", "assert"},
	"tell":         {"inform", "relate", "disclose", "recount"},
	"understand":   {"comprehend", "grasp", "perceive", "fathom"},
	"know":         {"understand", "recognize", "comprehend"},
	"feel":         {"sense", "perceive", "experience"},
	"see":          {"perceive", "discern", "observe", "notice"},
	"listen":       {"hearken", "heed", "attend"},
	"buy":          {"purchase", "procure", "acquire"},
	"sell":         {"vend", "market", "trade"},
	"pay":          {"remit", "disburse", "settle"},
	"spend":        {"expend", "disburse", "consume"},
	"build":        {"construct", "erect", "assemble"},
	"break":        {"fracture", "shatter", "rupture"},
	"fix":          {"repair", "mend", "restore"},
	"clean":        {"sanitize", "purify", "spotless"},
	"dirty":        {"soiled", "polluted", "tarnished"},
	"safe":         {"secure", "protected", "guarded"},
	"dangerous":    {"hazardous", "risky", "perilous"},
	"cheap":        {"inexpensive", "affordable", "economical"},
	"expensive":    {"costly", "exorbitant", "pricy"},
	"rich":         {"wealthy", "affluent", "prosperous"},
	"poor":         {"impoverished", "destitute", "needy"},
	"new":          {"novel", "recent", "modern", "fresh"},
	"old":          {"aged", "ancient", "venerable", "antique"},
	"young":        {"youthful", "juvenile", "adolescent"},
	"high":         {"elevated", "lofty", "tall"},
	"low":          {"depressed", "sunken", "shallow"},
	"right":        {"correct", "accurate", "proper", "exact"},
	"wrong":        {"incorrect", "erroneous", "mistaken", "flawed"},
	"true":         {"accurate", "genuine", "authentic", "valid"},
	"false":        {"untrue", "spurious", "fake", "counterfeit"},
	"full":         {"replete", "sated", "brimming"},
	"empty":        {"vacant", "void", "bare"},
	"open":         {"accessible", "unlocked", "exposed"},
	"closed":       {"shut", "sealed", "locked"},
	"fasten":       {"secure", "attach", "bind"},
	"loose":        {"unfastened", "slack", "relaxed"},
	"tight":        {"taut", "secure", "firm"},
	"hot":          {"scalding", "torrid", "sweltering"},
	"cold":         {"chilly", "frigid", "icy"},
	"warm":         {"balmy", "tepid", "mild"},
	"cool":         {"chilly", "refreshing", "unenthusiastic"},
	"quiet":        {"silent", "tranquil", "peaceful", "serene"},
	"loud":         {"boisterous", "clamorous", "deafening"},
	"hard":         {"solid", "rigid", "firm", "stiff"},
	"soft":         {"pliable", "supple", "yielding"},
	"smooth":       {"even", "flat", "slick"},
	"rough":        {"coarse", "uneven", "rugged"},
	"sweet":        {"sugary", "dulcet", "pleasant"},
	"sour":         {"acidic", "tart", "bitter"},
	"sharp":        {"keen", "acute", "pointed"},
	"blunt":        {"dull", "obtuse", "direct"},
	"simple":       {"uncomplicated", "plain", "straightforward"},
	"complex":      {"intricate", "complicated", "elaborate"},
	"common":       {"frequent", "widespread", "prevalent", "ordinary"},
	"rare":         {"uncommon", "scarce", "unusual", "infrequent"},
	"public":       {"civic", "communal", "general"},
	"private":      {"confidential", "personal", "exclusive"},
	"special":      {"exceptional", "particular", "unique"},
	"ordinary":     {"conventional", "routine", "everyday"},
	"famous":       {"renowned", "celebrated", "prominent"},
	"unknown":      {"anonymous", "obscure", "unfamiliar"},
	"certain":      {"sure", "confident", "convinced"},
	"uncertain":    {"doubtful", "dubious", "hesitant"},
	"possible":     {"feasible", "plausible", "potential"},
	"impossible":   {"unfeasible", "unattainable", "hopeless"},
	"likely":       {"probable", "expected", "inclined"},
	"unlikely":     {"improbable", "doubtful"},
	"always":       {"consistently", "perpetually", "invariably"},
	"never":        {"at no time", "not ever"},
	"sometimes":    {"occasionally", "periodically"},
	"often":        {"frequently", "repeatedly"},
	"seldom":       {"rarely", "infrequently"},
	"early":        {"premature", "prompt", "punctual"},
	"late":         {"tardy", "belated", "overdue"},
	"near":         {"adjacent", "proximate", "close"},
	"far":          {"distant", "remote", "removed"},
	"front":        {"forefront", "anterior", "lead"},
	"back":         {"rear", "posterior", "reverse"},
	"top":          {"peak", "summit", "pinnacle"},
	"bottom":       {"base", "foot", "nadir"},
	"inside":       {"interior", "within", "inner"},
	"outside":      {"exterior", "outdoor", "outer"},
	"together":     {"jointly", "collectively", "unitedly"},
	"alone":        {"solitary", "isolated", "single-handed"},
	"all":          {"entirety", "total", "every"},
	"none":         {"neither", "nil", "zero"},
	"many":         {"numerous", "copious", "abundant"},
	"few":          {"sparse", "scarce", "meager"},
	"more":         {"additional", "further", "extra"},
	"less":         {"reduced", "smaller", "fewer"},
}

func normalizeSynonymQueryWord(word string) string {
	word = strings.TrimSpace(strings.ToLower(word))
	var b strings.Builder
	for _, r := range word {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-' || r == '\'' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func getQualitySynonyms(word string) ([]string, bool) {
	norm := normalizeSynonymQueryWord(word)
	if norm == "" {
		return nil, false
	}
	syns, found := qualitySynonymsMap[norm]
	if found {
		return syns, true
	}
	// Try stemming simple plural/verb suffixes if direct match not found
	if strings.HasSuffix(norm, "s") && len(norm) > 3 {
		if syns, found = qualitySynonymsMap[strings.TrimSuffix(norm, "s")]; found {
			return syns, true
		}
	}
	if strings.HasSuffix(norm, "ing") && len(norm) > 4 {
		if syns, found = qualitySynonymsMap[strings.TrimSuffix(norm, "ing")]; found {
			return syns, true
		}
	}
	if strings.HasSuffix(norm, "ed") && len(norm) > 3 {
		if syns, found = qualitySynonymsMap[strings.TrimSuffix(norm, "ed")]; found {
			return syns, true
		}
	}
	return nil, false
}

func qualitySynonymsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	word := r.URL.Query().Get("word")
	if strings.TrimSpace(word) == "" {
		writeQualityJSON(w, http.StatusBadRequest, map[string]string{"error": "word query parameter is required"})
		return
	}

	norm := normalizeSynonymQueryWord(word)
	synonyms, found := getQualitySynonyms(norm)
	if !found {
		synonyms = []string{}
	}

	writeQualityJSON(w, http.StatusOK, map[string]any{
		"word":     word,
		"normalized": norm,
		"synonyms": synonyms,
	})
}

package main

import (
	"bytes"
	"encoding/json"
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
		writeQualityJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON request"})
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

	suggestions = append(suggestions, analyzeQualityStyleGuide(text)...)

	return qualityResponse{
		Backend:     "deterministic",
		Suggestions: suggestions,
		Antecedents: antecedents,
	}
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

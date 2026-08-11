package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"sort"
	"strconv"
	"strings"
	"time"
)

const defaultQualityProxyPort = "8096"

type qualityProxy struct {
	languageToolURL string
	qualityURL      string
	client          *http.Client
}

type qualityProxyCandidate struct {
	Match       map[string]any
	Start       int
	End         int
	Replacement string
	Confidence  float64
	Native      bool
	Related     []map[string]any
}

type styleGuideSummary struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	SourceType string `json:"sourceType,omitempty"`
	ImportedAt string `json:"importedAt,omitempty"`
	EntryCount int    `json:"entryCount"`
	RuleCount  int    `json:"ruleCount,omitempty"`
	Active     bool   `json:"active"`
}

type styleGuideStateResponse struct {
	Guides   []styleGuideSummary `json:"guides"`
	ActiveID string              `json:"activeId,omitempty"`
	Enabled  bool                `json:"enabled"`
}

func runQualityProxy() {
	var qualityProcess *exec.Cmd
	if !qualityEndpointReady() {
		qualityProcess = startManagedQualityServer()
	}
	if qualityProcess != nil {
		defer stopManagedQualityTransformer(qualityProcess)
	}

	proxy := qualityProxy{
		languageToolURL: qualityProxyLanguageToolURL(),
		qualityURL:      qualityProxyQualityURL(),
		client:          &http.Client{Timeout: 5 * time.Second},
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", proxy.healthHandler)
	mux.HandleFunc("/v2", proxy.forwardHandler)
	mux.HandleFunc("/v2/check", proxy.checkHandler)
	mux.HandleFunc("/v2/languages", proxy.forwardHandler)
	mux.HandleFunc("/v1/style-guides", styleGuideStateHandler)
	mux.HandleFunc("/v1/style-guide/select", styleGuideSelectHandler)
	mux.HandleFunc("/v1/style-guide/enabled", styleGuideEnabledHandler)

	port := os.Getenv("IKMAL_QUALITY_PROXY_PORT")
	if port == "" {
		port = defaultQualityProxyPort
	}
	host := strings.TrimSpace(os.Getenv("IKMAL_BIND_HOST"))
	if host == "" {
		host = "127.0.0.1"
	}
	addr := host + ":" + port
	warnIfNotLoopback("quality proxy", host)
	fmt.Printf("ikmal LanguageTool quality proxy listening on http://%s\n", addr)
	if err := http.ListenAndServe(addr, qualityCORS(mux)); err != nil {
		fmt.Printf("Quality proxy stopped: %v\n", err)
	}
}

func styleGuideStateHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	guides, err := loadStyleGuides()
	if err != nil && !os.IsNotExist(err) {
		writeQualityJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	selection, selectionErr := loadStyleGuideSelection()
	if selectionErr != nil && !os.IsNotExist(selectionErr) {
		writeQualityJSON(w, http.StatusInternalServerError, map[string]string{"error": selectionErr.Error()})
		return
	}

	state := styleGuideStateResponse{Guides: make([]styleGuideSummary, 0, len(guides))}
	for _, guide := range guides {
		active := guide.ID == selection.GuideID
		state.Guides = append(state.Guides, styleGuideSummary{
			ID:         guide.ID,
			Name:       guide.Name,
			SourceType: guide.SourceType,
			ImportedAt: guide.ImportedAt,
			EntryCount: len(guide.Entries),
			RuleCount:  guide.RuleCount,
			Active:     active,
		})
		if active {
			state.ActiveID = guide.ID
			state.Enabled = selection.Enabled
		}
	}
	writeQualityJSON(w, http.StatusOK, state)
}

func styleGuideSelectHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var request struct {
		ID string `json:"id"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil || strings.TrimSpace(request.ID) == "" {
		writeQualityRequestError(w, err, "style guide id is required")
		return
	}
	if err := selectStyleGuide(strings.TrimSpace(request.ID)); err != nil {
		status := http.StatusBadRequest
		if os.IsNotExist(err) {
			status = http.StatusNotFound
		}
		writeQualityJSON(w, status, map[string]string{"error": err.Error()})
		return
	}
	styleGuideStateHandler(w, styleGuideStateRequest(r))
}

func styleGuideEnabledHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var request struct {
		Enabled bool `json:"enabled"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeQualityRequestError(w, err, "enabled must be a boolean")
		return
	}
	if err := setStyleGuideEnabled(request.Enabled); err != nil {
		status := http.StatusBadRequest
		if os.IsNotExist(err) {
			status = http.StatusNotFound
		}
		writeQualityJSON(w, status, map[string]string{"error": err.Error()})
		return
	}
	styleGuideStateHandler(w, styleGuideStateRequest(r))
}

// styleGuideStateRequest keeps the management handlers' response shape consistent
// without making a second public state-building function.
func styleGuideStateRequest(r *http.Request) *http.Request {
	request := r.Clone(r.Context())
	request.Method = http.MethodGet
	return request
}

func qualityProxyLanguageToolURL() string {
	if value := strings.TrimSpace(os.Getenv("IKMAL_LANGUAGETOOL_URL")); value != "" {
		return value
	}
	return "http://127.0.0.1:8097/v2/check"
}

func qualityProxyQualityURL() string {
	if value := strings.TrimSpace(os.Getenv("IKMAL_QUALITY_URL")); value != "" {
		return value
	}
	return "http://127.0.0.1:8098/v1/analyze"
}

func (proxy qualityProxy) healthHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	writeQualityJSON(w, http.StatusOK, map[string]any{
		"status":          "ok",
		"backend":         "languagetool+quality",
		"languageToolURL": proxy.languageToolURL,
		"qualityURL":      proxy.qualityURL,
	})
}

func (proxy qualityProxy) checkHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	values, err := parseQualityProxyRequest(r)
	if err != nil {
		proxy.debugRequest(r, values, err)
		writeQualityRequestError(w, err, "invalid form request")
		return
	}
	text := values.Get("text")
	if strings.TrimSpace(text) == "" {
		proxy.debugRequest(r, values, fmt.Errorf("text field missing"))
		writeQualityJSON(w, http.StatusBadRequest, map[string]string{"error": "text is required"})
		return
	}

	languageToolValues := values
	if values.Get("data") != "" {
		languageToolValues = cloneProxyValues(values)
		languageToolValues.Del("text")
	}
	languageToolResponse, languageToolErr := proxy.forwardCheck(r.Context(), languageToolValues)
	qualityResponse, qualityErr := proxy.analyzeQuality(r.Context(), text, values.Get("language"))
	if languageToolErr != nil && qualityErr != nil {
		writeQualityJSON(w, http.StatusBadGateway, map[string]string{
			"error": fmt.Sprintf("LanguageTool and quality services unavailable: %v; %v", languageToolErr, qualityErr),
		})
		return
	}
	if languageToolResponse == nil {
		languageToolResponse = map[string]any{"matches": []any{}}
	}
	if languageToolErr != nil {
		// A check that lost one of its two engines is still worth returning, but
		// silence would present a half-empty result as a complete one: a user
		// whose grammar engine is refusing every request would see a document
		// that reads as clean. The warning travels beside the matches so a host
		// can say which checks are missing.
		languageToolResponse["ikmalLanguageToolWarning"] = languageToolErr.Error()
	}

	native := nativeProxyCandidates(languageToolResponse)
	quality := qualityProxyCandidates(text, qualityResponse)
	languageToolResponse["matches"] = proxyMatches(mergeProxyCandidates(native, quality))
	if qualityErr != nil {
		languageToolResponse["ikmalQualityWarning"] = qualityErr.Error()
	}
	// The warnings above carry the reason, which belongs in a log or a details
	// view. Hosts need to name the missing checks in a sentence, so the same
	// answer travels in a form they can render without parsing an error string.
	if degraded := degradedCheckSources(languageToolErr, qualityErr); len(degraded) > 0 {
		languageToolResponse["ikmalDegradedChecks"] = degraded
	}
	if len(qualityResponse.Antecedents) > 0 {
		languageToolResponse["ikmalAntecedents"] = qualityResponse.Antecedents
	}
	writeQualityJSON(w, http.StatusOK, languageToolResponse)
}

// degradedCheckSources names the engines that did not answer, in the vocabulary
// a host shows a writer rather than the vocabulary of this file.
func degradedCheckSources(languageToolErr, qualityErr error) []string {
	sources := make([]string, 0, 2)
	if languageToolErr != nil {
		sources = append(sources, "grammar")
	}
	if qualityErr != nil {
		sources = append(sources, "quality")
	}
	return sources
}

func cloneProxyValues(values url.Values) url.Values {
	clone := make(url.Values, len(values))
	for key, entries := range values {
		clone[key] = append([]string(nil), entries...)
	}
	return clone
}

func parseQualityProxyRequest(r *http.Request) (url.Values, error) {
	values := make(url.Values)
	if strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			return values, err
		}
		for key, raw := range payload {
			switch value := raw.(type) {
			case string:
				values.Set(key, value)
			case []any:
				for _, item := range value {
					if stringValue, ok := item.(string); ok {
						values.Add(key, stringValue)
					}
				}
			}
		}
		return values, nil
	}
	if err := r.ParseForm(); err != nil {
		return values, err
	}
	values = r.Form
	if values.Get("text") == "" {
		var payload struct {
			Text string `json:"text"`
		}
		if data := values.Get("data"); data != "" && json.Unmarshal([]byte(data), &payload) == nil && payload.Text != "" {
			values.Set("text", payload.Text)
		}
	}
	return values, nil
}

func (proxy qualityProxy) debugRequest(r *http.Request, values url.Values, err error) {
	if os.Getenv("IKMAL_QUALITY_PROXY_DEBUG") != "1" {
		return
	}
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	fmt.Printf("Quality proxy request rejected: method=%s path=%s contentType=%q contentLength=%d keys=%v error=%v\n",
		r.Method, r.URL.Path, r.Header.Get("Content-Type"), r.ContentLength, keys, err)
}

// forwardedHeaders is an allow-list: only these reach the upstream server.
//
// It replaces a deny-list of hop-by-hop names. A deny-list forwards everything
// it has not been told to drop, which meant the calling page's Cookie,
// Authorization, Origin and Referer were passed straight through. That is
// harmless while IKMAL_LANGUAGETOOL_URL points at loopback and a standing
// credential leak the moment it does not — and it is the kind of thing that is
// set once and never revisited. Naming what a spell check actually needs keeps
// any header added to a future browser request out of it by default.
var forwardedHeaders = []string{
	"Accept",
	"Accept-Language",
	"Content-Type",
}

func (proxy qualityProxy) forwardHandler(w http.ResponseWriter, r *http.Request) {
	target, err := url.Parse(proxy.languageToolURL)
	if err != nil {
		writeQualityJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	target.Path = strings.TrimSuffix(target.Path, "/check") + strings.TrimPrefix(r.URL.Path, "/v2")
	target.RawQuery = r.URL.RawQuery
	var body io.Reader
	if r.Body != nil && r.Method != http.MethodGet && r.Method != http.MethodHead {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		payload, readErr := io.ReadAll(r.Body)
		if readErr != nil {
			writeQualityRequestError(w, readErr, "request body is unreadable")
			return
		}
		body = bytes.NewReader(payload)
	}
	request, err := http.NewRequestWithContext(r.Context(), r.Method, target.String(), body)
	if err != nil {
		writeQualityJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	for _, header := range forwardedHeaders {
		if values, ok := r.Header[http.CanonicalHeaderKey(header)]; ok {
			request.Header[http.CanonicalHeaderKey(header)] = append([]string(nil), values...)
		}
	}
	// Accept-Encoding is deliberately absent from the allow-list. Leaving it
	// unset lets Go's Transport request and transparently decompress gzip
	// itself; forwarding the browser's value would disable that, leaving
	// response.Body holding compressed bytes that this handler would copy
	// through under the upstream's Content-Type — a gzip blob labelled
	// application/json, which the caller cannot parse.
	response, err := proxy.client.Do(request)
	if err != nil {
		writeQualityJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	defer response.Body.Close()
	w.Header().Set("Content-Type", response.Header.Get("Content-Type"))
	w.WriteHeader(response.StatusCode)
	_, _ = io.Copy(w, response.Body)
}

func (proxy qualityProxy) forwardCheck(ctx context.Context, values url.Values) (map[string]any, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, proxy.languageToolURL, strings.NewReader(values.Encode()))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := proxy.client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("LanguageTool returned HTTP %s", response.Status)
	}
	var result map[string]any
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result, nil
}

func (proxy qualityProxy) analyzeQuality(ctx context.Context, text, language string) (qualityResponse, error) {
	payload, err := json.Marshal(qualityRequest{Text: text, Language: language, Mode: "check"})
	if err != nil {
		return qualityResponse{}, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, proxy.qualityURL, strings.NewReader(string(payload)))
	if err != nil {
		return qualityResponse{}, err
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := proxy.client.Do(request)
	if err != nil {
		return qualityResponse{}, err
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return qualityResponse{}, fmt.Errorf("quality service returned HTTP %s", response.Status)
	}
	var result qualityResponse
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		return qualityResponse{}, err
	}
	return result, nil
}

func nativeProxyCandidates(response map[string]any) []qualityProxyCandidate {
	values, ok := response["matches"].([]any)
	if !ok {
		return nil
	}
	candidates := make([]qualityProxyCandidate, 0, len(values))
	for _, value := range values {
		match, ok := value.(map[string]any)
		if !ok {
			continue
		}
		start, okStart := proxyNumber(match["offset"])
		length, okLength := proxyNumber(match["length"])
		if !okStart || !okLength || length < 0 {
			continue
		}
		replacement := ""
		if replacements, ok := match["replacements"].([]any); ok && len(replacements) > 0 {
			if first, ok := replacements[0].(map[string]any); ok {
				replacement, _ = first["value"].(string)
			}
		}
		candidates = append(candidates, qualityProxyCandidate{
			Match:       match,
			Start:       start,
			End:         start + length,
			Replacement: replacement,
			Confidence:  1,
			Native:      true,
		})
	}
	return candidates
}

func qualityProxyCandidates(text string, response qualityResponse) []qualityProxyCandidate {
	candidates := make([]qualityProxyCandidate, 0, len(response.Suggestions))
	for _, suggestion := range response.Suggestions {
		match := qualitySuggestionLanguageToolMatch(text, suggestion)
		candidates = append(candidates, qualityProxyCandidate{
			Match:       match,
			Start:       suggestion.Start,
			End:         suggestion.End,
			Replacement: suggestion.Replacement,
			Confidence:  suggestion.Confidence,
		})
	}
	return candidates
}

func qualitySuggestionLanguageToolMatch(text string, suggestion qualitySuggestion) map[string]any {
	replacements := []any{}
	if suggestion.Replacement != "" {
		replacements = append(replacements, map[string]any{"value": suggestion.Replacement})
	}
	ruleID := "IKMAL_" + strings.ToUpper(strings.ReplaceAll(suggestion.Category, "-", "_"))
	categoryID := "GRAMMAR"
	if strings.Contains(suggestion.Category, "style") || strings.Contains(suggestion.Category, "repetition") || strings.Contains(suggestion.Category, "wordiness") {
		categoryID = "STYLE"
	}
	match := map[string]any{
		"message":         suggestion.Message,
		"shortMessage":    "Writing quality",
		"replacements":    replacements,
		"offset":          suggestion.Start,
		"length":          suggestion.End - suggestion.Start,
		"context":         map[string]any{"text": text, "offset": 0, "length": qualityUTF16Offset(text, len(text))},
		"sentence":        text,
		"type":            map[string]any{"typeName": "Other"},
		"rule":            map[string]any{"id": ruleID, "subId": "1", "description": suggestion.Category, "issueType": strings.ToLower(categoryID), "category": map[string]any{"id": categoryID, "name": "Writing quality"}},
		"ikmalSource":     suggestion.Source,
		"ikmalConfidence": suggestion.Confidence,
	}
	if len(suggestion.RelatedOccurrences) > 0 {
		match["ikmalRelatedOccurrences"] = suggestion.RelatedOccurrences
	}
	if suggestion.Antecedent != nil {
		match["ikmalAntecedent"] = suggestion.Antecedent
	}
	return match
}

func mergeProxyCandidates(native, quality []qualityProxyCandidate) []qualityProxyCandidate {
	merged := append([]qualityProxyCandidate{}, native...)
	for _, candidate := range quality {
		conflicts := make([]int, 0)
		for index, existing := range merged {
			if qualityRangesOverlap(existing.Start, existing.End, candidate.Start, candidate.End) {
				conflicts = append(conflicts, index)
			}
		}
		if len(conflicts) == 0 {
			merged = append(merged, candidate)
			continue
		}
		wins := true
		for _, index := range conflicts {
			if !proxyCandidateWins(candidate, merged[index]) {
				wins = false
				break
			}
		}
		if !wins {
			for _, index := range conflicts {
				if proxyCandidateWins(merged[index], candidate) {
					addProxyRelated(&merged[index], candidate)
					for _, finding := range candidate.Related {
						addProxyRelatedEntry(&merged[index], finding)
					}
					break
				}
			}
			continue
		}
		for _, index := range conflicts {
			addProxyRelated(&candidate, merged[index])
			for _, finding := range merged[index].Related {
				addProxyRelatedEntry(&candidate, finding)
			}
		}
		filtered := make([]qualityProxyCandidate, 0, len(merged)-len(conflicts)+1)
		conflictSet := make(map[int]bool, len(conflicts))
		for _, index := range conflicts {
			conflictSet[index] = true
		}
		for index, existing := range merged {
			if !conflictSet[index] {
				filtered = append(filtered, existing)
			}
		}
		filtered = append(filtered, candidate)
		merged = filtered
	}
	sort.SliceStable(merged, func(i, j int) bool {
		if merged[i].Start != merged[j].Start {
			return merged[i].Start < merged[j].Start
		}
		return merged[i].End < merged[j].End
	})
	return merged
}

func proxyCandidateWins(candidate, existing qualityProxyCandidate) bool {
	if existing.Native {
		return false
	}
	if candidate.Native {
		return true
	}
	if candidate.Start <= existing.Start && candidate.End >= existing.End &&
		(candidate.Start < existing.Start || candidate.End > existing.End) {
		return true
	}
	if existing.Start <= candidate.Start && existing.End >= candidate.End &&
		(existing.Start < candidate.Start || existing.End > candidate.End) {
		return false
	}
	if candidate.Replacement == existing.Replacement {
		return candidate.Confidence >= existing.Confidence
	}
	return candidate.Confidence > existing.Confidence
}

func proxyMatches(candidates []qualityProxyCandidate) []any {
	matches := make([]any, 0, len(candidates))
	for _, candidate := range candidates {
		if candidate.Match == nil {
			candidate.Match = map[string]any{}
		}
		source := proxyCandidateSource(candidate)
		candidate.Match["ikmalSource"] = source
		sources := []string{source}
		related := make([]any, 0, len(candidate.Related))
		for _, finding := range candidate.Related {
			if relatedSource, ok := finding["source"].(string); ok && relatedSource != "" && !containsString(sources, relatedSource) {
				sources = append(sources, relatedSource)
			}
			related = append(related, finding)
		}
		if len(sources) > 1 {
			candidate.Match["ikmalSources"] = sources
		}
		if len(related) > 0 {
			candidate.Match["ikmalRelated"] = related
		}
		matches = append(matches, candidate.Match)
	}
	return matches
}

func proxyCandidateSource(candidate qualityProxyCandidate) string {
	if source, ok := candidate.Match["ikmalSource"].(string); ok && source != "" {
		return source
	}
	if candidate.Native {
		return "LanguageTool"
	}
	return "quality-sidecar"
}

func addProxyRelated(candidate *qualityProxyCandidate, related qualityProxyCandidate) {
	entry := map[string]any{
		"source":      proxyCandidateSource(related),
		"message":     related.Match["message"],
		"replacement": related.Replacement,
		"offset":      related.Start,
		"length":      related.End - related.Start,
	}
	if occurrences, ok := related.Match["ikmalRelatedOccurrences"]; ok {
		entry["occurrences"] = occurrences
	}
	if rule, ok := related.Match["rule"].(map[string]any); ok {
		if id, ok := rule["id"].(string); ok && id != "" {
			entry["ruleId"] = id
		}
	}
	addProxyRelatedEntry(candidate, entry)
}

func addProxyRelatedEntry(candidate *qualityProxyCandidate, entry map[string]any) {
	key := fmt.Sprintf("%v|%v|%v|%v|%v", entry["source"], entry["message"], entry["offset"], entry["length"], entry["replacement"])
	for _, existing := range candidate.Related {
		existingKey := fmt.Sprintf("%v|%v|%v|%v|%v", existing["source"], existing["message"], existing["offset"], existing["length"], existing["replacement"])
		if key == existingKey {
			return
		}
	}
	candidate.Related = append(candidate.Related, entry)
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func proxyNumber(value any) (int, bool) {
	switch number := value.(type) {
	case float64:
		return int(number), number >= 0
	case int:
		return number, number >= 0
	case json.Number:
		parsed, err := strconv.Atoi(string(number))
		return parsed, err == nil && parsed >= 0
	default:
		return 0, false
	}
}

// qualityServerPort is the single place the sidecar's port is resolved. It had
// been spelled out as a literal here and as defaultQualityPort in
// quality_server.go, so the two could drift and leave the readiness probe
// looking at a port nothing listens on.
func qualityServerPort() string {
	if port := os.Getenv("IKMAL_QUALITY_PORT"); port != "" {
		return port
	}
	return defaultQualityPort
}

func qualityEndpointReady() bool {
	port := qualityServerPort()
	client := &http.Client{Timeout: 300 * time.Millisecond}
	response, err := client.Get("http://127.0.0.1:" + port + "/health")
	if err != nil {
		return false
	}
	defer response.Body.Close()
	return response.StatusCode == http.StatusOK
}

func startManagedQualityServer() *exec.Cmd {
	return startManagedQualityServerWithTransformer(qualityTransformerRequested())
}

func startManagedQualityServerWithTransformer(withTransformer bool) *exec.Cmd {
	// Decline when the endpoint is already served, the way startIntegratedProxy
	// does. Without this the readiness loop below sees another process's answer
	// and reports success for a child that lost the port race and exited at
	// once, which leaves a supervisor restarting a dead process forever.
	if qualityEndpointReady() {
		fmt.Println("Using the existing ikmal quality engine on port " + qualityServerPort() + ".")
		return nil
	}
	args := []string{"--quality-server"}
	if withTransformer {
		args = append(args, "--quality-transformer")
	}
	command := exec.Command(os.Args[0], args...)
	if os.Getenv("IKMAL_QUALITY_PORT") == "" {
		command.Env = append(os.Environ(), "IKMAL_QUALITY_PORT=8098")
	}
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	if err := command.Start(); err != nil {
		fmt.Printf("Could not start managed quality sidecar: %v\n", err)
		return nil
	}
	for attempt := 0; attempt < 40; attempt++ {
		if qualityEndpointReady() {
			return command
		}
		time.Sleep(250 * time.Millisecond)
	}
	fmt.Println("Managed quality sidecar did not become ready; continuing without it.")
	_ = command.Process.Kill()
	_ = command.Wait()
	return nil
}

// warnIfNotLoopback says so, once, when a listener has been pointed beyond the
// machine. Both services answer without authentication and qualityCORS allows
// any origin, so binding to 0.0.0.0 — the documented container path — puts an
// unauthenticated text-processing and style-guide-editing surface on the
// network. That may be exactly what the operator wants inside a container, but
// it should never be something they discover later.
func warnIfNotLoopback(service, host string) {
	switch strings.ToLower(strings.Trim(host, "[]")) {
	case "127.0.0.1", "localhost", "::1":
		return
	}
	fmt.Printf("WARNING: the %s is bound to %s, not loopback. It has no authentication and accepts any origin, so anything that can reach this address can check text and change style guides. Set IKMAL_BIND_HOST=127.0.0.1 to restrict it to this machine.\n", service, host)
}

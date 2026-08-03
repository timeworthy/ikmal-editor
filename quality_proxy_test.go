package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStyleGuideManagementHandlersExposeAndChangeSelection(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("IKMAL_STYLE_GUIDE_DIR", dir)
	guide := styleGuide{
		ID:         "plain-language",
		Name:       "Plain Language",
		SourceType: "markdown",
		ImportedAt: "2026-08-03T00:00:00Z",
		Entries:    []styleGuideEntry{{ID: "one", Text: "Prefer plain language", Kind: "prefer"}},
		RuleCount:  1,
	}
	content, err := json.Marshal(guide)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, guide.ID+".json"), content, 0644); err != nil {
		t.Fatal(err)
	}

	state := callStyleGuideHandler(t, styleGuideStateHandler, "GET", "", "")
	if state.ActiveID != "" || state.Enabled || len(state.Guides) != 1 || state.Guides[0].Active {
		t.Fatalf("unexpected initial style-guide state: %+v", state)
	}
	state = callStyleGuideHandler(t, styleGuideSelectHandler, "POST", `{"id":"plain-language"}`, "")
	if state.ActiveID != "plain-language" || state.Enabled || !state.Guides[0].Active {
		t.Fatalf("unexpected selected style-guide state: %+v", state)
	}
	state = callStyleGuideHandler(t, styleGuideEnabledHandler, "POST", `{"enabled":true}`, "")
	if state.ActiveID != "plain-language" || !state.Enabled {
		t.Fatalf("unexpected enabled style-guide state: %+v", state)
	}
}

func TestStyleGuideStateHandlerReturnsEmptyStateWithoutImport(t *testing.T) {
	t.Setenv("IKMAL_STYLE_GUIDE_DIR", filepath.Join(t.TempDir(), "missing"))
	state := callStyleGuideHandler(t, styleGuideStateHandler, "GET", "", "")
	if state.Guides == nil || len(state.Guides) != 0 || state.ActiveID != "" || state.Enabled {
		t.Fatalf("expected empty style-guide state, got %+v", state)
	}
}

func callStyleGuideHandler(t *testing.T, handler func(http.ResponseWriter, *http.Request), method, body, contentType string) styleGuideStateResponse {
	t.Helper()
	request := httptest.NewRequest(method, "http://127.0.0.1:8096/v1/style-guides", strings.NewReader(body))
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	} else if body != "" {
		request.Header.Set("Content-Type", "application/json")
	}
	response := httptest.NewRecorder()
	handler(response, request)
	if response.Code != 200 {
		t.Fatalf("style-guide handler returned HTTP %d: %s", response.Code, response.Body.String())
	}
	var state styleGuideStateResponse
	if err := json.Unmarshal(response.Body.Bytes(), &state); err != nil {
		t.Fatalf("decode style-guide response: %v", err)
	}
	return state
}

func TestMergeProxyCandidatesPrefersBroaderQualityCorrection(t *testing.T) {
	narrow := qualityProxyCandidate{
		Start:       32,
		End:         35,
		Replacement: "their",
		Confidence:  0.82,
	}
	broad := qualityProxyCandidate{
		Start:       23,
		End:         35,
		Replacement: "produce their",
		Confidence:  0.68,
	}
	merged := mergeProxyCandidates(nil, []qualityProxyCandidate{narrow, broad})
	if len(merged) != 1 || merged[0].Replacement != "produce their" {
		t.Fatalf("expected broader correction to win, got %+v", merged)
	}
}

func TestMergeProxyCandidatesPreservesNativeLanguageToolMatch(t *testing.T) {
	native := qualityProxyCandidate{
		Match:  map[string]any{"message": "native", "offset": 10, "length": 4},
		Start:  10,
		End:    14,
		Native: true,
	}
	quality := qualityProxyCandidate{
		Match:       map[string]any{"message": "quality", "ikmalSource": "quality-sidecar"},
		Start:       10,
		End:         14,
		Replacement: "edit",
		Confidence:  0.99,
	}
	merged := mergeProxyCandidates([]qualityProxyCandidate{native}, []qualityProxyCandidate{quality})
	if len(merged) != 1 || !merged[0].Native {
		t.Fatalf("expected native match to win, got %+v", merged)
	}
	response := proxyMatches(merged)
	if len(response) != 1 {
		t.Fatalf("expected one grouped match, got %+v", response)
	}
	match := response[0].(map[string]any)
	sources, ok := match["ikmalSources"].([]string)
	if !ok || len(sources) != 2 || sources[0] != "LanguageTool" || sources[1] != "quality-sidecar" {
		t.Fatalf("expected source provenance, got %+v", match["ikmalSources"])
	}
	if related, ok := match["ikmalRelated"].([]any); !ok || len(related) != 1 {
		t.Fatalf("expected one related finding, got %+v", match["ikmalRelated"])
	}
}

func TestMergeProxyCandidatesDeduplicatesSameQualityEdit(t *testing.T) {
	first := qualityProxyCandidate{
		Start:       15,
		End:         18,
		Replacement: "their",
		Confidence:  0.82,
	}
	second := qualityProxyCandidate{
		Start:       15,
		End:         18,
		Replacement: "their",
		Confidence:  0.68,
	}
	merged := mergeProxyCandidates(nil, []qualityProxyCandidate{first, second})
	if len(merged) != 1 || merged[0].Confidence != 0.82 {
		t.Fatalf("expected duplicate edit to be deduplicated, got %+v", merged)
	}
}

func TestQualitySuggestionLanguageToolMatchUsesUTF16Offsets(t *testing.T) {
	text := "A 😀 plant produces its own food."
	suggestion := qualitySuggestion{Start: 21, End: 24, Replacement: "their", Category: "pronoun-antecedent", Source: "quality-sidecar"}
	match := qualitySuggestionLanguageToolMatch(text, suggestion)
	if match["offset"] != suggestion.Start || match["length"] != suggestion.End-suggestion.Start {
		t.Fatalf("unexpected offsets: %+v", match)
	}
	if match["ikmalSource"] != suggestion.Source {
		t.Fatalf("expected source metadata before response sanitization: %+v", match)
	}
}

func TestQualitySuggestionLanguageToolMatchCarriesUIMetadata(t *testing.T) {
	suggestion := qualitySuggestion{
		Start:    12,
		End:      22,
		Message:  "The wording repeats nearby.",
		Category: "repetition",
		Source:   "quality-sidecar",
		RelatedOccurrences: []qualityOccurrence{
			{Start: 2, End: 7, Text: "clear"},
			{Start: 12, End: 17, Text: "clear"},
		},
	}
	match := qualitySuggestionLanguageToolMatch("A clear idea is clear.", suggestion)
	if _, ok := match["ikmalRelatedOccurrences"]; !ok {
		t.Fatalf("expected repeat occurrence metadata: %+v", match)
	}
	if match["ikmalSource"] != "quality-sidecar" {
		t.Fatalf("expected source metadata: %+v", match)
	}
}

func TestParseQualityProxyRequestReadsLanguageToolDataEnvelope(t *testing.T) {
	form := url.Values{
		"data":     {`{"text":"Plants produce their own food."}`},
		"language": {"en-US"},
	}
	request := httptest.NewRequest("POST", "http://127.0.0.1:8096/v2/check", strings.NewReader(form.Encode()))
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8")
	values, err := parseQualityProxyRequest(request)
	if err != nil {
		t.Fatal(err)
	}
	if values.Get("text") != "Plants produce their own food." {
		t.Fatalf("expected data envelope text, got %q", values.Get("text"))
	}
}

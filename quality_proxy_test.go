package main

import (
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

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
		Match:  map[string]any{"message": "native"},
		Start:  10,
		End:    14,
		Native: true,
	}
	quality := qualityProxyCandidate{
		Match:       map[string]any{"message": "quality"},
		Start:       10,
		End:         14,
		Replacement: "edit",
		Confidence:  0.99,
	}
	merged := mergeProxyCandidates([]qualityProxyCandidate{native}, []qualityProxyCandidate{quality})
	if len(merged) != 1 || !merged[0].Native {
		t.Fatalf("expected native match to win, got %+v", merged)
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

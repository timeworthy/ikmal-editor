package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestQualitySynonymsAPI(t *testing.T) {
	// 1. GET /v1/synonyms?word=important
	req := httptest.NewRequest("GET", "/v1/synonyms?word=important", nil)
	w := httptest.NewRecorder()
	qualitySynonymsHandler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp struct {
		Word       string   `json:"word"`
		Normalized string   `json:"normalized"`
		Synonyms   []string `json:"synonyms"`
	}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode synonym response: %v", err)
	}

	if resp.Word != "important" || resp.Normalized != "important" {
		t.Fatalf("unexpected word: %s", resp.Word)
	}

	if len(resp.Synonyms) == 0 {
		t.Fatalf("expected synonyms for 'important', got empty")
	}

	foundCrucial := false
	for _, syn := range resp.Synonyms {
		if syn == "crucial" {
			foundCrucial = true
			break
		}
	}
	if !foundCrucial {
		t.Fatalf("expected 'crucial' in synonyms for 'important', got %v", resp.Synonyms)
	}

	// 2. GET /v1/synonyms with punctuation/casing: "Important!"
	req2 := httptest.NewRequest("GET", "/v1/synonyms?word=Important!", nil)
	w2 := httptest.NewRecorder()
	qualitySynonymsHandler(w2, req2)
	var resp2 struct {
		Synonyms []string `json:"synonyms"`
	}
	_ = json.NewDecoder(w2.Body).Decode(&resp2)
	if len(resp2.Synonyms) == 0 {
		t.Fatalf("expected normalized lookup for 'Important!'")
	}

	// 3. GET /v1/synonyms missing word parameter
	reqBad := httptest.NewRequest("GET", "/v1/synonyms", nil)
	wBad := httptest.NewRecorder()
	qualitySynonymsHandler(wBad, reqBad)
	if wBad.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing word param, got %d", wBad.Code)
	}
}

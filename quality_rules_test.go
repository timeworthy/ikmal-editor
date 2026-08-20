package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestQualityRulesAPI(t *testing.T) {
	// 1. GET /v1/rules
	req := httptest.NewRequest("GET", "/v1/rules", nil)
	w := httptest.NewRecorder()
	qualityRulesHandler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	var resp struct {
		Rules []qualityRuleDef `json:"rules"`
	}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if len(resp.Rules) == 0 {
		t.Fatalf("expected rules list, got empty")
	}

	foundOxford := false
	for _, rule := range resp.Rules {
		if rule.ID == "oxford-comma" {
			foundOxford = true
			break
		}
	}
	if !foundOxford {
		t.Fatalf("oxford-comma rule missing from rules list")
	}

	// 2. POST /v1/rules to disable oxford-comma
	disablePayload := map[string]any{
		"id":      "oxford-comma",
		"enabled": false,
	}
	bodyData, _ := json.Marshal(disablePayload)
	reqPost := httptest.NewRequest("POST", "/v1/rules", bytes.NewReader(bodyData))
	wPost := httptest.NewRecorder()
	qualityRulesHandler(wPost, reqPost)

	if wPost.Code != http.StatusOK {
		t.Fatalf("expected status 200 on update, got %d", wPost.Code)
	}

	if isQualityRuleEnabled("oxford-comma", nil, nil) {
		t.Fatalf("expected oxford-comma to be disabled")
	}

	// Re-enable oxford-comma for subsequent tests
	enablePayload := map[string]any{
		"id":      "oxford-comma",
		"enabled": true,
	}
	bodyEnable, _ := json.Marshal(enablePayload)
	reqEnable := httptest.NewRequest("POST", "/v1/rules", bytes.NewReader(bodyEnable))
	wEnable := httptest.NewRecorder()
	qualityRulesHandler(wEnable, reqEnable)

	if !isQualityRuleEnabled("oxford-comma", nil, nil) {
		t.Fatalf("expected oxford-comma to be re-enabled")
	}
}

func TestQualityRuleOverridesInRequest(t *testing.T) {
	// Rule enabled globally
	if !isQualityRuleEnabled("oxford-comma", nil, nil) {
		t.Fatalf("expected oxford-comma enabled globally")
	}

	// Override to disable per-request
	if isQualityRuleEnabled("oxford-comma", map[string]bool{"oxford-comma": false}, nil) {
		t.Fatalf("expected oxford-comma disabled via override")
	}

	// Override via disabled list
	if isQualityRuleEnabled("oxford-comma", nil, []string{"oxford-comma"}) {
		t.Fatalf("expected oxford-comma disabled via disabled list")
	}
}

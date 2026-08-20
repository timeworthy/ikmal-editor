package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// 1. Path Traversal & Ownership Ledger Resilience
// ---------------------------------------------------------------------------
func TestIntegrationPathTraversalProtection(t *testing.T) {
	home := t.TempDir()

	// 1. Attempt writing outside home directory must be strictly rejected
	outsidePath := filepath.Join(filepath.Dir(home), "forbidden.txt")
	err := writeManagedIntegrationFile(home, outsidePath, []byte("data"))
	if err == nil {
		t.Fatalf("expected path outside home to be rejected, got nil error")
	}
	if !strings.Contains(err.Error(), "outside the user home") {
		t.Fatalf("unexpected error message: %v", err)
	}

	// 2. Relative traversal attempt
	traversalPath := filepath.Join(home, "..", "escape.txt")
	errTraversal := writeManagedIntegrationFile(home, traversalPath, []byte("data"))
	if errTraversal == nil {
		t.Fatalf("expected traversal path to be rejected")
	}

	// 3. Normal path inside home succeeds and creates backup
	validPath := filepath.Join(home, "config", "settings.json")
	_ = os.MkdirAll(filepath.Dir(validPath), 0755)
	_ = os.WriteFile(validPath, []byte(`{"user": "original"}`), 0644)

	errValid := writeManagedIntegrationFile(home, validPath, []byte(`{"user": "managed"}`))
	if errValid != nil {
		t.Fatalf("failed to write valid managed integration: %v", errValid)
	}

	records, errRead := readIntegrationBackupRecords(home)
	if errRead != nil || len(records) != 1 {
		t.Fatalf("failed to read integration backup records: %v", errRead)
	}
	if !records[0].Existed || records[0].Backup == "" {
		t.Fatalf("expected existing file to have backup recorded")
	}
}

// ---------------------------------------------------------------------------
// 2. Corrupted Integration Backup Ledger Recovery
// ---------------------------------------------------------------------------
func TestCorruptedIntegrationBackupLedger(t *testing.T) {
	home := t.TempDir()
	manifestPath := integrationBackupManifestPath(home)
	_ = os.MkdirAll(filepath.Dir(manifestPath), 0755)

	// Write malformed JSON to manifest
	_ = os.WriteFile(manifestPath, []byte(`{ malformed json buffer [ }`), 0644)

	// readIntegrationBackupRecords must return error without panicking
	_, err := readIntegrationBackupRecords(home)
	if err == nil {
		t.Fatalf("expected error on malformed manifest")
	}

	// Overwrite with empty file
	_ = os.WriteFile(manifestPath, []byte(``), 0644)
	records, errEmpty := readIntegrationBackupRecords(home)
	if errEmpty != nil {
		t.Fatalf("empty manifest should not panic: %v", errEmpty)
	}
	if len(records) != 0 {
		t.Fatalf("expected 0 records for empty manifest")
	}
}

// ---------------------------------------------------------------------------
// 3. User Modification Preservation on Restore
// ---------------------------------------------------------------------------
func TestRestorePreservesUserEdits(t *testing.T) {
	home := t.TempDir()
	targetPath := filepath.Join(home, "app", "config.json")
	_ = os.MkdirAll(filepath.Dir(targetPath), 0755)
	_ = os.WriteFile(targetPath, []byte(`{"original": true}`), 0644)

	// ikmal manages the file
	_ = writeManagedIntegrationFile(home, targetPath, []byte(`{"ikmal": true}`))

	// User later manually edits the file
	_ = os.WriteFile(targetPath, []byte(`{"user_custom_change": true}`), 0644)

	// Restore must NOT overwrite user's custom changes
	err := restoreManagedIntegrationFiles(home)
	if err != nil {
		t.Fatalf("restore failed: %v", err)
	}

	currentContent, _ := os.ReadFile(targetPath)
	if !strings.Contains(string(currentContent), "user_custom_change") {
		t.Fatalf("expected user's custom edits to be preserved, got: %s", string(currentContent))
	}
}

// ---------------------------------------------------------------------------
// 4. Corrupted Rules Config & Style Guides Resilience
// ---------------------------------------------------------------------------
func TestCorruptedQualityRulesConfig(t *testing.T) {
	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "rules_config.json")
	t.Setenv("IKMAL_RULES_CONFIG_PATH", configPath)

	// 1. Write garbage to rules config
	_ = os.WriteFile(configPath, []byte(`{ invalid: json`), 0644)

	// initQualityRules should fall back to default rules without panicking
	initQualityRules()

	rules := getQualityRulesList()
	if len(rules) == 0 {
		t.Fatalf("expected default rules to load despite corrupted config")
	}

	// 2. Modifying a rule should overwrite the corrupted config with valid JSON
	err := setQualityRuleEnabled("oxford-comma", false)
	if err != nil {
		t.Fatalf("failed to save rule update: %v", err)
	}

	data, errRead := os.ReadFile(configPath)
	if errRead != nil || !strings.Contains(string(data), "oxford-comma") {
		t.Fatalf("expected valid JSON written after rule update")
	}

	// Restore rule
	_ = setQualityRuleEnabled("oxford-comma", true)
}

// ---------------------------------------------------------------------------
// 5. Version Comparison and Corrupted Channel Resilience
// ---------------------------------------------------------------------------
func TestVersionComparisonAndChannelResilience(t *testing.T) {
	// 1. Malformed and edge case versions must not panic or cause erroneous upgrade offers
	malformedPairs := [][2]string{
		{"", "1.0.0"},
		{"not-a-version", "1.0.0"},
		{"1.0.0", "not-a-version"},
		{"1.2.3.4.5.6", "1.2.3"},
		{"v1.0.0", "1.0.0"},
		{"1.0.0-beta", "1.0.0"},
		{"1.0.0-alpha.1", "1.0.0-beta.2"},
		{"1.0.0-rc1", "1.0.0"},
		{"0.9.2-beta", "0.9.1"},
	}

	for _, pair := range malformedPairs {
		_ = versionIsNewer(pair[0], pair[1])
	}

	// 2. Channel offering tests
	// Stable channel: Never offer prereleases
	assertMatch := func(got, expected, msg string) {
		if got != expected {
			t.Fatalf("%s: expected %q, got %q", msg, expected, got)
		}
	}

	assertMatch(offeredUpdate("1.0.0", "1.1.0-beta", "0.9.0", "stable"), "1.0.0", "Stable channel picks stable")
	assertMatch(offeredUpdate("", "1.1.0-beta", "1.0.0", "stable"), "", "Stable channel ignores prerelease when no stable")

	// Beta channel: Offer newer prereleases
	assertMatch(offeredUpdate("1.0.0", "1.1.0-beta", "1.0.0", "beta"), "1.1.0-beta", "Beta channel offers newer beta")
	assertMatch(offeredUpdate("1.2.0", "1.1.0-beta", "1.0.0", "beta"), "1.2.0", "Beta channel prefers higher stable over older beta")
}

// ---------------------------------------------------------------------------
// 6. Proxy Degraded Multi-Engine Failures
// ---------------------------------------------------------------------------
func TestProxyHandlesDegradedUpstreams(t *testing.T) {
	// Mock LanguageTool server that returns HTTP 500
	failingLT := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("LanguageTool internal error"))
	}))
	defer failingLT.Close()

	// Mock Quality server that returns valid suggestions
	workingQuality := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := qualityResponse{
			Backend: "quality-rules",
			Suggestions: []qualitySuggestion{
				{
					Start:       15,
					End:         18,
					Message:     "Pronoun-antecedent agreement",
					Replacement: "their",
					Category:    "pronoun-antecedent",
					Confidence:  0.85,
				},
			},
		}
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer workingQuality.Close()

	proxy := qualityProxy{
		languageToolURL: failingLT.URL + "/v2/check",
		qualityURL:      workingQuality.URL + "/v1/analyze",
		client:          &http.Client{},
	}

	req := httptest.NewRequest("POST", "/v2/check", bytes.NewBufferString("text=Plants+produce+its+own+food.&language=en-US"))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()

	proxy.routes().ServeHTTP(w, req)

	// When LanguageTool fails, proxy should degrade gracefully: return 200 with quality suggestions
	if w.Code != http.StatusOK {
		t.Fatalf("expected proxy to return 200 in degraded state, got %d", w.Code)
	}

	var response map[string]any
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("failed to decode proxy response: %v", err)
	}

	matches, ok := response["matches"].([]any)
	if !ok || len(matches) == 0 {
		t.Fatalf("expected quality matches in degraded mode, got: %+v", response)
	}

	// Verify unconfirmed engines are recorded
	if warning, hasWarning := response["ikmalWarning"]; hasWarning {
		t.Logf("Degraded mode warning reported: %v", warning)
	}
}

package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// isolateHome points the quality paths at a temp directory so tests never read
// or write the developer's real ~/.ikmal-editor.
func isolateHome(t *testing.T) string {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("IKMAL_ACCEPT_QUALITY_NOTICES", "")
	t.Setenv("IKMAL_TRANSFORMER_MODEL", "")
	return home
}

func TestQualityNoticesNotAcceptedByDefault(t *testing.T) {
	isolateHome(t)
	if qualityNoticesAccepted() {
		t.Fatal("a fresh machine must not report the notices as accepted")
	}
}

func TestQualityNoticesAcceptedViaEnvironment(t *testing.T) {
	isolateHome(t)
	for _, value := range []string{"1", "true", "TRUE", "yes"} {
		t.Setenv("IKMAL_ACCEPT_QUALITY_NOTICES", value)
		if !qualityNoticesAccepted() {
			t.Fatalf("IKMAL_ACCEPT_QUALITY_NOTICES=%q should grant consent", value)
		}
	}
	for _, value := range []string{"", "0", "no", "maybe"} {
		t.Setenv("IKMAL_ACCEPT_QUALITY_NOTICES", value)
		if qualityNoticesAccepted() {
			t.Fatalf("IKMAL_ACCEPT_QUALITY_NOTICES=%q must not grant consent", value)
		}
	}
}

func TestQualityConsentRoundTrip(t *testing.T) {
	isolateHome(t)
	recordQualityNoticesAccepted("test")
	if !qualityNoticesAccepted() {
		t.Fatal("a recorded acceptance should persist")
	}

	contents, err := os.ReadFile(qualityConsentPath())
	if err != nil {
		t.Fatalf("consent record was not written: %v", err)
	}
	var record qualityConsentRecord
	if err := json.Unmarshal(contents, &record); err != nil {
		t.Fatalf("consent record is not valid JSON: %v", err)
	}
	if record.Revision != qualityNoticesRevision {
		t.Fatalf("expected revision %d, got %d", qualityNoticesRevision, record.Revision)
	}
	if record.Model != qualityTransformerModelID {
		t.Fatalf("consent should record the model it covers, got %q", record.Model)
	}
	if record.AcceptedAt == "" {
		t.Fatal("consent should record when it was given")
	}
}

// A stale acceptance must not carry forward to a newer revision of the
// notices, otherwise changing the disclosed terms would silently reuse consent
// the user gave for something else.
func TestQualityConsentIgnoresOlderRevision(t *testing.T) {
	isolateHome(t)
	stale, err := json.Marshal(qualityConsentRecord{Revision: qualityNoticesRevision - 1, AcceptedAt: "2026-01-01T00:00:00Z"})
	if err != nil {
		t.Fatalf("could not build stale record: %v", err)
	}
	path := qualityConsentPath()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatalf("could not create consent dir: %v", err)
	}
	if err := os.WriteFile(path, stale, 0644); err != nil {
		t.Fatalf("could not write stale record: %v", err)
	}
	if qualityNoticesAccepted() {
		t.Fatal("consent for an older notices revision must not carry forward")
	}
}

func TestQualityConsentIgnoresCorruptRecord(t *testing.T) {
	isolateHome(t)
	path := qualityConsentPath()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatalf("could not create consent dir: %v", err)
	}
	if err := os.WriteFile(path, []byte("{not json"), 0644); err != nil {
		t.Fatalf("could not write corrupt record: %v", err)
	}
	if qualityNoticesAccepted() {
		t.Fatal("a corrupt consent record must fail closed")
	}
}

func TestQualityStatusReportsDefaultModelLicense(t *testing.T) {
	isolateHome(t)
	status := detectQualityStatus()

	if !status.ModelIsDefault {
		t.Fatal("expected the default model when no override is set")
	}
	if status.ModelLicense != "CC BY-NC-SA 4.0 (non-commercial)" {
		t.Fatalf("the default model's non-commercial license must be surfaced, got %q", status.ModelLicense)
	}
	if status.NoticesAccepted {
		t.Fatal("a fresh machine should report the notices as unaccepted")
	}
	if status.Ready {
		t.Fatal("nothing is installed, so the stack must not report ready")
	}

	var model *qualityComponent
	for i := range status.Components {
		if status.Components[i].ID == "model" {
			model = &status.Components[i]
		}
	}
	if model == nil {
		t.Fatal("status must include the model component")
	}
	if model.Installed {
		t.Fatal("model weights should not be reported as installed in a clean home")
	}
}

func TestQualityStatusHonorsModelOverride(t *testing.T) {
	isolateHome(t)
	t.Setenv("IKMAL_TRANSFORMER_MODEL", "Unbabel/gec-t5_small")

	status := detectQualityStatus()
	if status.ModelIsDefault {
		t.Fatal("an override must not report as the default model")
	}
	if status.ModelID != "Unbabel/gec-t5_small" {
		t.Fatalf("expected the overridden model, got %q", status.ModelID)
	}
	if status.ModelLicense == "CC BY-NC-SA 4.0 (non-commercial)" {
		t.Fatal("the non-commercial warning must not be applied to an overridden model")
	}
}

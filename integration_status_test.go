package main

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func appSupportPath(home string, parts ...string) string {
	base := home
	if runtime.GOOS == "darwin" {
		base = filepath.Join(home, "Library", "Application Support")
	}
	return filepath.Join(append([]string{base}, parts...)...)
}

func firefoxProfilesPath(home string) string {
	if runtime.GOOS == "darwin" {
		return filepath.Join(home, "Library", "Application Support", "Firefox", "Profiles")
	}
	return filepath.Join(home, ".mozilla", "firefox")
}

func firefoxManagedPath(home string) string {
	if runtime.GOOS == "darwin" {
		return filepath.Join(home, "Library", "Application Support", "Mozilla", "ManagedStorage")
	}
	return filepath.Join(home, ".mozilla", "managed-storage")
}

func TestIntegrationDetectionRecognizesConfiguredFirefoxChromeAndVSCode(t *testing.T) {
	home := t.TempDir()
	endpoint := "http://127.0.0.1:8096/v2"

	firefoxProfile := filepath.Join(firefoxProfilesPath(home), "test")
	if err := os.MkdirAll(firefoxProfile, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(firefoxProfile, "extensions.json"), []byte(languageToolExtensionID), 0644); err != nil {
		t.Fatal(err)
	}
	firefoxManaged := filepath.Join(firefoxManagedPath(home), "languagetool-webextension@languagetool.org.json")
	if err := os.MkdirAll(filepath.Dir(firefoxManaged), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(firefoxManaged, []byte(`{"serverUrl":"`+endpoint+`/check"}`), 0644); err != nil {
		t.Fatal(err)
	}

	chromeRoot := appSupportPath(home, "Google", "Chrome")
	if runtime.GOOS == "linux" {
		chromeRoot = filepath.Join(home, ".config", "google-chrome")
	}
	chromeExtension := filepath.Join(chromeRoot, "Default", "Extensions", languageToolExtensionID)
	if err := os.MkdirAll(chromeExtension, 0755); err != nil {
		t.Fatal(err)
	}
	chromePolicy := filepath.Join(chromeRoot, "External Extensions", languageToolExtensionID+".json")
	if err := os.MkdirAll(filepath.Dir(chromePolicy), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(chromePolicy, []byte(`{"server_url":"`+endpoint+`/check"}`), 0644); err != nil {
		t.Fatal(err)
	}

	vscodeSettings := appSupportPath(home, "Code", "User", "settings.json")
	if runtime.GOOS == "linux" {
		vscodeSettings = filepath.Join(home, ".config", "Code", "User", "settings.json")
	}
	if err := os.MkdirAll(filepath.Dir(vscodeSettings), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(vscodeSettings, []byte(`{"languageTool.serverUrl":"`+endpoint+`/check"}`), 0644); err != nil {
		t.Fatal(err)
	}
	vscodeExtension := filepath.Join(home, ".vscode", "extensions", "vendor.languagetool-1.0.0")
	if err := os.MkdirAll(vscodeExtension, 0755); err != nil {
		t.Fatal(err)
	}

	firefox := detectFirefoxIntegration(home, endpoint)
	if !firefox.Detected || !firefox.Configured {
		t.Fatalf("expected configured Firefox integration, got %+v", firefox)
	}
	chrome := detectChromeIntegration(home, endpoint)
	if !chrome.Detected || !chrome.Configured {
		t.Fatalf("expected configured Chrome integration, got %+v", chrome)
	}
	vscode := detectVSCodeIntegration(home, endpoint)
	if !vscode.Detected || !vscode.Configured {
		t.Fatalf("expected configured VS Code integration, got %+v", vscode)
	}
}

func TestAutoConfigureAppsHonorsExplicitTargetSelection(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("IKMAL_EDITOR_SERVER_URL", "http://127.0.0.1:8096/v2")
	t.Setenv("IKMAL_EDITOR_CONFIGURE_APPS", "firefox,chrome")

	autoConfigureApps()

	firefoxPath := filepath.Join(firefoxManagedPath(home), "languagetool-webextension@languagetool.org.json")
	if content, err := os.ReadFile(firefoxPath); err != nil || !strings.Contains(string(content), "8096/v2/check") {
		t.Fatalf("expected Firefox configuration in temp home, err=%v content=%q", err, content)
	}

	chromeRoot := appSupportPath(home, "Google", "Chrome")
	if runtime.GOOS == "linux" {
		chromeRoot = filepath.Join(home, ".config", "google-chrome")
	}
	chromePath := filepath.Join(chromeRoot, "External Extensions", languageToolExtensionID+".json")
	if content, err := os.ReadFile(chromePath); err != nil || !strings.Contains(string(content), "8096/v2/check") {
		t.Fatalf("expected Chrome configuration in temp home, err=%v content=%q", err, content)
	}

	if _, err := os.Stat(appSupportPath(home, "Code", "User", "settings.json")); !os.IsNotExist(err) {
		t.Fatalf("expected VS Code to remain untouched, err=%v", err)
	}
}

func TestIntegrationTargetSelectionDefaultsAndFilters(t *testing.T) {
	t.Setenv("IKMAL_EDITOR_CONFIGURE_APPS", "")
	if !integrationTargetEnabled("firefox") {
		t.Fatal("empty selection should preserve explicit CLI all-target behavior")
	}
	t.Setenv("IKMAL_EDITOR_CONFIGURE_APPS", "firefox, chrome")
	if !integrationTargetEnabled("firefox") || !integrationTargetEnabled("chrome") || integrationTargetEnabled("vscode") {
		t.Fatal("expected comma-separated target filter")
	}
}

func TestIntegrationUsesEndpointRequiresExactConfiguredEndpoint(t *testing.T) {
	if !integrationUsesEndpoint(`{"serverUrl":"http://127.0.0.1:8096/v2/check"}`, "http://127.0.0.1:8096/v2") {
		t.Fatal("expected configured endpoint to be detected")
	}
	if !integrationUsesEndpoint(`{"serverUrl":"HTTP://127.0.0.1:8096/v2/"}`, "http://127.0.0.1:8096/v2") {
		t.Fatal("expected endpoint comparison to normalize scheme, case, and trailing slash")
	}
	if integrationUsesEndpoint(`{"serverUrl":"http://127.0.0.1:8097/v2/check"}`, "http://127.0.0.1:8096/v2") {
		t.Fatal("did not expect a different endpoint to be treated as configured")
	}
	if integrationUsesEndpoint(`{"serverUrl":"http://127.0.0.1:8096/v20/check"}`, "http://127.0.0.1:8096/v2") {
		t.Fatal("did not expect a similarly prefixed path to be treated as configured")
	}
}

func TestIntegrationDetectionReportsMisconfiguredEndpoint(t *testing.T) {
	home := t.TempDir()
	profile := filepath.Join(firefoxProfilesPath(home), "test")
	if err := os.MkdirAll(profile, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(profile, "extensions.json"), []byte(languageToolExtensionID), 0644); err != nil {
		t.Fatal(err)
	}
	managed := filepath.Join(firefoxManagedPath(home), "languagetool-webextension@languagetool.org.json")
	if err := os.MkdirAll(filepath.Dir(managed), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(managed, []byte(`{"serverUrl":"http://127.0.0.1:8097/v2/check"}`), 0644); err != nil {
		t.Fatal(err)
	}
	target := detectFirefoxIntegration(home, "http://127.0.0.1:8096/v2")
	if !target.Detected || target.Configured || target.State != "misconfigured" || target.ConfiguredEndpoint != "http://127.0.0.1:8097/v2" {
		t.Fatalf("expected misconfigured Firefox integration, got %+v", target)
	}
}

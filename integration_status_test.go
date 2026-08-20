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

func vsCodeSettingsPath(home string) string {
	if runtime.GOOS == "linux" {
		return filepath.Join(home, ".config", "Code", "User", "settings.json")
	}
	return appSupportPath(home, "Code", "User", "settings.json")
}

// settings.json belongs to every installed extension, so another extension's
// server setting must not be read as this integration's.
func TestVSCodeIntegrationReadsOnlyItsOwnServerSetting(t *testing.T) {
	endpoint := "http://127.0.0.1:8096/v2"

	write := func(t *testing.T, home, content string) {
		t.Helper()
		path := vsCodeSettingsPath(home)
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(content), 0644); err != nil {
			t.Fatal(err)
		}
	}

	// An unrelated extension's bare "serverUrl" comes first in the file, and
	// this integration's own setting is correct.
	configured := t.TempDir()
	write(t, configured, `{
  "someTool.enabled": true,
  "serverUrl": "http://10.0.0.5:9000",
  "languageTool.serverUrl": "http://127.0.0.1:8096/v2/check"
}`)
	target := detectVSCodeIntegration(configured, endpoint)
	if !target.Detected || !target.Configured || target.State != "configured" {
		t.Fatalf("a correctly configured host must not be reported through another extension's setting, got %+v", target)
	}
	if target.ConfiguredEndpoint != endpoint {
		t.Fatalf("expected this integration's endpoint, got %q", target.ConfiguredEndpoint)
	}

	// A genuinely wrong value for this integration is still reported, and
	// reported as its own endpoint.
	misconfigured := t.TempDir()
	write(t, misconfigured, `{
  "serverUrl": "http://10.0.0.5:9000",
  "languageTool.serverUrl": "http://127.0.0.1:8097/v2/check"
}`)
	target = detectVSCodeIntegration(misconfigured, endpoint)
	if target.Configured || target.State != "misconfigured" || target.ConfiguredEndpoint != "http://127.0.0.1:8097/v2" {
		t.Fatalf("expected a misconfigured VS Code integration reported by its own setting, got %+v", target)
	}

	// Settings that only hold another extension's server URL say nothing about
	// this integration.
	unrelated := t.TempDir()
	write(t, unrelated, `{"serverUrl": "http://10.0.0.5:9000"}`)
	target = detectVSCodeIntegration(unrelated, endpoint)
	if target.Configured || target.ConfiguredEndpoint != "" || target.State != "detected" {
		t.Fatalf("expected no endpoint claim from an unrelated setting, got %+v", target)
	}
}

func TestAutoConfigureAppsHonorsExplicitTargetSelection(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("IKMAL_EDITOR_SERVER_URL", "http://127.0.0.1:8096/v2")
	t.Setenv("IKMAL_EDITOR_CONFIGURE_APPS", "firefox,chrome")

	// Configuration is for an extension the user already installed. These
	// markers stand in for the two official LanguageTool extensions without
	// downloading either one during a unit test.
	firefoxProfile := filepath.Join(firefoxProfilesPath(home), "test")
	if err := os.MkdirAll(firefoxProfile, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(firefoxProfile, "extensions.json"), []byte(languageToolExtensionID), 0644); err != nil {
		t.Fatal(err)
	}
	chromeRoot := appSupportPath(home, "Google", "Chrome")
	if runtime.GOOS == "linux" {
		chromeRoot = filepath.Join(home, ".config", "google-chrome")
	}
	if err := os.MkdirAll(filepath.Join(chromeRoot, "Default", "Extensions", languageToolExtensionID), 0755); err != nil {
		t.Fatal(err)
	}

	autoConfigureApps()

	firefoxPath := filepath.Join(firefoxManagedPath(home), "languagetool-webextension@languagetool.org.json")
	if content, err := os.ReadFile(firefoxPath); err != nil || !strings.Contains(string(content), "8096/v2/check") {
		t.Fatalf("expected Firefox configuration in temp home, err=%v content=%q", err, content)
	}

	chromeRoot = appSupportPath(home, "Google", "Chrome")
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

func TestAutoConfigureAppsDoesNotCreateThirdPartyIntegrationWithoutExtension(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("IKMAL_EDITOR_SERVER_URL", "http://127.0.0.1:8096/v2")
	t.Setenv("IKMAL_EDITOR_CONFIGURE_APPS", "firefox,chrome")

	autoConfigureApps()

	if _, err := os.Stat(filepath.Join(firefoxManagedPath(home), "languagetool-webextension@languagetool.org.json")); !os.IsNotExist(err) {
		t.Fatalf("expected no Firefox managed storage without the extension, err=%v", err)
	}
	chromeRoot := appSupportPath(home, "Google", "Chrome")
	if runtime.GOOS == "linux" {
		chromeRoot = filepath.Join(home, ".config", "google-chrome")
	}
	if _, err := os.Stat(filepath.Join(chromeRoot, "External Extensions", languageToolExtensionID+".json")); !os.IsNotExist(err) {
		t.Fatalf("expected no Chrome policy without the extension, err=%v", err)
	}
}

func TestManagedIntegrationFilesRestoreExistingAndRemoveCreatedFiles(t *testing.T) {
	home := t.TempDir()
	target := filepath.Join(home, "config", "integration.json")
	original := []byte(`{"existing":true}`)
	if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, original, 0644); err != nil {
		t.Fatal(err)
	}
	if err := writeManagedIntegrationFile(home, target, []byte(`{"ikmal":true}`)); err != nil {
		t.Fatal(err)
	}
	created := filepath.Join(home, "config", "created.json")
	if err := writeManagedIntegrationFile(home, created, []byte(`{"created":true}`)); err != nil {
		t.Fatal(err)
	}
	if err := restoreManagedIntegrationFiles(home); err != nil {
		t.Fatal(err)
	}
	if got, err := os.ReadFile(target); err != nil || string(got) != string(original) {
		t.Fatalf("existing integration was not restored: err=%v content=%q", err, got)
	}
	if _, err := os.Stat(created); !os.IsNotExist(err) {
		t.Fatalf("created integration was not removed, err=%v", err)
	}

	changed := filepath.Join(home, "config", "changed.json")
	if err := os.WriteFile(changed, []byte(`{"before":true}`), 0644); err != nil {
		t.Fatal(err)
	}
	if err := writeManagedIntegrationFile(home, changed, []byte(`{"ikmal":true}`)); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(changed, []byte(`{"userChanged":true}`), 0644); err != nil {
		t.Fatal(err)
	}
	if err := restoreManagedIntegrationFiles(home); err != nil {
		t.Fatal(err)
	}
	if got, err := os.ReadFile(changed); err != nil || string(got) != `{"userChanged":true}` {
		t.Fatalf("user-edited integration was overwritten: err=%v content=%q", err, got)
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

func TestIntegrationEndpointIgnoresUnrelatedURLsInTheSameFile(t *testing.T) {
	endpoint := "http://127.0.0.1:8096/v2"

	// The exact Chrome policy this app writes in autoConfigureApps: the
	// extension update URL comes first, the server URL second.
	chromePolicy := `{
  "external_update_url": "https://clients2.google.com/service/update2/crx",
  "server_url": "http://127.0.0.1:8096/v2/check"
}`
	if !integrationUsesEndpoint(chromePolicy, endpoint) {
		t.Fatalf("policy this app writes must read as configured, got endpoint %q", integrationEndpointFromContent(chromePolicy))
	}

	// A genuinely wrong server URL must still be reported, and reported as
	// the server URL rather than as whatever unrelated URL came first.
	wrong := `{
  "external_update_url": "https://clients2.google.com/service/update2/crx",
  "server_url": "http://127.0.0.1:8097/v2/check"
}`
	if integrationUsesEndpoint(wrong, endpoint) {
		t.Fatal("a different server_url must not read as configured")
	}
	if got := integrationEndpointFromContent(wrong); got != "http://127.0.0.1:8097/v2" {
		t.Fatalf("expected the server URL to be reported, got %q", got)
	}
}

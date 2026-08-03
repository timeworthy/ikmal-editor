package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

const languageToolExtensionID = "lhgkgpnhbakdcadgobkbbkoicdikgadj"

type integrationTarget struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Detected   bool   `json:"detected"`
	Configured bool   `json:"configured"`
	Details    string `json:"details"`
}

type integrationStatusResponse struct {
	Endpoint string              `json:"endpoint"`
	Targets  []integrationTarget `json:"targets"`
}

func printIntegrationStatus() {
	status := detectIntegrationStatus()
	if err := json.NewEncoder(os.Stdout).Encode(status); err != nil {
		fmt.Printf("Could not read integration status: %v\n", err)
	}
}

func detectIntegrationStatus() integrationStatusResponse {
	homeDir, _ := os.UserHomeDir()
	endpoint := os.Getenv("IKMAL_EDITOR_SERVER_URL")
	if endpoint == "" {
		endpoint = "http://127.0.0.1:" + defaultPort + "/v2"
	}

	targets := []integrationTarget{
		detectMacIntegration(homeDir, endpoint),
		detectFirefoxIntegration(homeDir, endpoint),
		detectChromeIntegration(homeDir, endpoint),
		detectVSCodeIntegration(homeDir, endpoint),
	}
	return integrationStatusResponse{Endpoint: endpoint, Targets: targets}
}

func detectMacIntegration(homeDir, endpoint string) integrationTarget {
	target := integrationTarget{ID: "macos", Name: "macOS LanguageTool integrations", Details: "Safari, Mail, and system writing integrations"}
	if runtime.GOOS != "darwin" {
		return target
	}
	value := readMacDefaults("org.languagetool.mac", "apiServer")
	target.Detected = value != ""
	target.Configured = integrationUsesEndpoint(value, endpoint)
	return target
}

func readMacDefaults(domain, key string) string {
	if runtime.GOOS != "darwin" {
		return ""
	}
	output, err := exec.Command("defaults", "read", domain, key).Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(output))
}

func detectFirefoxIntegration(homeDir, endpoint string) integrationTarget {
	root := filepath.Join(homeDir, ".mozilla", "firefox")
	if runtime.GOOS == "darwin" {
		root = filepath.Join(homeDir, "Library", "Application Support", "Firefox", "Profiles")
	}
	managed := filepath.Join(homeDir, "Library", "Application Support", "Mozilla", "ManagedStorage", "languagetool-webextension@languagetool.org.json")
	if runtime.GOOS != "darwin" {
		managed = filepath.Join(homeDir, ".mozilla", "managed-storage", "languagetool-webextension@languagetool.org.json")
	}
	managedContent := readTextFile(managed)
	installed := globContains(filepath.Join(root, "*", "extensions.json"), languageToolExtensionID) || len(globMatches(filepath.Join(root, "*", "extensions", "languagetool-webextension@languagetool.org*"))) > 0
	target := integrationTarget{ID: "firefox", Name: "Firefox LanguageTool extension", Detected: installed || managedContent != "", Details: "Firefox extension and managed local-server settings"}
	target.Configured = integrationUsesEndpoint(managedContent, endpoint)
	return target
}

func detectChromeIntegration(homeDir, endpoint string) integrationTarget {
	root := filepath.Join(homeDir, "Library", "Application Support", "Google", "Chrome")
	if runtime.GOOS == "linux" {
		root = filepath.Join(homeDir, ".config", "google-chrome")
	}
	extensionInstalled := len(globMatches(filepath.Join(root, "*", "Extensions", languageToolExtensionID))) > 0
	policyPaths := []string{
		filepath.Join(root, "External Extensions", languageToolExtensionID+".json"),
		filepath.Join(root, "NativeMessagingHosts", languageToolExtensionID+".json"),
	}
	configured := false
	policyExists := false
	for _, policyPath := range policyPaths {
		content := readTextFile(policyPath)
		policyExists = policyExists || content != ""
		configured = configured || integrationUsesEndpoint(content, endpoint)
	}
	target := integrationTarget{ID: "chrome", Name: "Chrome-based LanguageTool extension", Detected: extensionInstalled || policyExists, Configured: configured, Details: "Chrome, Chromium, Brave, and Edge-compatible local-server settings"}
	return target
}

func detectVSCodeIntegration(homeDir, endpoint string) integrationTarget {
	settingsPath := filepath.Join(homeDir, "Library", "Application Support", "Code", "User", "settings.json")
	if runtime.GOOS == "linux" {
		settingsPath = filepath.Join(homeDir, ".config", "Code", "User", "settings.json")
	}
	settings := readTextFile(settingsPath)
	installed := len(globMatches(filepath.Join(homeDir, ".vscode", "extensions", "*languagetool*"))) > 0
	target := integrationTarget{ID: "vscode", Name: "VS Code LanguageTool integration", Detected: installed || settings != "", Details: "VS Code extension and user settings"}
	target.Configured = strings.Contains(settings, "languageTool.serverUrl") && integrationUsesEndpoint(settings, endpoint)
	return target
}

func integrationTargetEnabled(id string) bool {
	raw := strings.TrimSpace(os.Getenv("IKMAL_EDITOR_CONFIGURE_APPS"))
	if raw == "" {
		return true
	}
	for _, value := range strings.Split(raw, ",") {
		if strings.TrimSpace(value) == id {
			return true
		}
	}
	return false
}

func integrationUsesEndpoint(content, endpoint string) bool {
	return content != "" && endpoint != "" && strings.Contains(content, endpoint)
}

func readTextFile(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return string(data)
}

func globMatches(pattern string) []string {
	matches, _ := filepath.Glob(pattern)
	return matches
}

func globContains(pattern, needle string) bool {
	for _, match := range globMatches(pattern) {
		if strings.Contains(readTextFile(match), needle) {
			return true
		}
	}
	return false
}

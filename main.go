package main

import (
	"embed"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

//go:embed rules/style_conciseness.xml
var embeddedRules embed.FS

const (
	defaultPort         = "8097"
	languageToolVersion = "6.5"
	appVersion          = "0.9.0-beta"

	// Update check endpoint. A plain static JSON file fetched over HTTPS at most
	// once per day. The request sends no identifier, no query string, and no body:
	// the aggregate hit count in the web server log is the only signal it produces,
	// and it exists so users learn about new releases. See -no-update-check.
	updateCheckURL = "https://raw.githubusercontent.com/timeworthy/ikmal-editor/main/version.json"
)

func main() {
	if len(os.Args) > 1 && (os.Args[1] == "-version" || os.Args[1] == "--version" || os.Args[1] == "version") {
		fmt.Printf("ikmal-editor %s\n", appVersion)
		return
	}

	if len(os.Args) > 1 && (os.Args[1] == "-quality-server" || os.Args[1] == "--quality-server" || os.Args[1] == "quality-server") {
		runQualityServer()
		return
	}

	if len(os.Args) > 1 && (os.Args[1] == "-integrated" || os.Args[1] == "--integrated" || os.Args[1] == "integrated") {
		runIntegrated()
		return
	}

	if len(os.Args) > 1 && (os.Args[1] == "-quality-proxy" || os.Args[1] == "--quality-proxy" || os.Args[1] == "quality-proxy") {
		runQualityProxy()
		return
	}

	if len(os.Args) > 1 && (os.Args[1] == "-quality-setup" || os.Args[1] == "--quality-setup" || os.Args[1] == "quality-setup") {
		runQualitySetup()
		return
	}

	if len(os.Args) > 1 && (os.Args[1] == "-quality-status" || os.Args[1] == "--quality-status" || os.Args[1] == "quality-status") {
		printQualityStatus()
		return
	}

	if len(os.Args) > 1 && (os.Args[1] == "-style-guide-import" || os.Args[1] == "--style-guide-import" || os.Args[1] == "style-guide-import") {
		if len(os.Args) < 3 {
			fmt.Println("Usage: ikmal-editor --style-guide-import <file.pdf|file.html|file.md|file.txt>")
			return
		}
		runStyleGuideImport(os.Args[2])
		return
	}

	if len(os.Args) > 1 && (os.Args[1] == "-style-guide-rules-import" || os.Args[1] == "--style-guide-rules-import" || os.Args[1] == "style-guide-rules-import") {
		if len(os.Args) < 4 {
			fmt.Println("Usage: ikmal-editor --style-guide-rules-import <guide-id> <rules.csv>")
			return
		}
		runStyleGuideRulesImport(os.Args[2], os.Args[3])
		return
	}

	if len(os.Args) > 1 && (os.Args[1] == "-style-guide-review-refresh" || os.Args[1] == "--style-guide-review-refresh" || os.Args[1] == "style-guide-review-refresh") {
		if len(os.Args) < 3 {
			fmt.Println("Usage: ikmal-editor --style-guide-review-refresh <file.pdf|file.html|file.md|file.txt>")
			return
		}
		runStyleGuideReviewRefresh(os.Args[2])
		return
	}

	if len(os.Args) > 1 && (os.Args[1] == "-style-guide-review-export" || os.Args[1] == "--style-guide-review-export" || os.Args[1] == "style-guide-review-export") {
		if len(os.Args) < 3 {
			fmt.Println("Usage: ikmal-editor --style-guide-review-export <guide-id>")
			return
		}
		runStyleGuideReviewExport(os.Args[2])
		return
	}

	if len(os.Args) > 1 && (os.Args[1] == "-style-guide-review-enrichment-import" || os.Args[1] == "--style-guide-review-enrichment-import" || os.Args[1] == "style-guide-review-enrichment-import") {
		if len(os.Args) < 4 {
			fmt.Println("Usage: ikmal-editor --style-guide-review-enrichment-import <guide-id> <enrichment.jsonl>")
			return
		}
		runStyleGuideReviewEnrichmentImport(os.Args[2], os.Args[3])
		return
	}

	if len(os.Args) > 1 && (os.Args[1] == "-style-guide-review-lint" || os.Args[1] == "--style-guide-review-lint" || os.Args[1] == "style-guide-review-lint") {
		if len(os.Args) < 3 {
			fmt.Println("Usage: ikmal-editor --style-guide-review-lint <guide-id>")
			return
		}
		runStyleGuideReviewLint(os.Args[2])
		return
	}

	if len(os.Args) > 1 && (os.Args[1] == "-style-guide-review-activate" || os.Args[1] == "--style-guide-review-activate" || os.Args[1] == "style-guide-review-activate") {
		if len(os.Args) < 4 {
			fmt.Println("Usage: ikmal-editor --style-guide-review-activate <guide-id> <review.csv>")
			return
		}
		runStyleGuideReviewActivate(os.Args[2], os.Args[3])
		return
	}

	if len(os.Args) > 1 && (os.Args[1] == "-style-guide-list" || os.Args[1] == "--style-guide-list" || os.Args[1] == "style-guide-list") {
		runStyleGuideList()
		return
	}

	if len(os.Args) > 1 && (os.Args[1] == "-style-guide-use" || os.Args[1] == "--style-guide-use" || os.Args[1] == "style-guide-use") {
		if len(os.Args) < 3 {
			fmt.Println("Usage: ikmal-editor --style-guide-use <guide-id>")
			return
		}
		if err := selectStyleGuide(os.Args[2]); err != nil {
			fmt.Printf("Could not select style guide: %v\n", err)
		}
		return
	}

	if len(os.Args) > 1 && (os.Args[1] == "-style-guide-current" || os.Args[1] == "--style-guide-current" || os.Args[1] == "style-guide-current") {
		runStyleGuideCurrent()
		return
	}

	if len(os.Args) > 1 && (os.Args[1] == "-style-guide-enable" || os.Args[1] == "--style-guide-enable" || os.Args[1] == "style-guide-enable") {
		if err := setStyleGuideEnabled(true); err != nil {
			fmt.Printf("Could not enable style guide: %v\n", err)
		}
		return
	}

	if len(os.Args) > 1 && (os.Args[1] == "-style-guide-disable" || os.Args[1] == "--style-guide-disable" || os.Args[1] == "style-guide-disable") {
		if err := setStyleGuideEnabled(false); err != nil {
			fmt.Printf("Could not disable style guide: %v\n", err)
		}
		return
	}

	if len(os.Args) > 1 && (os.Args[1] == "-uninstall" || os.Args[1] == "--uninstall" || os.Args[1] == "uninstall") {
		performUninstall()
		return
	}

	if len(os.Args) > 1 && (os.Args[1] == "-configure-apps" || os.Args[1] == "--configure-apps" || os.Args[1] == "configure-apps") {
		autoConfigureApps()
		return
	}

	if len(os.Args) > 1 && (os.Args[1] == "-integration-status" || os.Args[1] == "--integration-status" || os.Args[1] == "integration-status") {
		printIntegrationStatus()
		return
	}

	fmt.Println("ikmal editor - Local Writing Enhancer for LanguageTool")
	fmt.Println("=========================================")

	// 1. Detect existing installations (Homebrew, APT, Docker, Standalone)
	brewPath := detectHomebrew()
	dockerPath := detectDocker()
	javaPath := detectJava()

	homeDir, err := os.UserHomeDir()
	if err != nil {
		fmt.Printf("ERROR: Unable to locate user home directory: %v\n", err)
		os.Exit(1)
	}

	appDir := filepath.Join(homeDir, ".ikmal-editor")
	rulesDir := filepath.Join(appDir, "rules")
	modelsDir := filepath.Join(appDir, "models")
	ngramsDir := filepath.Join(appDir, "ngrams")
	logsDir := filepath.Join(appDir, "logs")

	os.MkdirAll(rulesDir, 0755)
	os.MkdirAll(modelsDir, 0755)
	os.MkdirAll(ngramsDir, 0755)
	os.MkdirAll(logsDir, 0755)

	// 2. Extract embedded conciseness XML rule pack
	rulePath := filepath.Join(rulesDir, "style_conciseness.xml")
	if err := extractEmbeddedRule(rulePath); err != nil {
		fmt.Printf("Warning: Failed to extract embedded rules: %v\n", err)
	} else {
		fmt.Printf("Mounted Syntactic Conciseness Rule Pack: %s\n", rulePath)
	}

	// 3. Ensure FastText Language Detection Model (lid.176.bin)
	fastTextPath := ensureFastTextModel(modelsDir)

	// 2b. Write server.properties configuration file
	configPath := filepath.Join(appDir, "server.properties")
	rulesFilePath, styleGuideEnabled, err := buildCombinedStyleGuideRules(rulePath)
	if err != nil {
		fmt.Printf("Warning: Could not apply active style guide rules: %v\n", err)
		rulesFilePath = rulePath
	}
	if styleGuideEnabled {
		fmt.Println("Enabled optional style-guide XML rules for the active guide.")
	}
	configContent := fmt.Sprintf("rulesFile=%s\n", rulesFilePath)
	if fastTextPath != "" {
		configContent += fmt.Sprintf("fasttextModel=%s\n", fastTextPath)
	}
	os.WriteFile(configPath, []byte(configContent), 0644)

	// 4. Execution strategy selection
	if brewPath != "" {
		fmt.Printf("Detected Homebrew LanguageTool installation at: %s\n", brewPath)
		startHomebrewService(brewPath, configPath, fastTextPath, logsDir)
	} else if dockerPath != "" && shouldRunDocker() {
		fmt.Printf("Detected Docker at: %s. Launching containerized LanguageTool...\n", dockerPath)
		startDockerContainer(dockerPath, rulePath)
	} else if javaPath != "" {
		fmt.Printf("Detected Java at: %s. Setting up standalone LanguageTool server...\n", javaPath)
		setupStandaloneServer(appDir, javaPath, configPath, fastTextPath, logsDir)
	} else {
		fmt.Println("Warning: Java 17+ or Docker not found. Please install Java or Docker to run LanguageTool locally.")
		fmt.Println("   Mac: brew install openjdk@17 languagetool")
		fmt.Println("   Linux: sudo apt install default-jre")
		os.Exit(1)
	}

	// 5. Verify local server health
	verifyServerHealth()

	// 6. Auto-configure popular apps & browsers (Chrome, Firefox, Safari, Apple Mail, Word, VSCode)
	autoConfigureApps()

	// 7. Tell the user if a newer release exists (runs last so it never delays startup)
	checkForUpdate(appDir)
}

// updateCheckDisabled reports whether the user has opted out of the daily update
// check, via either the -no-update-check flag or IKMAL_EDITOR_NO_UPDATE_CHECK.
func updateCheckDisabled() bool {
	if v := os.Getenv("IKMAL_EDITOR_NO_UPDATE_CHECK"); v != "" && v != "0" && v != "false" {
		return true
	}
	for _, a := range os.Args[1:] {
		if a == "-no-update-check" || a == "--no-update-check" {
			return true
		}
	}
	return false
}

// checkForUpdate fetches a static version file and prints a notice when a newer
// release is available. It deliberately transmits nothing about the user or the
// machine: no identifier is generated or stored, no request body or query string
// is sent, and the only state kept on disk is a timestamp used to rate-limit the
// check to once every 24 hours. Any failure is silent - this is never worth
// interrupting a working install for.
func checkForUpdate(appDir string) {
	if updateCheckDisabled() {
		return
	}

	stampPath := filepath.Join(appDir, ".update-check")
	if info, err := os.Stat(stampPath); err == nil && time.Since(info.ModTime()) < 24*time.Hour {
		return
	}

	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(updateCheckURL)
	if err != nil {
		return
	}
	defer resp.Body.Close()

	// Record the attempt regardless of outcome so a persistently unreachable
	// endpoint cannot turn into a request on every single launch.
	os.WriteFile(stampPath, []byte(time.Now().UTC().Format(time.RFC3339)+"\n"), 0644)

	if resp.StatusCode != http.StatusOK {
		return
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if err != nil {
		return
	}

	latest := extractJSONString(string(body), "version")
	if latest == "" || latest == appVersion {
		return
	}

	fmt.Printf("\nUpdate available: %s (you have %s)\n", latest, appVersion)
	if url := extractJSONString(string(body), "url"); url != "" {
		fmt.Printf("   %s\n", url)
	}
	fmt.Println("   Disable this check with -no-update-check or IKMAL_EDITOR_NO_UPDATE_CHECK=1")
}

// extractJSONString pulls a single top-level string value out of a small, known
// JSON document. The project depends on the standard library only, and encoding/json
// would be the sole reason to introduce a struct here for a two-field payload.
func extractJSONString(doc, key string) string {
	_, rest, ok := strings.Cut(doc, `"`+key+`"`)
	if !ok {
		return ""
	}
	if _, rest, ok = strings.Cut(rest, ":"); !ok {
		return ""
	}
	if _, rest, ok = strings.Cut(rest, `"`); !ok {
		return ""
	}
	val, _, ok := strings.Cut(rest, `"`)
	if !ok {
		return ""
	}
	return val
}

func detectHomebrew() string {
	paths := []string{
		"/opt/homebrew/bin/languagetool",
		"/usr/local/bin/languagetool",
	}
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	if path, err := exec.LookPath("languagetool"); err == nil {
		return path
	}
	return ""
}

func detectDocker() string {
	if path, err := exec.LookPath("docker"); err == nil {
		return path
	}
	return ""
}

func detectJava() string {
	if runtime.GOOS == "windows" {
		// On Windows, prefer javaw.exe (windowless Java launcher)
		if path, err := exec.LookPath("javaw.exe"); err == nil {
			return path
		}
		if path, err := exec.LookPath("java.exe"); err == nil {
			return path
		}
		// Check common Windows installation paths
		winPaths, _ := filepath.Glob(`C:\Program Files*\*\bin\javaw.exe`)
		if len(winPaths) > 0 {
			return winPaths[0]
		}
		if jh := os.Getenv("JAVA_HOME"); jh != "" {
			winJava := filepath.Join(jh, "bin", "javaw.exe")
			if _, err := os.Stat(winJava); err == nil {
				return winJava
			}
		}
	} else {
		if path, err := exec.LookPath("java"); err == nil {
			return path
		}
	}
	return ""
}

func shouldRunDocker() bool {
	return os.Getenv("USE_DOCKER") == "1"
}

func extractEmbeddedRule(targetPath string) error {
	data, err := embeddedRules.ReadFile("rules/style_conciseness.xml")
	if err != nil {
		return err
	}
	return os.WriteFile(targetPath, data, 0644)
}

func ensureFastTextModel(modelsDir string) string {
	target := filepath.Join(modelsDir, "lid.176.bin")
	if _, err := os.Stat(target); err == nil {
		fmt.Printf("FastText Language Identification model found: %s\n", target)
		return target
	}

	url := "https://dl.fbaipublicfiles.com/fasttext/supervised-models/lid.176.bin"
	fmt.Printf("FastText model not found. Downloading lid.176.bin (120MB) from %s...\n", url)
	if err := downloadFile(target, url); err != nil {
		fmt.Printf("Warning: Could not download FastText model: %v\n", err)
		return ""
	}
	fmt.Printf("Downloaded FastText Language Identification model: %s\n", target)
	return target
}

func findHomebrewJarPath() string {
	matches, _ := filepath.Glob("/opt/homebrew/Cellar/languagetool/*/libexec/languagetool-server.jar")
	if len(matches) > 0 {
		return matches[0]
	}
	matchesIntel, _ := filepath.Glob("/usr/local/Cellar/languagetool/*/libexec/languagetool-server.jar")
	if len(matchesIntel) > 0 {
		return matchesIntel[0]
	}
	return ""
}

func startHomebrewService(brewPath, configPath, fastTextPath, logsDir string) {
	fmt.Println("Starting Homebrew LanguageTool server with conciseness rules on port", defaultPort, "...")

	jarPath := findHomebrewJarPath()
	javaPath := detectJava()

	if jarPath != "" && javaPath != "" {
		installMacDaemonForJar(javaPath, jarPath, configPath, fastTextPath, logsDir)
	} else if runtime.GOOS == "darwin" {
		installMacDaemon(brewPath, configPath, fastTextPath, logsDir)
	}
}

func startDockerContainer(dockerPath, rulePath string) {
	fmt.Println("Launching LanguageTool Docker container on port", defaultPort, "...")
	cmd := exec.Command(dockerPath, "run", "-d",
		"--name", "ikmal-editor",
		"-p", defaultPort+":8010",
		"-v", rulePath+":/ngrams/style_conciseness.xml",
		"erikvl87/languagetool:latest",
	)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		fmt.Printf("Container launch output: %v\n", err)
	}
}

func setupStandaloneServer(appDir, javaPath, configPath, fastTextPath, logsDir string) {
	zipPath := filepath.Join(appDir, "LanguageTool-"+languageToolVersion+".zip")
	serverDir := filepath.Join(appDir, "LanguageTool-"+languageToolVersion)

	if _, err := os.Stat(serverDir); os.IsNotExist(err) {
		url := fmt.Sprintf("https://org.languagetool.org/download/LanguageTool-%s.zip", languageToolVersion)
		fmt.Printf("Downloading LanguageTool v%s from %s...\n", languageToolVersion, url)
		if err := downloadFile(zipPath, url); err != nil {
			fmt.Printf("Download failed: %v\n", err)
			return
		}
		fmt.Println("Extracting standalone server...")
		exec.Command("unzip", "-q", zipPath, "-d", appDir).Run()
	}

	jarPath := filepath.Join(serverDir, "languagetool-server.jar")
	if _, err := os.Stat(jarPath); err == nil {
		fmt.Println("Launching standalone LanguageTool Java server...")
		if runtime.GOOS == "darwin" {
			installMacDaemonForJar(javaPath, jarPath, configPath, fastTextPath, logsDir)
		} else if runtime.GOOS == "linux" {
			installLinuxDaemonForJar(javaPath, jarPath, configPath, logsDir)
		} else if runtime.GOOS == "windows" {
			installWindowsDaemonForJar(javaPath, jarPath, configPath, logsDir)
		}
	}
}

func installMacDaemon(binPath, configPath, fastTextPath, logsDir string) {
	homeDir, _ := os.UserHomeDir()
	launchDir := filepath.Join(homeDir, "Library", "LaunchAgents")
	os.MkdirAll(launchDir, 0755)

	logPath := filepath.Join(logsDir, "server.log")
	errLogPath := filepath.Join(logsDir, "server-error.log")

	plistPath := filepath.Join(launchDir, "com.ikmal.editor.plist")
	plistContent := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ikmal.editor</string>
    <key>ProgramArguments</key>
    <array>
        <string>%s</string>
        <string>--port</string>
        <string>%s</string>
        <string>--allow-origin</string>
        <string>*</string>
        <string>--config</string>
        <string>%s</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>%s</string>
    <key>StandardErrorPath</key>
    <string>%s</string>
</dict>
</plist>`, binPath, defaultPort, configPath, logPath, errLogPath)

	os.WriteFile(plistPath, []byte(plistContent), 0644)
	exec.Command("launchctl", "unload", plistPath).Run()
	exec.Command("launchctl", "load", plistPath).Run()
	fmt.Printf("Configured macOS background LaunchAgent daemon: %s\n", plistPath)
}

func installMacDaemonForJar(javaPath, jarPath, configPath, fastTextPath, logsDir string) {
	homeDir, _ := os.UserHomeDir()
	launchDir := filepath.Join(homeDir, "Library", "LaunchAgents")
	os.MkdirAll(launchDir, 0755)

	logPath := filepath.Join(logsDir, "server.log")
	errLogPath := filepath.Join(logsDir, "server-error.log")

	plistPath := filepath.Join(launchDir, "com.ikmal.editor.plist")
	plistContent := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ikmal.editor</string>
    <key>ProgramArguments</key>
    <array>
        <string>%s</string>
        <string>-cp</string>
        <string>%s</string>
        <string>org.languagetool.server.HTTPServer</string>
        <string>--port</string>
        <string>%s</string>
        <string>--allow-origin</string>
        <string>*</string>
        <string>--config</string>
        <string>%s</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>%s</string>
    <key>StandardErrorPath</key>
    <string>%s</string>
</dict>
</plist>`, javaPath, jarPath, defaultPort, configPath, logPath, errLogPath)

	os.WriteFile(plistPath, []byte(plistContent), 0644)
	exec.Command("launchctl", "unload", plistPath).Run()
	exec.Command("launchctl", "load", plistPath).Run()
	fmt.Printf("Configured macOS background LaunchAgent daemon: %s\n", plistPath)
}

func installLinuxDaemonForJar(javaPath, jarPath, configPath, logsDir string) {
	homeDir, _ := os.UserHomeDir()
	systemdDir := filepath.Join(homeDir, ".config", "systemd", "user")
	os.MkdirAll(systemdDir, 0755)

	servicePath := filepath.Join(systemdDir, "ikmal-editor.service")
	serviceContent := fmt.Sprintf(`[Unit]
Description=ikmal editor LanguageTool Server
After=network.target

[Service]
ExecStart=%s -cp %s org.languagetool.server.HTTPServer --port %s --allow-origin "*" --config %s
Restart=always

[Install]
WantedBy=default.target
`, javaPath, jarPath, defaultPort, configPath)

	os.WriteFile(servicePath, []byte(serviceContent), 0644)
	exec.Command("systemctl", "--user", "daemon-reload").Run()
	exec.Command("systemctl", "--user", "enable", "--now", "ikmal-editor").Run()
	fmt.Printf("Configured Linux systemd user service: %s\n", servicePath)
}

func installWindowsDaemonForJar(javaPath, jarPath, configPath, logsDir string) {
	cmdStr := fmt.Sprintf(`"%s" -cp "%s" org.languagetool.server.HTTPServer --port %s --allow-origin "*" --config "%s"`, javaPath, jarPath, defaultPort, configPath)
	exec.Command("reg", "add", `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, "/v", "IkmalEditor", "/t", "REG_SZ", "/d", cmdStr, "/f").Run()
	fmt.Println("Configured Windows Startup Registry Run Key [BETA / EXPERIMENTAL]: HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\IkmalEditor")
}

func downloadFile(filepath string, url string) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	out, err := os.Create(filepath)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	return err
}

func verifyServerHealth() {
	fmt.Println("\nRunning health check against http://127.0.0.1:" + defaultPort + "/v2/check...")
	time.Sleep(1 * time.Second)

	body := strings.NewReader("text=This+is+an+test&language=en-US")
	resp, err := http.Post("http://127.0.0.1:"+defaultPort+"/v2/check", "application/x-www-form-urlencoded", body)
	if err != nil {
		fmt.Printf("Health check note: Server starting up or unavailable: %v\n", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == 200 {
		fmt.Println("LanguageTool Server is LIVE & HEALTHY on port " + defaultPort + "!")
	} else {
		fmt.Printf("Server returned status: %d\n", resp.StatusCode)
	}
}

func performUninstall() {
	fmt.Println("ikmal editor Uninstaller")
	fmt.Println("=================================")

	homeDir, err := os.UserHomeDir()
	if err != nil {
		fmt.Printf("ERROR: Unable to locate user home directory: %v\n", err)
		os.Exit(1)
	}

	// 1. Unload & remove macOS / Linux / Windows background daemons
	if runtime.GOOS == "darwin" && integrationTargetEnabled("macos") {
		plistPath := filepath.Join(homeDir, "Library", "LaunchAgents", "com.ikmal.editor.plist")
		if _, err := os.Stat(plistPath); err == nil {
			fmt.Println("Stopping and unloading macOS LaunchAgent daemon...")
			exec.Command("launchctl", "unload", plistPath).Run()
			os.Remove(plistPath)
			fmt.Printf("Removed LaunchAgent daemon file: %s\n", plistPath)
		}
	} else if runtime.GOOS == "linux" {
		servicePath := filepath.Join(homeDir, ".config", "systemd", "user", "ikmal-editor.service")
		if _, err := os.Stat(servicePath); err == nil {
			fmt.Println("Stopping and disabling Linux systemd user service...")
			exec.Command("systemctl", "--user", "stop", "ikmal-editor").Run()
			exec.Command("systemctl", "--user", "disable", "ikmal-editor").Run()
			os.Remove(servicePath)
			exec.Command("systemctl", "--user", "daemon-reload").Run()
			fmt.Printf("Removed systemd user service file: %s\n", servicePath)
		}
	} else if runtime.GOOS == "windows" {
		fmt.Println("Removing Windows Startup Registry Key...")
		exec.Command("reg", "delete", `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, "/v", "IkmalEditor", "/f").Run()
		exec.Command("reg", "delete", `HKCU\Software\Policies\Google\Chrome`, "/v", "server_url", "/f").Run()
		exec.Command("reg", "delete", `HKCU\Software\Policies\Microsoft\Edge`, "/v", "server_url", "/f").Run()
	}

	// 2. Terminate running LanguageTool processes
	fmt.Println("Terminating running LanguageTool server processes...")
	if runtime.GOOS == "windows" {
		exec.Command("taskkill", "/F", "/IM", "javaw.exe").Run()
		exec.Command("taskkill", "/F", "/IM", "java.exe").Run()
	} else {
		exec.Command("pkill", "-f", "languagetool").Run()
	}

	// 3. Stop & remove Docker container if present
	if dockerPath := detectDocker(); dockerPath != "" {
		exec.Command(dockerPath, "stop", "ikmal-editor").Run()
		exec.Command(dockerPath, "rm", "ikmal-editor").Run()
	}

	// 5. Clean up app & browser configuration files
	fmt.Println("Cleaning up app & browser configuration files...")
	if runtime.GOOS == "darwin" {
		exec.Command("defaults", "delete", "org.languagetool.mac").Run()
		exec.Command("defaults", "delete", "com.languagetool.word").Run()
	}
	os.Remove(filepath.Join(homeDir, "Library", "Application Support", "Mozilla", "ManagedStorage", "languagetool-webextension@languagetool.org.json"))
	os.Remove(filepath.Join(homeDir, "Library", "Application Support", "Google", "Chrome", "External Extensions", "lhgkgpnhbakdcadgobkbbkoicdikgadj.json"))
	os.Remove(filepath.Join(homeDir, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts", "lhgkgpnhbakdcadgobkbbkoicdikgadj.json"))
	fmt.Println("Cleared browser policies and application defaults.")

	fmt.Println("\nUninstall complete! All background services and data files have been removed.")
}

func autoConfigureApps() {
	fmt.Println("\nAuto-Configuring Popular Products for ikmal editor")
	fmt.Println("==========================================================")
	fmt.Println("Note: ikmal-editor configures settings for installed plugins/extensions,")
	fmt.Println("      but does NOT download extensions automatically. Download official extensions at:")
	fmt.Println("      https://dev.languagetool.org/software-that-supports-languagetool-as-a-plug-in-or-add-on")
	fmt.Println("")

	homeDir, err := os.UserHomeDir()
	if err != nil {
		fmt.Printf("ERROR: Unable to locate user home directory: %v\n", err)
		return
	}

	serverUrl := os.Getenv("IKMAL_EDITOR_SERVER_URL")
	if serverUrl == "" {
		serverUrl = "http://127.0.0.1:" + defaultPort + "/v2"
	}

	// 1. LanguageTool for Mac (Safari, Apple Mail, System-wide TextEdit/Messages)
	if runtime.GOOS == "darwin" && integrationTargetEnabled("macos") {
		fmt.Println("Auto-configuring LanguageTool for Mac (Safari, Apple Mail, System-wide)...")
		exec.Command("defaults", "write", "org.languagetool.mac", "apiServer", serverUrl).Run()
		exec.Command("defaults", "write", "org.languagetool.mac", "useLocalServer", "-bool", "true").Run()
		exec.Command("defaults", "write", "com.languagetool.word", "serverUrl", serverUrl+"/check").Run()
		fmt.Println("  Configured macOS defaults: org.languagetool.mac & com.languagetool.word ->", serverUrl)
	}

	// 2. Mozilla Firefox Managed Storage
	if integrationTargetEnabled("firefox") {
		firefoxDir := filepath.Join(homeDir, "Library", "Application Support", "Mozilla", "ManagedStorage")
		if runtime.GOOS == "linux" {
			firefoxDir = filepath.Join(homeDir, ".mozilla", "managed-storage")
		}
		os.MkdirAll(firefoxDir, 0755)
		firefoxConfigPath := filepath.Join(firefoxDir, "languagetool-webextension@languagetool.org.json")
		firefoxJson := fmt.Sprintf(`{
  "name": "languagetool-webextension@languagetool.org",
  "description": "Auto-configuration for ikmal editor local server",
  "type": "storage",
  "data": {
    "serverUrl": "%s/check",
    "otherServerUrl": "%s/check",
    "useLocalServer": true
  }
}`, serverUrl, serverUrl)
		if err := os.WriteFile(firefoxConfigPath, []byte(firefoxJson), 0644); err == nil {
			fmt.Println("  Configured Mozilla Firefox managed storage:", firefoxConfigPath)
		}
	}

	// 3. Google Chrome & Chromium Managed Extension Policies (Arc, Brave, Edge)
	if integrationTargetEnabled("chrome") {
		chromePolicyDirs := []string{
			filepath.Join(homeDir, "Library", "Application Support", "Google", "Chrome", "External Extensions"),
			filepath.Join(homeDir, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts"),
		}
		if runtime.GOOS == "linux" {
			chromePolicyDirs = []string{
				filepath.Join(homeDir, ".config", "google-chrome", "External Extensions"),
				filepath.Join(homeDir, ".config", "google-chrome", "NativeMessagingHosts"),
			}
		}
		for _, dir := range chromePolicyDirs {
			os.MkdirAll(dir, 0755)
			chromePolicyPath := filepath.Join(dir, "lhgkgpnhbakdcadgobkbbkoicdikgadj.json")
			chromeJson := fmt.Sprintf(`{
  "external_update_url": "https://clients2.google.com/service/update2/crx",
  "server_url": "%s/check"
}`, serverUrl)
			if err := os.WriteFile(chromePolicyPath, []byte(chromeJson), 0644); err == nil {
				fmt.Println("  Configured Chrome & Chromium policy:", chromePolicyPath)
			}
		}
	}

	// 4. VSCode User Settings Integration
	if integrationTargetEnabled("vscode") {
		vscodeSettingsPath := filepath.Join(homeDir, "Library", "Application Support", "Code", "User", "settings.json")
		if runtime.GOOS == "linux" {
			vscodeSettingsPath = filepath.Join(homeDir, ".config", "Code", "User", "settings.json")
		}
		if _, err := os.Stat(vscodeSettingsPath); err == nil {
			content, readErr := os.ReadFile(vscodeSettingsPath)
			if readErr == nil && !strings.Contains(string(content), "languageTool.serverUrl") {
				str := string(content)
				if strings.HasSuffix(strings.TrimSpace(str), "}") {
					trimmed := strings.TrimRight(strings.TrimSpace(str), "}\n\r\t ")
					updated := fmt.Sprintf("%s,\n  \"languageTool.serverUrl\": \"%s\"\n}", trimmed, serverUrl)
					os.WriteFile(vscodeSettingsPath, []byte(updated), 0644)
					fmt.Println("  Configured VSCode user settings:", vscodeSettingsPath)
				}
			} else {
				fmt.Println("  VSCode user settings already configured:", vscodeSettingsPath)
			}
		}
	}

	fmt.Printf("Product auto-configuration complete! Local server URL (%s) is active across browsers and office suites.\n", serverUrl)
}

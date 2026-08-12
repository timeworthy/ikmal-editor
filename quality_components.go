package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// The optional quality stack is the one part of ikmal-editor that installs
// third-party code and model weights onto the user's machine. The core product
// needs only Java; this path additionally resolves an npm dependency tree and
// downloads model weights whose license is not ours to grant. That is a
// materially different supply-chain and licensing surface, so it is disclosed
// and confirmed before anything is written rather than after.

const qualityNoticesRevision = 1

type qualityComponent struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Installed bool   `json:"installed"`
	Detail    string `json:"detail"`
	Source    string `json:"source"`
	License   string `json:"license"`
	Size      string `json:"size"`
}

type qualityStatusResponse struct {
	Ready bool `json:"ready"`
	// Whether the transformer is answering right now, which is a different
	// question from whether its files are on disk. The settings panel used to
	// report only the second and tell the user to "start services with the
	// transformer enabled" — an instruction with no control behind it, for a
	// thing the desktop app already does on its own.
	TransformerRunning bool               `json:"transformerRunning"`
	NoticesAccepted    bool               `json:"noticesAccepted"`
	ModelID            string             `json:"modelId"`
	ModelIsDefault     bool               `json:"modelIsDefault"`
	ModelLicense       string             `json:"modelLicense"`
	NoticesPath        string             `json:"noticesPath"`
	Components         []qualityComponent `json:"components"`
}

type qualityConsentRecord struct {
	Revision   int    `json:"revision"`
	AcceptedAt string `json:"acceptedAt"`
	Model      string `json:"model"`
	Via        string `json:"via"`
}

func qualityConsentPath() string {
	qualityDir, _ := qualityRuntimePaths()
	return filepath.Join(filepath.Dir(qualityDir), "quality-notices-accepted.json")
}

// qualityNoticesAccepted reports whether this machine has already acknowledged
// the current revision of the notices. Acceptance is remembered so the prompt
// costs the user exactly one interaction, not one per setup run.
func qualityNoticesAccepted() bool {
	if envAcceptsQualityNotices() {
		return true
	}
	contents, err := os.ReadFile(qualityConsentPath())
	if err != nil {
		return false
	}
	var record qualityConsentRecord
	if err := json.Unmarshal(contents, &record); err != nil {
		return false
	}
	return record.Revision >= qualityNoticesRevision
}

func envAcceptsQualityNotices() bool {
	value := strings.TrimSpace(os.Getenv("IKMAL_ACCEPT_QUALITY_NOTICES"))
	return value == "1" || strings.EqualFold(value, "true") || strings.EqualFold(value, "yes")
}

func recordQualityNoticesAccepted(via string) {
	modelID, _ := resolveQualityTransformerModel()
	record := qualityConsentRecord{
		Revision:   qualityNoticesRevision,
		AcceptedAt: time.Now().UTC().Format(time.RFC3339),
		Model:      modelID,
		Via:        via,
	}
	path := qualityConsentPath()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return
	}
	contents, err := json.MarshalIndent(record, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(path, contents, 0644)
}

func detectQualityStatus() qualityStatusResponse {
	qualityDir, adapterPath := qualityRuntimePaths()
	modelID, isDefault := resolveQualityTransformerModel()
	modelCache := filepath.Join(filepath.Dir(qualityDir), "models")

	modelLicense := "Set by the publisher of " + modelID
	if isDefault {
		modelLicense = "CC BY-NC-SA 4.0 (non-commercial)"
	}

	nodePath := findQualityExecutable("node")
	npmPath := findQualityExecutable("npm")
	transformerPackage := filepath.Join(qualityDir, "node_modules", "@huggingface", "transformers")

	components := []qualityComponent{
		{
			ID:        "node",
			Name:      "Node.js and npm",
			Installed: nodePath != "" && npmPath != "",
			Detail:    describeRuntimeDetail(nodePath, npmPath),
			Source:    "Already on your system; ikmal-editor never installs it",
			License:   "MIT",
			Size:      "—",
		},
		{
			ID:        "adapter",
			Name:      "Quality adapter",
			Installed: fileExists(adapterPath),
			Detail:    adapterPath,
			Source:    "Embedded in ikmal-editor",
			License:   "MIT (ours)",
			Size:      "<1 MB",
		},
		{
			ID:        "runtime",
			Name:      "Transformers.js / ONNX runtime",
			Installed: fileExists(transformerPackage),
			Detail:    "npm dependency tree under " + qualityDir,
			Source:    "npm registry (resolves transitive dependencies)",
			License:   "Apache-2.0, MIT",
			Size:      "~340 MB",
		},
		{
			ID:        "model",
			Name:      "Grammar model weights",
			Installed: modelWeightsPresent(modelCache, modelID),
			Detail:    modelID,
			Source:    "Hugging Face",
			License:   modelLicense,
			Size:      "~310 MB",
		},
	}

	ready := true
	for _, component := range components {
		if !component.Installed {
			ready = false
			break
		}
	}

	return qualityStatusResponse{
		Ready:              ready,
		TransformerRunning: qualityTransformerAnswering(),
		NoticesAccepted:    qualityNoticesAccepted(),
		ModelID:            modelID,
		ModelIsDefault:     isDefault,
		ModelLicense:       modelLicense,
		NoticesPath:        "THIRD-PARTY-NOTICES.md",
		Components:         components,
	}
}

func describeRuntimeDetail(nodePath, npmPath string) string {
	switch {
	case nodePath != "" && npmPath != "":
		return nodePath
	case nodePath != "":
		return "node found, npm missing"
	case npmPath != "":
		return "npm found, node missing"
	default:
		return "Not found on PATH"
	}
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// modelWeightsPresent looks for any cached artifact belonging to the model. The
// cache layout is owned by Transformers.js, so this checks for the model's
// directory rather than assuming specific file names.
func modelWeightsPresent(modelCache, modelID string) bool {
	candidate := filepath.Join(modelCache, filepath.FromSlash(modelID))
	if entries, err := os.ReadDir(candidate); err == nil && len(entries) > 0 {
		return true
	}
	return false
}

func printQualityStatus() {
	if err := json.NewEncoder(os.Stdout).Encode(detectQualityStatus()); err != nil {
		fmt.Printf("Could not read quality status: %v\n", err)
	}
}

func printQualityNotices(status qualityStatusResponse) {
	fmt.Println()
	fmt.Println("ikmal editor is about to install the optional quality stack.")
	fmt.Println("This is the only part of ikmal editor that adds third-party code")
	fmt.Println("and model weights to your machine. Nothing has been written yet.")
	fmt.Println()
	for _, component := range status.Components {
		if component.ID == "node" || component.Installed {
			continue
		}
		fmt.Printf("  %-34s %8s  %s\n", component.Name, component.Size, component.License)
		fmt.Printf("  %-34s           from %s\n", "", component.Source)
	}
	fmt.Println()
	fmt.Println("Supply chain: the runtime is installed with `npm install`, which")
	fmt.Println("resolves a transitive dependency tree from the npm registry.")
	if status.ModelIsDefault {
		fmt.Println()
		fmt.Println("License: the default model derives from")
		fmt.Println("vennify/t5-base-grammar-correction, licensed CC BY-NC-SA 4.0 —")
		fmt.Println("NON-COMMERCIAL use only. ikmal editor's MIT license does not")
		fmt.Println("extend to these weights, and downloading them makes you the")
		fmt.Println("party bound by that license. For commercial use, set")
		fmt.Println("IKMAL_TRANSFORMER_MODEL to a permissive model such as")
		fmt.Println("Unbabel/gec-t5_small (Apache-2.0) and run setup again.")
	}
	fmt.Println()
	fmt.Println("Full details: THIRD-PARTY-NOTICES.md")
	fmt.Println()
}

// confirmQualityNotices gates setup on an explicit acknowledgement. It returns
// false when the caller should stop. Non-interactive callers (CI, containers,
// the desktop app) pass consent through IKMAL_ACCEPT_QUALITY_NOTICES rather
// than being prompted, so setup never blocks on a prompt nobody can answer.
func confirmQualityNotices() bool {
	if qualityNoticesAccepted() {
		return true
	}

	status := detectQualityStatus()
	printQualityNotices(status)

	if !stdinIsInteractive() {
		printQualityNoticesNonInteractiveHelp()
		return false
	}

	fmt.Print("Install the optional quality stack? [y/N]: ")
	reader := bufio.NewReader(os.Stdin)
	answer, err := reader.ReadString('\n')
	if err != nil {
		// Reachable when stdin looks interactive but cannot be read, most
		// commonly /dev/null, which is a character device.
		fmt.Println()
		printQualityNoticesNonInteractiveHelp()
		return false
	}
	answer = strings.ToLower(strings.TrimSpace(answer))
	if answer != "y" && answer != "yes" {
		fmt.Println("Nothing was installed.")
		return false
	}

	recordQualityNoticesAccepted("cli")
	fmt.Println()
	return true
}

func printQualityNoticesNonInteractiveHelp() {
	fmt.Println("Setup needs an explicit acknowledgement to continue.")
	fmt.Println("Re-run interactively, or set IKMAL_ACCEPT_QUALITY_NOTICES=1")
	fmt.Println("to confirm you have read the notices above.")
	fmt.Println("Nothing was installed.")
}

func stdinIsInteractive() bool {
	info, err := os.Stdin.Stat()
	if err != nil {
		return false
	}
	return info.Mode()&os.ModeCharDevice != 0
}

// qualityTransformerAnswering probes the local adapter. A short timeout keeps a
// settings refresh responsive: the answer is only ever advisory, and "not
// answering" is the honest reading of a probe that did not come back.
func qualityTransformerAnswering() bool {
	client := &http.Client{Timeout: 400 * time.Millisecond}
	response, err := client.Get("http://127.0.0.1:" + qualityTransformerPort() + "/health")
	if err != nil {
		return false
	}
	defer response.Body.Close()
	return response.StatusCode == http.StatusOK
}

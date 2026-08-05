package main

import (
	_ "embed"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

const qualityTransformerModelID = "Xenova/t5-base-grammar-correction"

// resolveQualityTransformerModel mirrors the adapter's own env lookup so setup
// reports and warns about the model that will actually be downloaded.
func resolveQualityTransformerModel() (id string, isDefault bool) {
	if override := os.Getenv("IKMAL_TRANSFORMER_MODEL"); override != "" {
		return override, false
	}
	return qualityTransformerModelID, true
}

// The adapter and package manifest are embedded so the standalone Go binary
// can provision the same Transformers.js/ONNX style used by ikmal.
//
//go:embed quality_transformer.mjs
var embeddedQualityTransformerJS []byte

//go:embed quality-package.json
var embeddedQualityPackageJSON []byte

func runQualitySetup() {
	// Confirm before the first write. Everything past this point creates
	// directories, resolves an npm tree, or downloads model weights.
	if !confirmQualityNotices() {
		return
	}

	qualityDir, adapterPath := qualityRuntimePaths()
	if err := os.MkdirAll(qualityDir, 0755); err != nil {
		fmt.Printf("Quality setup failed: %v\n", err)
		return
	}

	packagePath := filepath.Join(qualityDir, "package.json")
	if err := os.WriteFile(adapterPath, embeddedQualityTransformerJS, 0755); err != nil {
		fmt.Printf("Quality setup failed writing adapter: %v\n", err)
		return
	}
	if err := os.WriteFile(packagePath, embeddedQualityPackageJSON, 0644); err != nil {
		fmt.Printf("Quality setup failed writing package manifest: %v\n", err)
		return
	}

	nodePath := findQualityExecutable("node")
	npmPath := findQualityExecutable("npm")
	if nodePath == "" || npmPath == "" {
		fmt.Println("Node.js and npm were not both found; the adapter files are ready, but the ONNX runtime was not installed.")
		printQualitySetupCommands(qualityDir, adapterPath, "")
		return
	}

	fmt.Println("Installing the local Transformers.js/ONNX quality runtime...")
	if err := runQualityCommand(npmPath, "install", "--prefix", qualityDir, "--no-audit", "--no-fund"); err != nil {
		fmt.Printf("Could not install the quality runtime: %v\n", err)
		printQualitySetupCommands(qualityDir, adapterPath, nodePath)
		return
	}

	// Preload explicitly during setup so the model download is visible and
	// failures happen during setup rather than the first document check.
	modelID, _ := resolveQualityTransformerModel()
	fmt.Printf("Downloading and caching %s if needed...\n", modelID)
	if err := runQualityCommand(nodePath, adapterPath, "--preload"); err != nil {
		fmt.Printf("Quality runtime installed, but model preload failed: %v\n", err)
	}
	printQualitySetupCommands(qualityDir, adapterPath, nodePath)
}

func qualityRuntimePaths() (qualityDir, adapterPath string) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(".ikmal-editor", "quality"), filepath.Join(".ikmal-editor", "quality", "quality_transformer.mjs")
	}
	qualityDir = filepath.Join(homeDir, ".ikmal-editor", "quality")
	return qualityDir, filepath.Join(qualityDir, "quality_transformer.mjs")
}

func findQualityExecutable(name string) string {
	if runtime.GOOS == "windows" && name == "npm" {
		if path, err := exec.LookPath("npm.cmd"); err == nil {
			return path
		}
	}
	if path, err := exec.LookPath(name); err == nil {
		return path
	}
	return ""
}

func runQualityCommand(name string, args ...string) error {
	command := exec.Command(name, args...)
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	return command.Run()
}

func printQualitySetupCommands(qualityDir, adapterPath, nodePath string) {
	if nodePath == "" {
		nodePath = "node"
	}
	modelCache := filepath.Join(filepath.Dir(qualityDir), "models")
	if homeDir, err := os.UserHomeDir(); err == nil {
		modelCache = filepath.Join(homeDir, ".ikmal-editor", "models")
	}
	fmt.Println("Start the optional quality services with:")
	fmt.Printf("  IKMAL_TRANSFORMER_CACHE_DIR=%q %s %s\n", modelCache, nodePath, adapterPath)
	fmt.Println("  ./ikmal-editor --quality-server --quality-transformer")
}

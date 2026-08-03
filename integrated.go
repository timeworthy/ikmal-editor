package main

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"time"
)

const integratedProxyURL = "http://127.0.0.1:8096/v2"

// runIntegrated starts the existing LanguageTool manager, then keeps the
// quality-compatible proxy alive alongside it. LanguageTool remains on 8097
// for existing clients; browser extensions use the proxy on 8096.
func runIntegrated() {
	if !languageToolReady() {
		languageTool := exec.Command(os.Args[0])
		languageTool.Stdout = os.Stdout
		languageTool.Stderr = os.Stderr
		if err := languageTool.Start(); err != nil {
			fmt.Printf("Could not start LanguageTool manager: %v\n", err)
			return
		}
		go func() { _ = languageTool.Wait() }()
		if !waitForHTTP("http://127.0.0.1:"+defaultPort+"/v2/languages", 30*time.Second) {
			fmt.Println("LanguageTool did not become ready; integrated startup stopped.")
			return
		}
	}

	proxyProcess := startIntegratedProxy()
	if proxyProcess == nil && !httpReady("http://127.0.0.1:8096/health") {
		return
	}

	os.Setenv("IKMAL_EDITOR_SERVER_URL", integratedProxyURL)
	autoConfigureApps()
	fmt.Println("Integrated Ikmal services are running:")
	fmt.Println("  LanguageTool: http://127.0.0.1:8097")
	fmt.Println("  Browser proxy: http://127.0.0.1:8096/v2")
	if proxyProcess == nil {
		return
	}
	defer stopManagedQualityTransformer(proxyProcess)
	_ = proxyProcess.Wait()
}

func languageToolReady() bool {
	return httpReady("http://127.0.0.1:" + defaultPort + "/v2/languages")
}

func startIntegratedProxy() *exec.Cmd {
	if httpReady("http://127.0.0.1:8096/health") {
		fmt.Println("Using the existing Ikmal quality proxy on port 8096.")
		return nil
	}
	command := exec.Command(os.Args[0], "--quality-proxy", "--quality-transformer")
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	if err := command.Start(); err != nil {
		fmt.Printf("Could not start integrated quality proxy: %v\n", err)
		return nil
	}
	if !waitForHTTP("http://127.0.0.1:8096/health", 30*time.Second) {
		fmt.Println("Integrated quality proxy did not become ready.")
		_ = command.Process.Kill()
		_ = command.Wait()
		return nil
	}
	return command
}

func waitForHTTP(endpoint string, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	client := &http.Client{Timeout: 500 * time.Millisecond}
	for time.Now().Before(deadline) {
		if response, err := client.Get(endpoint); err == nil {
			response.Body.Close()
			if response.StatusCode >= http.StatusOK && response.StatusCode < http.StatusBadRequest {
				return true
			}
		}
		time.Sleep(250 * time.Millisecond)
	}
	return false
}

func httpReady(endpoint string) bool {
	client := &http.Client{Timeout: 300 * time.Millisecond}
	response, err := client.Get(endpoint)
	if err != nil {
		return false
	}
	defer response.Body.Close()
	return response.StatusCode >= http.StatusOK && response.StatusCode < http.StatusBadRequest
}

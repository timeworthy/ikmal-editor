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

	var proxyProcess *exec.Cmd
	var qualityProcess *exec.Cmd
	if httpReady("http://127.0.0.1:8096/health") {
		fmt.Println("Using the existing ikmal quality proxy on port 8096.")
		if !qualityEndpointReady() {
			fmt.Println("Existing quality proxy is ready, but the quality engine is unavailable. Starting the managed quality engine.")
			qualityProcess = startManagedQualityServer()
		}
	} else {
		proxyProcess = startIntegratedProxy()
	}
	if proxyProcess == nil && qualityProcess == nil && !httpReady("http://127.0.0.1:8096/health") {
		return
	}

	os.Setenv("IKMAL_EDITOR_SERVER_URL", integratedProxyURL)
	fmt.Println("Existing app integrations were left unchanged. Use the ikmal editor enhancer settings to configure selected integrations.")
	fmt.Println("Integrated ikmal services are running:")
	fmt.Println("  LanguageTool: http://127.0.0.1:8097")
	fmt.Println("  Browser proxy: http://127.0.0.1:8096/v2")
	if proxyProcess == nil && qualityProcess == nil {
		return
	}
	monitorIntegratedServices(&proxyProcess, &qualityProcess)
}

func languageToolReady() bool {
	return httpReady("http://127.0.0.1:" + defaultPort + "/v2/languages")
}

func startIntegratedProxy() *exec.Cmd {
	if httpReady("http://127.0.0.1:8096/health") {
		fmt.Println("Using the existing ikmal quality proxy on port 8096.")
		return nil
	}
	command := exec.Command(os.Args[0], "--quality-proxy")
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

// readinessGrace is how long a freshly started service may stay unhealthy
// before the supervisor treats it as failed. LanguageTool loads its rule sets
// and language models on start, which takes far longer than a health tick;
// without this the supervisor would kill it while it was still starting and
// never let it finish.
const readinessGrace = 90 * time.Second

// maxRestartFailures bounds how many times the supervisor will respawn a
// service that never becomes healthy before it gives up and says so.
const maxRestartFailures = 5

// managedService supervises one child process. It owns how to start it, how to
// tell whether it is answering, and when it exited.
type managedService struct {
	name    string
	start   func() *exec.Cmd
	healthy func() bool

	command   *exec.Cmd
	exited    chan struct{}
	startedAt time.Time
	failures  int
	// supervised stays true between a failed restart and the next attempt, so
	// a service the supervisor still intends to revive is not mistaken for one
	// it never owned.
	supervised bool
}

func newManagedService(name string, command *exec.Cmd, start func() *exec.Cmd, healthy func() bool) *managedService {
	service := &managedService{name: name, start: start, healthy: healthy}
	service.adopt(command)
	return service
}

// adopt takes ownership of a started process. Wait runs on its own goroutine
// because ProcessState is only ever populated by Wait: without it an exited
// child is invisible to the supervisor and lingers as a zombie.
func (service *managedService) adopt(command *exec.Cmd) {
	service.command = command
	service.exited = nil
	service.startedAt = time.Now()
	service.supervised = service.supervised || command != nil
	if command == nil || command.Process == nil {
		return
	}
	exited := make(chan struct{})
	service.exited = exited
	go func() {
		_ = command.Wait()
		close(exited)
	}()
}

func (service *managedService) running() bool {
	return service.supervised
}

func (service *managedService) hasExited() bool {
	if service.exited == nil {
		return false
	}
	select {
	case <-service.exited:
		return true
	default:
		return false
	}
}

// stop kills the child and waits for the adopt goroutine to reap it, so the
// port is released before a restart tries to bind it again.
func (service *managedService) stop() {
	if service.command == nil || service.command.Process == nil {
		service.command = nil
		return
	}
	_ = service.command.Process.Kill()
	if service.exited != nil {
		<-service.exited
	}
	service.command = nil
	service.exited = nil
}

// check restarts the service if it has exited or has stopped answering. It
// reports whether supervision should continue.
func (service *managedService) check() bool {
	if !service.running() {
		return false
	}
	exited := service.command != nil && service.hasExited()
	if service.command != nil && !exited {
		if service.healthy() {
			service.failures = 0
			return true
		}
		// An unhealthy service inside its grace window is still starting.
		if time.Since(service.startedAt) < readinessGrace {
			return true
		}
		fmt.Printf("Managed %s stopped answering; restarting it.\n", service.name)
	} else if exited {
		fmt.Printf("Managed %s stopped; restarting it.\n", service.name)
	}

	service.stop()
	service.adopt(service.start())
	if service.command != nil {
		// A spawn is not yet a recovery. The counter is cleared above, once the
		// service is actually observed answering; counting the attempt here
		// bounds a child that starts cleanly and dies immediately — losing a
		// port race to another process looks exactly like that, and without a
		// bound the supervisor respawns it every tick forever.
		service.failures++
		if service.failures >= maxRestartFailures {
			fmt.Printf("Managed %s restarted %d times without becoming healthy; no longer supervising it.\n", service.name, service.failures)
			service.stop()
			service.supervised = false
			return false
		}
		return true
	}

	// A start that declines because the endpoint is already answering means
	// something else now provides this service. That is not a failure; there
	// is simply nothing left for this supervisor to own.
	if service.healthy() {
		fmt.Printf("Managed %s is now provided by another process; no longer supervising it.\n", service.name)
		service.supervised = false
		return false
	}

	service.failures++
	// Report rather than going quiet: the supervisor has just killed the
	// service the user was relying on, and a silent exit is the one outcome
	// they cannot act on.
	fmt.Printf("Managed %s could not be restarted (attempt %d).\n", service.name, service.failures)
	if service.failures >= maxRestartFailures {
		fmt.Printf("Managed %s failed to restart %d times; no longer supervising it.\n", service.name, service.failures)
		service.supervised = false
		return false
	}
	// Stay supervised so the next tick retries.
	service.startedAt = time.Now()
	return true
}

// monitorIntegratedServices keeps the managed services alive until every one it
// owns is gone. The proxy and the quality engine are judged on their own health
// endpoints: the proxy answers on 8096 and manages its own quality server, so
// folding the engine's health into the proxy's restart test would kill a
// perfectly healthy proxy every time the engine was slow to load or absent.
func monitorIntegratedServices(proxyProcess **exec.Cmd, qualityProcess **exec.Cmd) {
	proxy := newManagedService("quality proxy", *proxyProcess, startIntegratedProxy, func() bool {
		return httpReady("http://127.0.0.1:8096/health")
	})
	quality := newManagedService("quality engine", *qualityProcess, func() *exec.Cmd {
		return startManagedQualityServer()
	}, qualityEndpointReady)

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		proxyAlive := proxy.check()
		qualityAlive := quality.check()
		*proxyProcess = proxy.command
		*qualityProcess = quality.command
		if !proxyAlive && !qualityAlive {
			return
		}
	}
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

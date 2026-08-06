package main

import (
	"os/exec"
	"testing"
	"time"
)

// placeholderCommand stands in for a running child. It has no Process, so the
// supervisor's exit detection treats it as alive, which is what these tests
// want: they exercise the restart decision, not process reaping.
func placeholderCommand() *exec.Cmd { return &exec.Cmd{} }

func TestSupervisorLeavesAHealthyServiceAlone(t *testing.T) {
	starts := 0
	service := newManagedService("test service", placeholderCommand(), func() *exec.Cmd {
		starts++
		return placeholderCommand()
	}, func() bool { return true })

	for range 5 {
		if !service.check() {
			t.Fatal("expected supervision to continue for a healthy service")
		}
	}
	if starts != 0 {
		t.Fatalf("a healthy service must never be restarted, got %d restarts", starts)
	}
}

// The regression this guards: the quality engine loads a transformer model on
// first use and is unhealthy for far longer than one health tick. A supervisor
// that restarts on the first unhealthy reading kills it mid-load, forever.
func TestSupervisorWaitsOutTheReadinessGrace(t *testing.T) {
	starts := 0
	service := newManagedService("quality engine", placeholderCommand(), func() *exec.Cmd {
		starts++
		return placeholderCommand()
	}, func() bool { return false })

	for range 5 {
		if !service.check() {
			t.Fatal("expected supervision to continue during the grace window")
		}
	}
	if starts != 0 {
		t.Fatalf("a starting service must not be restarted, got %d restarts", starts)
	}

	// Once the grace window has passed, an unhealthy service is restarted.
	service.startedAt = time.Now().Add(-readinessGrace - time.Second)
	if !service.check() {
		t.Fatal("expected supervision to continue after a restart")
	}
	if starts != 1 {
		t.Fatalf("expected exactly one restart past the grace window, got %d", starts)
	}
}

func TestSupervisorGivesUpLoudlyWhenRestartsKeepFailing(t *testing.T) {
	attempts := 0
	service := newManagedService("quality proxy", placeholderCommand(), func() *exec.Cmd {
		attempts++
		return nil
	}, func() bool { return false })

	// Push past the grace window so every tick is a genuine restart attempt.
	service.startedAt = time.Now().Add(-readinessGrace - time.Second)
	for i := range 4 {
		if !service.check() {
			t.Fatalf("expected supervision to keep retrying at attempt %d", i+1)
		}
		service.startedAt = time.Now().Add(-readinessGrace - time.Second)
	}
	if service.check() {
		t.Fatal("expected supervision to stop after repeated restart failures")
	}
	if attempts != 5 {
		t.Fatalf("expected 5 restart attempts before giving up, got %d", attempts)
	}
}

// A start that declines because the endpoint already answers means another
// process now provides the service. The supervisor should stand down rather
// than count that as a failure.
func TestSupervisorStandsDownWhenAnotherProcessProvidesTheService(t *testing.T) {
	healthy := false
	service := newManagedService("quality proxy", placeholderCommand(), func() *exec.Cmd {
		healthy = true
		return nil
	}, func() bool { return healthy })

	service.startedAt = time.Now().Add(-readinessGrace - time.Second)
	if service.check() {
		t.Fatal("expected supervision to stop once another process owns the service")
	}
	if service.failures != 0 {
		t.Fatalf("standing down is not a failure, got %d failures", service.failures)
	}
}

// A service that was never started must not be supervised into existence.
func TestSupervisorIgnoresAServiceItDoesNotOwn(t *testing.T) {
	starts := 0
	service := newManagedService("quality engine", nil, func() *exec.Cmd {
		starts++
		return placeholderCommand()
	}, func() bool { return false })

	if service.check() {
		t.Fatal("expected an unowned service to report no supervision")
	}
	if starts != 0 {
		t.Fatalf("an unowned service must not be started, got %d starts", starts)
	}
}

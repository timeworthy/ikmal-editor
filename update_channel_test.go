package main

import (
	"os"
	"strings"
	"testing"
)

func TestVersionIsNewerOrdersReleasesAndPrereleases(t *testing.T) {
	cases := []struct {
		candidate, current string
		newer              bool
		why                string
	}{
		{"0.9.1-beta", "0.9.0-beta", true, "a later patch, both prerelease"},
		{"0.9.0-beta", "0.9.1-beta", false, "an earlier patch is never an update"},
		{"0.9.0-beta", "0.9.0-beta", false, "the same version is not an update"},
		{"0.10.0", "0.9.0", true, "10 is compared as a number, not a string"},
		{"1.0.0", "0.9.9", true, "a major bump"},
		{"0.9.1", "0.9.1-beta", true, "the release outranks its own prerelease"},
		{"0.9.1-beta", "0.9.1", false, "a prerelease never supersedes the release"},
		{"0.9.1-rc2", "0.9.1-rc1", true, "rc2 follows rc1"},
		{"0.9.1-rc10", "0.9.1-rc9", false, "semver compares alphanumeric identifiers as text, so rc10 sorts BELOW rc9 — name prereleases -beta, or zero-pad past nine"},
		{"v0.9.1", "0.9.0", true, "a tag name with its leading v is accepted"},
		{"", "0.9.0", false, "an empty published version must never nag"},
		{"not-a-version", "0.9.0", false, "a malformed published version must never nag"},
		{"0.9.1", "", false, "an unknown local version cannot be behind"},
	}
	for _, c := range cases {
		if got := versionIsNewer(c.candidate, c.current); got != c.newer {
			t.Errorf("versionIsNewer(%q, %q) = %v, want %v — %s", c.candidate, c.current, got, c.newer, c.why)
		}
	}
}

func TestOfferedUpdateKeepsPrereleasesOffTheStableChannel(t *testing.T) {
	cases := []struct {
		name                        string
		stable, prerelease, current string
		channel, want               string
	}{
		{
			name:   "a stable user is never offered a prerelease",
			stable: "0.9.0", prerelease: "0.9.1-beta", current: "0.9.0", channel: "stable", want: "",
		},
		{
			name:   "a beta user is offered the prerelease",
			stable: "0.9.0", prerelease: "0.9.1-beta", current: "0.9.0", channel: "beta", want: "0.9.1-beta",
		},
		{
			name:   "a beta user is offered a newer stable over an older prerelease",
			stable: "0.9.2", prerelease: "0.9.1-beta", current: "0.9.0", channel: "beta", want: "0.9.2",
		},
		{
			name:   "a beta user already on the prerelease is offered nothing",
			stable: "0.9.0", prerelease: "0.9.1-beta", current: "0.9.1-beta", channel: "beta", want: "",
		},
		{
			name:   "a beta user on a prerelease is offered the matching release",
			stable: "0.9.1", prerelease: "0.9.1-beta", current: "0.9.1-beta", channel: "beta", want: "0.9.1",
		},
		{
			name:   "no published prerelease is not an error",
			stable: "0.9.1", prerelease: "", current: "0.9.0", channel: "beta", want: "0.9.1",
		},
		{
			name:   "a stable user ahead of the file is offered nothing",
			stable: "0.9.0", prerelease: "", current: "0.9.1", channel: "stable", want: "",
		},
	}
	for _, c := range cases {
		if got := offeredUpdate(c.stable, c.prerelease, c.current, c.channel); got != c.want {
			t.Errorf("%s: offeredUpdate(%q, %q, %q, %q) = %q, want %q",
				c.name, c.stable, c.prerelease, c.current, c.channel, got, c.want)
		}
	}
}

func TestUpdateChannelDefaultsToStable(t *testing.T) {
	t.Setenv("IKMAL_EDITOR_CHANNEL", "")
	if got := updateChannel(); got != "stable" {
		t.Errorf("with no opt-in, updateChannel() = %q, want stable", got)
	}
	t.Setenv("IKMAL_EDITOR_CHANNEL", "beta")
	if got := updateChannel(); got != "beta" {
		t.Errorf("with IKMAL_EDITOR_CHANNEL=beta, updateChannel() = %q, want beta", got)
	}
	t.Setenv("IKMAL_EDITOR_CHANNEL", "Beta")
	if got := updateChannel(); got != "beta" {
		t.Errorf("the opt-in must not be case-sensitive, got %q", got)
	}
	t.Setenv("IKMAL_EDITOR_CHANNEL", "nonsense")
	if got := updateChannel(); got != "stable" {
		t.Errorf("an unrecognised channel must fall back to stable, got %q", got)
	}
}

// The published file is a contract with every installed binary, and the CLI
// reads it with a string scan rather than a JSON parser. This checks the file
// as shipped, because a change to it reaches users without any code change.
func TestShippedVersionJSONNeverNamesAPrereleaseAsStable(t *testing.T) {
	raw, err := os.ReadFile("version.json")
	if err != nil {
		t.Fatal(err)
	}
	document := string(raw)

	stable := extractJSONString(document, "version")
	if strings.Contains(stable, "-") {
		t.Errorf("version.json offers %q on the stable channel, which is a prerelease", stable)
	}
	if extractJSONString(document, "url") == "" {
		t.Error("version.json has no url for the CLI to point at")
	}

	// Whatever the file says, a user who has not opted in is never sent to a
	// prerelease. This is the property the channel split exists for.
	prerelease := extractJSONString(document, "prerelease")
	if offered := offeredUpdate(stable, prerelease, "0.0.1", "stable"); strings.Contains(offered, "-") {
		t.Errorf("the stable channel offered the prerelease %q", offered)
	}
	if prerelease != "" && !versionIsNewer(prerelease, "0.0.1") {
		t.Errorf("version.json prerelease %q does not parse as a version", prerelease)
	}
}

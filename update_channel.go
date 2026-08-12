package main

import (
	"os"
	"strconv"
	"strings"
)

// Which releases a user is told about, and how "newer" is decided.
//
// The update notice used to fire on any string difference between the local
// version and the published one. That is wrong in both directions: it offered a
// prerelease to everyone running a stable build, and it would have offered a
// downgrade to anyone ahead of the file. Comparing properly is what makes a
// beta channel possible at all — without it, "only tell me about stable" cannot
// be expressed.
//
// The comparison is hand-rolled because this project depends on the standard
// library only, and it covers the scheme the project actually uses: X.Y.Z with
// an optional prerelease suffix such as -beta or -rc1.

// updateChannel reports whether the user has opted in to prereleases, through
// IKMAL_EDITOR_CHANNEL=beta or -channel=beta. The default is stable: a beta has
// to be asked for.
func updateChannel() string {
	if v := strings.ToLower(strings.TrimSpace(os.Getenv("IKMAL_EDITOR_CHANNEL"))); v == "beta" || v == "prerelease" {
		return "beta"
	}
	for _, a := range os.Args[1:] {
		switch strings.ToLower(a) {
		case "-channel=beta", "--channel=beta":
			return "beta"
		}
	}
	return "stable"
}

// splitVersion separates the release numbers from any prerelease suffix, and
// tolerates a leading v so a tag name can be passed straight in.
func splitVersion(version string) ([]int, string) {
	value := strings.TrimSpace(version)
	value = strings.TrimPrefix(value, "v")
	base, pre, _ := strings.Cut(value, "-")
	var numbers []int
	for _, part := range strings.Split(base, ".") {
		n, err := strconv.Atoi(part)
		if err != nil {
			// An unparseable component makes the whole version untrustworthy;
			// callers treat that as "not newer" rather than guessing.
			return nil, pre
		}
		numbers = append(numbers, n)
	}
	return numbers, pre
}

// comparePrerelease orders two prerelease suffixes. An empty suffix is the
// release itself and outranks any prerelease of the same numbers, which is why
// 0.9.1 is newer than 0.9.1-rc1.
func comparePrerelease(a, b string) int {
	switch {
	case a == b:
		return 0
	case a == "":
		return 1
	case b == "":
		return -1
	}
	aParts, bParts := strings.Split(a, "."), strings.Split(b, ".")
	for i := 0; i < len(aParts) && i < len(bParts); i++ {
		if aParts[i] == bParts[i] {
			continue
		}
		aNum, aErr := strconv.Atoi(aParts[i])
		bNum, bErr := strconv.Atoi(bParts[i])
		switch {
		case aErr == nil && bErr == nil:
			if aNum != bNum {
				return sign(aNum - bNum)
			}
		case aErr == nil:
			// Numeric identifiers rank below alphanumeric ones.
			return -1
		case bErr == nil:
			return 1
		default:
			return sign(strings.Compare(aParts[i], bParts[i]))
		}
	}
	return sign(len(aParts) - len(bParts))
}

func sign(n int) int {
	switch {
	case n > 0:
		return 1
	case n < 0:
		return -1
	}
	return 0
}

// versionIsNewer reports whether candidate describes a later release than
// current. An unparseable version is never newer: a malformed published file
// must not be able to nag every user.
func versionIsNewer(candidate, current string) bool {
	candidateNumbers, candidatePre := splitVersion(candidate)
	currentNumbers, currentPre := splitVersion(current)
	if candidateNumbers == nil || currentNumbers == nil {
		return false
	}
	for i := 0; i < len(candidateNumbers) || i < len(currentNumbers); i++ {
		var a, b int
		if i < len(candidateNumbers) {
			a = candidateNumbers[i]
		}
		if i < len(currentNumbers) {
			b = currentNumbers[i]
		}
		if a != b {
			return a > b
		}
	}
	return comparePrerelease(candidatePre, currentPre) > 0
}

// offeredUpdate picks what to tell the user about, given the published stable
// and prerelease versions. On the stable channel a prerelease is never offered,
// however new it is.
func offeredUpdate(stable, prerelease, current, channel string) string {
	best := ""
	if versionIsNewer(stable, current) {
		best = stable
	}
	// best may still be empty here, and an empty string is not a version:
	// comparing against it answers false, which would have suppressed every
	// beta offered to a user with no stable update waiting.
	if channel == "beta" && versionIsNewer(prerelease, current) && (best == "" || versionIsNewer(prerelease, best)) {
		best = prerelease
	}
	return best
}

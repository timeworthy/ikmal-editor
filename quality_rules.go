package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

type qualityRuleDef struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Category    string `json:"category"`
	Enabled     bool   `json:"enabled"`
}

type qualityRulesState struct {
	sync.RWMutex
	Rules map[string]bool `json:"rules"`
}

var globalRulesState = &qualityRulesState{
	Rules: make(map[string]bool),
}

var defaultQualityRules = []qualityRuleDef{
	{
		ID:          "oxford-comma",
		Name:        "Oxford Comma",
		Description: "Enforce serial (Oxford) comma in lists of three or more items.",
		Category:    "Punctuation & Style",
		Enabled:     true,
	},
	{
		ID:          "passive-voice",
		Name:        "Passive Voice",
		Description: "Flag passive voice constructions and offer active rewrites when an actor is named.",
		Category:    "Clarity & Style",
		Enabled:     true,
	},
	{
		ID:          "repetition",
		Name:        "Word Repetition",
		Description: "Flag nearby repeated non-noun content words.",
		Category:    "Clarity & Style",
		Enabled:     true,
	},
	{
		ID:          "word-family-echo",
		Name:        "Word Family Echoes",
		Description: "Flag nearby echoes of words from the same family.",
		Category:    "Clarity & Style",
		Enabled:     true,
	},
	{
		ID:          "homophones",
		Name:        "Homophone Confusions",
		Description: "Flag commonly confused sound-alike words like there/their/they're.",
		Category:    "Grammar & Usage",
		Enabled:     true,
	},
	{
		ID:          "pronoun-antecedent",
		Name:        "Pronoun-Antecedent Agreement",
		Description: "Flag mismatches between pronouns and their antecedents.",
		Category:    "Grammar & Usage",
		Enabled:     true,
	},
	{
		ID:          "sentence-structure",
		Name:        "Sentence Structure & Missing Words",
		Description: "Flag missing articles and structural sentence errors.",
		Category:    "Grammar & Usage",
		Enabled:     true,
	},
	{
		ID:          "wordiness",
		Name:        "Wordiness & Filler Phrases",
		Description: "Flag verbose phrases like 'in order to' and 'due to the fact that'.",
		Category:    "Conciseness",
		Enabled:     true,
	},
	{
		ID:          "nominalization",
		Name:        "Nominalizations",
		Description: "Flag verbified nouns like 'make a decision' instead of 'decide'.",
		Category:    "Conciseness",
		Enabled:     true,
	},
	{
		ID:          "redundancy",
		Name:        "Redundant Modifiers",
		Description: "Flag unnecessary modifiers like 'end result' and 'past history'.",
		Category:    "Conciseness",
		Enabled:     true,
	},
	{
		ID:          "clarity",
		Name:        "Clarity & Plain English",
		Description: "Flag overly complex words like 'utilize' and 'commence'.",
		Category:    "Clarity & Style",
		Enabled:     true,
	},
	{
		ID:          "cliches-jargon",
		Name:        "Cliches & Buzzwords",
		Description: "Flag overused idioms and corporate buzzwords like 'think outside the box'.",
		Category:    "Clarity & Style",
		Enabled:     true,
	},
	{
		ID:          "weak-words",
		Name:        "Weak Words & Intensifiers",
		Description: "Flag overused intensifiers like 'very', 'really', and 'basically'.",
		Category:    "Conciseness",
		Enabled:     true,
	},
	{
		ID:          "readability",
		Name:        "Sentence Complexity & Readability",
		Description: "Flag overly long sentences (> 30 words) that hurt readability.",
		Category:    "Readability",
		Enabled:     true,
	},
	{
		ID:          "punctuation",
		Name:        "Punctuation & Formatting",
		Description: "Flag double spaces, repeated punctuation, and stray spaces.",
		Category:    "Punctuation & Style",
		Enabled:     true,
	},
	{
		ID:          "unnecessary-adverbs",
		Name:        "Unnecessary Adverbs",
		Description: "Flag unnecessary or weak '-ly' adverbs and modifiers that dilute verb action.",
		Category:    "Conciseness",
		Enabled:     true,
	},
	{
		ID:          "formality-tone",
		Name:        "Formality & Register Tracker",
		Description: "Flag overly formal/archaic words or overly informal/colloquial slang.",
		Category:    "Clarity & Style",
		Enabled:     true,
	},
	{
		ID:          "style-guide",
		Name:        "Imported Style Guides",
		Description: "Apply rules from imported custom style guides.",
		Category:    "Custom",
		Enabled:     true,
	},
}

func init() {
	initQualityRules()
}

func qualityRulesConfigPath() string {
	if path := strings.TrimSpace(os.Getenv("IKMAL_RULES_CONFIG_PATH")); path != "" {
		return path
	}
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return ".ikmal_rules_config.json"
	}
	dir := filepath.Join(home, ".ikmal")
	_ = os.MkdirAll(dir, 0755)
	return filepath.Join(dir, "rules_config.json")
}

func initQualityRules() {
	globalRulesState.Lock()
	defer globalRulesState.Unlock()

	for _, rule := range defaultQualityRules {
		globalRulesState.Rules[rule.ID] = rule.Enabled
	}

	path := qualityRulesConfigPath()
	data, err := os.ReadFile(path)
	if err == nil {
		var saved map[string]bool
		if json.Unmarshal(data, &saved) == nil {
			for k, v := range saved {
				globalRulesState.Rules[k] = v
			}
		}
	}
}

func saveQualityRulesLocked() error {
	path := qualityRulesConfigPath()
	data, err := json.MarshalIndent(globalRulesState.Rules, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func isQualityRuleEnabled(ruleID string, overrides map[string]bool, disabled []string) bool {
	if len(disabled) > 0 {
		for _, d := range disabled {
			if strings.EqualFold(d, ruleID) {
				return false
			}
		}
	}
	if overrides != nil {
		if val, exists := overrides[ruleID]; exists {
			return val
		}
	}

	globalRulesState.RLock()
	defer globalRulesState.RUnlock()
	if val, exists := globalRulesState.Rules[ruleID]; exists {
		return val
	}
	return true
}

func getQualityRulesList() []qualityRuleDef {
	globalRulesState.RLock()
	defer globalRulesState.RUnlock()

	list := make([]qualityRuleDef, len(defaultQualityRules))
	for i, rule := range defaultQualityRules {
		ruleCopy := rule
		if val, exists := globalRulesState.Rules[rule.ID]; exists {
			ruleCopy.Enabled = val
		}
		list[i] = ruleCopy
	}
	return list
}

func setQualityRuleEnabled(ruleID string, enabled bool) error {
	globalRulesState.Lock()
	defer globalRulesState.Unlock()

	globalRulesState.Rules[ruleID] = enabled
	return saveQualityRulesLocked()
}

func setQualityRulesBatch(updates map[string]bool) error {
	globalRulesState.Lock()
	defer globalRulesState.Unlock()

	for k, v := range updates {
		globalRulesState.Rules[k] = v
	}
	return saveQualityRulesLocked()
}

func qualityRulesHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeQualityJSON(w, http.StatusOK, map[string]any{
			"rules": getQualityRulesList(),
		})
	case http.MethodPost:
		var body struct {
			ID      string          `json:"id,omitempty"`
			Enabled *bool           `json:"enabled,omitempty"`
			Rules   map[string]bool `json:"rules,omitempty"`
		}
		r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeQualityRequestError(w, err, "invalid rules payload")
			return
		}

		if body.ID != "" && body.Enabled != nil {
			if err := setQualityRuleEnabled(body.ID, *body.Enabled); err != nil {
				writeQualityJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
		} else if len(body.Rules) > 0 {
			if err := setQualityRulesBatch(body.Rules); err != nil {
				writeQualityJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
		}
		writeQualityJSON(w, http.StatusOK, map[string]any{
			"rules": getQualityRulesList(),
		})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

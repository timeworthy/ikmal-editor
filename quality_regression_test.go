package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type qualityRegressionCase struct {
	ID                       string `json:"id"`
	Text                     string `json:"text"`
	LocalExpectCategory      string `json:"localExpectCategory"`
	LocalExpectReplacement   string `json:"localExpectReplacement"`
	LocalExpectAntecedent    string `json:"localExpectAntecedent"`
	LocalExpectNoSuggestions bool   `json:"localExpectNoSuggestions"`
	StyleGuideSource         string `json:"styleGuideSource"`
	StyleGuideMatch          string `json:"styleGuideMatch"`
	StyleGuideReplacement    string `json:"styleGuideReplacement"`
}

func TestQualityRegressionFixtures(t *testing.T) {
	content, err := os.ReadFile("quality-regression.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []qualityRegressionCase
	if err := json.Unmarshal(content, &cases); err != nil {
		t.Fatal(err)
	}

	for _, testCase := range cases {
		t.Run(testCase.ID, func(t *testing.T) {
			if testCase.StyleGuideSource != "" {
				configureRegressionStyleGuide(t, testCase)
			}
			response := analyzeQualityText(testCase.Text)
			if testCase.LocalExpectNoSuggestions && len(response.Suggestions) != 0 {
				t.Fatalf("expected no local suggestions, got %+v", response.Suggestions)
			}
			if testCase.LocalExpectCategory != "" && !hasQualityCategory(response.Suggestions, testCase.LocalExpectCategory) {
				t.Fatalf("expected local category %q, got %+v", testCase.LocalExpectCategory, response.Suggestions)
			}
			if testCase.LocalExpectReplacement != "" && !hasQualityReplacement(response.Suggestions, testCase.LocalExpectReplacement) {
				t.Fatalf("expected local replacement %q, got %+v", testCase.LocalExpectReplacement, response.Suggestions)
			}
			if testCase.LocalExpectAntecedent != "" && !hasQualityAntecedent(response.Antecedents, testCase.LocalExpectAntecedent) {
				t.Fatalf("expected local antecedent %q, got %+v", testCase.LocalExpectAntecedent, response.Antecedents)
			}
		})
	}
}

func configureRegressionStyleGuide(t *testing.T, testCase qualityRegressionCase) {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("IKMAL_STYLE_GUIDE_DIR", dir)
	sourcePath := filepath.Join(dir, "regression-guide.md")
	if err := os.WriteFile(sourcePath, []byte(testCase.StyleGuideSource), 0644); err != nil {
		t.Fatal(err)
	}
	guide, err := importStyleGuide(sourcePath)
	if err != nil {
		t.Fatal(err)
	}
	if err := saveStyleGuide(guide); err != nil {
		t.Fatal(err)
	}
	if err := selectStyleGuide(guide.ID); err != nil {
		t.Fatal(err)
	}
	rows, err := loadStyleGuideReviewRows(guide.ID)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for index := range rows {
		if strings.EqualFold(strings.TrimSpace(rows[index].Match), testCase.StyleGuideMatch) {
			rows[index].Status = "approved"
			found = true
		}
	}
	if !found {
		t.Fatalf("style-guide fixture did not produce a review row for %q", testCase.StyleGuideMatch)
	}
	if err := writeStyleGuideReviewRows(styleGuideReviewCSVPath(guide.ID), rows); err != nil {
		t.Fatal(err)
	}
	if err := setStyleGuideEnabled(true); err != nil {
		t.Fatal(err)
	}
}

func hasQualityCategory(suggestions []qualitySuggestion, category string) bool {
	for _, suggestion := range suggestions {
		if suggestion.Category == category {
			return true
		}
	}
	return false
}

func hasQualityReplacement(suggestions []qualitySuggestion, replacement string) bool {
	for _, suggestion := range suggestions {
		if strings.EqualFold(suggestion.Replacement, replacement) {
			return true
		}
	}
	return false
}

func hasQualityAntecedent(antecedents []qualityAntecedent, expected string) bool {
	for _, antecedent := range antecedents {
		if antecedent.Antecedent == expected {
			return true
		}
	}
	return false
}

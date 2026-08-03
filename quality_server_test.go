package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestAnalyzeQualityTextTracksRepeatsAndAntecedents(t *testing.T) {
	response := analyzeQualityText("Plants produce its own food. The approach is innovative. The result is innovative. The method is different. The result shows a difference.")
	if len(response.Antecedents) == 0 {
		t.Fatal("expected an antecedent link")
	}
	if response.Antecedents[0].Antecedent != "Plants" {
		t.Fatalf("expected Plants antecedent, got %q", response.Antecedents[0].Antecedent)
	}
	foundFamily := false
	for _, suggestion := range response.Suggestions {
		if suggestion.Category == "word-family-echo" {
			foundFamily = true
		}
	}
	if !foundFamily {
		t.Fatal("expected different/difference family echo")
	}
}

func TestAnalyzeQualityTextIncludesRelatedOccurrencesAndAntecedentLinks(t *testing.T) {
	pronounResponse := analyzeQualityText("Plants produce its own food.")
	repetitionResponse := analyzeQualityText("The approach is innovative. The result is innovative.")
	echoResponse := analyzeQualityText("The method is different. The result shows a difference.")
	var pronoun, repetition, echo *qualitySuggestion
	for index := range pronounResponse.Suggestions {
		if pronounResponse.Suggestions[index].Category == "pronoun-antecedent" {
			pronoun = &pronounResponse.Suggestions[index]
		}
	}
	for index := range repetitionResponse.Suggestions {
		if repetitionResponse.Suggestions[index].Category == "repetition" {
			repetition = &repetitionResponse.Suggestions[index]
		}
	}
	for index := range echoResponse.Suggestions {
		if echoResponse.Suggestions[index].Category == "word-family-echo" {
			echo = &echoResponse.Suggestions[index]
		}
	}
	if pronoun == nil || pronoun.Antecedent == nil || pronoun.Antecedent.Antecedent != "Plants" {
		t.Fatalf("expected pronoun suggestion to carry its antecedent link, got %+v", pronoun)
	}
	if repetition == nil || len(repetition.RelatedOccurrences) != 2 {
		t.Fatalf("expected repeated word occurrences, got %+v", repetition)
	}
	if repetition.RelatedOccurrences[0].Text != "innovative" || repetition.RelatedOccurrences[1].Text != "innovative" {
		t.Fatalf("unexpected repeated occurrence text: %+v", repetition.RelatedOccurrences)
	}
	if echo == nil || len(echo.RelatedOccurrences) != 2 || echo.RelatedOccurrences[0].Text != "different" || echo.RelatedOccurrences[1].Text != "difference" {
		t.Fatalf("expected word-family occurrences, got %+v", echo)
	}
}

func TestAnalyzeQualityTextUsesOnlyApprovedContextualStyleRules(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("IKMAL_STYLE_GUIDE_DIR", dir)
	source := filepath.Join(dir, "guide.md")
	if err := os.WriteFile(source, []byte("Terminology\nPrefer video game over videogame.\nAvoid blacklist.\n"), 0644); err != nil {
		t.Fatal(err)
	}
	guide, err := importStyleGuide(source)
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
	rows[1].Status = "approved"
	if err := writeStyleGuideReviewRows(styleGuideReviewCSVPath(guide.ID), rows); err != nil {
		t.Fatal(err)
	}
	if err := setStyleGuideEnabled(true); err != nil {
		t.Fatal(err)
	}

	response := analyzeQualityText("The videogame is popular. The blacklist was removed.")
	foundContextual := false
	foundDraft := false
	for _, suggestion := range response.Suggestions {
		if suggestion.Category != "style-guide" {
			continue
		}
		if suggestion.Replacement == "video game" {
			foundContextual = true
		}
		if suggestion.Start > 30 {
			foundDraft = true
		}
	}
	if !foundContextual {
		t.Fatalf("expected approved contextual style rule, got %+v", response.Suggestions)
	}
	if foundDraft {
		t.Fatalf("draft style rule should not be active: %+v", response.Suggestions)
	}
}

func TestAnalyzeQualityStyleGuideUsesWordBoundaries(t *testing.T) {
	positions := qualityStyleGuideMatchPositions("videogame videogames", "videogame")
	if len(positions) != 1 || positions[0][0] != 0 {
		t.Fatalf("expected only the standalone term to match, got %+v", positions)
	}
}

func TestAnalyzeQualityTextDoesNotFlagNounRepeat(t *testing.T) {
	response := analyzeQualityText("The system is local. The system is reliable.")
	for _, suggestion := range response.Suggestions {
		if suggestion.Category == "repetition" {
			t.Fatalf("unexpected noun repetition suggestion: %+v", suggestion)
		}
	}
}

func TestAnalyzeQualityTextFlagsNonNounRepeatAcrossSentences(t *testing.T) {
	response := analyzeQualityText("The approach is innovative. The result is innovative.")
	for _, suggestion := range response.Suggestions {
		if suggestion.Category == "repetition" && suggestion.Start > 30 {
			return
		}
	}
	t.Fatal("expected repeated non-noun content word suggestion")
}

func TestAnalyzeQualityTextMergesTransformerSuggestions(t *testing.T) {
	local := []qualitySuggestion{{
		Start:    8,
		End:      16,
		Category: "pronoun-antecedent",
	}}
	remote := []qualitySuggestion{{
		Start:       0,
		End:         6,
		Replacement: "The",
		Category:    "transformer-grammar",
		Confidence:  0.68,
		Source:      "transformer",
	}}
	merged := mergeQualitySuggestions(local, remote)
	if len(merged) != 2 || merged[1].Source != "transformer" {
		t.Fatalf("expected non-overlapping transformer result to merge, got %+v", merged)
	}

	overlapping := []qualitySuggestion{{
		Start:       8,
		End:         16,
		Replacement: "their",
		Category:    "transformer-grammar",
	}}
	merged = mergeQualitySuggestions(local, overlapping)
	if len(merged) != 2 {
		t.Fatalf("expected distinct overlapping categories to merge, got %+v", merged)
	}

	duplicate := []qualitySuggestion{{
		Start:       8,
		End:         16,
		Replacement: "their",
		Category:    "pronoun-antecedent",
	}}
	merged = mergeQualitySuggestions(local, duplicate)
	if len(merged) != 1 {
		t.Fatalf("expected overlapping suggestions in the same category to be suppressed, got %+v", merged)
	}
}

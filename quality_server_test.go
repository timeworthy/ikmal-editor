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

func TestAnalyzeQualityTextFindsHomophonesRunOnsAndMissingArticles(t *testing.T) {
	response := analyzeQualityText("I went two the store. I have too kids. I work in factory I have a wife.")
	seen := map[string]bool{}
	for _, suggestion := range response.Suggestions {
		seen[suggestion.Category] = true
	}
	if !seen["homophone"] {
		t.Fatalf("expected a homophone suggestion, got %+v", response.Suggestions)
	}
	if !seen["sentence-structure"] {
		t.Fatalf("expected a run-on sentence suggestion, got %+v", response.Suggestions)
	}
	if !seen["missing-word"] {
		t.Fatalf("expected a missing-article suggestion, got %+v", response.Suggestions)
	}
	for _, suggestion := range response.Suggestions {
		if suggestion.Category == "homophone" && suggestion.Replacement == "two" {
			return
		}
	}
	t.Fatalf("expected too -> two correction, got %+v", response.Suggestions)
}

// A numeral followed by its verb is not the preposition, so the automatic
// "two" -> "to" rewrite must stay off it, and a clause break withdraws the
// infinitive evidence the rule does accept.
func TestAnalyzeQualityTextKeepsNumeralsBeforeBareVerbs(t *testing.T) {
	for _, sentence := range []string{"The two get along well.", "Only two make the cut.", "I want two, get me one."} {
		response := analyzeQualityText(sentence)
		if hasQualityCategory(response.Suggestions, "homophone") {
			t.Fatalf("unexpected homophone suggestion for %q, got %+v", sentence, response.Suggestions)
		}
	}
}

func TestAnalyzeQualityTextFlagsTwoBeforeAnInfinitive(t *testing.T) {
	response := analyzeQualityText("I want two go home.")
	for _, suggestion := range response.Suggestions {
		if suggestion.Category == "homophone" && suggestion.Replacement == "to" {
			return
		}
	}
	t.Fatalf("expected two -> to after an infinitive head, got %+v", response.Suggestions)
}

// The replacement is applied verbatim by every host, so it has to be
// grammatical: a vowel-initial noun takes "an".
func TestAnalyzeQualityTextUsesAnBeforeVowelNouns(t *testing.T) {
	response := analyzeQualityText("I have idea.")
	for _, suggestion := range response.Suggestions {
		if suggestion.Category != "missing-word" {
			continue
		}
		if suggestion.Replacement != "an idea" {
			t.Fatalf("expected %q, got %q", "an idea", suggestion.Replacement)
		}
		return
	}
	t.Fatalf("expected a missing-article suggestion, got %+v", response.Suggestions)
}

// The guards that stop "I" from reading as a sentence boundary, and stop a bare
// -ed from reading as a passive, must stay narrow. These assert the true
// positives they were carved around still fire.
func TestAnalyzeQualityTextStillFlagsRunOnsBeforeI(t *testing.T) {
	response := analyzeQualityText("I work in factory I have a wife.")
	if !hasQualityCategory(response.Suggestions, "sentence-structure") {
		t.Fatalf("expected a run-on before a bare noun, got %+v", response.Suggestions)
	}
}

func TestAnalyzeQualityTextDoesNotTreatRelativeClauseIAsRunOn(t *testing.T) {
	// A real passive is expected here; only the run-on reading is wrong.
	response := analyzeQualityText("Everything I do is checked by the team.")
	if hasQualityCategory(response.Suggestions, "sentence-structure") {
		t.Fatalf("unexpected run-on for an indefinite pronoun head, got %+v", response.Suggestions)
	}
}

func TestAnalyzeQualityTextTracksPassiveVoiceWithoutAutomaticRewrite(t *testing.T) {
	response := analyzeQualityText("The report was reviewed by the editor. The editor reviewed the report. The results have been published. The setting can be enabled.")
	var passive []qualitySuggestion
	for _, suggestion := range response.Suggestions {
		if suggestion.Category == "passive-voice" {
			passive = append(passive, suggestion)
		}
	}
	if len(passive) != 3 {
		t.Fatalf("expected three passive-voice findings, got %+v", response.Suggestions)
	}
	if passive[0].Replacement != "" || passive[0].Confidence < 0.9 {
		t.Fatalf("expected a review-only high-confidence passive finding, got %+v", passive[0])
	}
	if passive[0].End <= passive[0].Start || passive[1].End <= passive[1].Start || passive[2].End <= passive[2].Start {
		t.Fatalf("expected non-empty UTF-16 spans, got %+v", passive)
	}
}

func TestAnalyzeQualityTextDoesNotFlagCopularAdjectivesAsPassive(t *testing.T) {
	response := analyzeQualityText("The team is tired. The result is clear. The editor reviewed the report.")
	for _, suggestion := range response.Suggestions {
		if suggestion.Category == "passive-voice" {
			t.Fatalf("unexpected passive-voice suggestion: %+v", suggestion)
		}
	}
}

func TestAnalyzeQualityTextTracksContractedPassiveVoice(t *testing.T) {
	response := analyzeQualityText("The feature is useful. It's designed for local use. That's been tested already.")
	count := 0
	for _, suggestion := range response.Suggestions {
		if suggestion.Category == "passive-voice" {
			count++
		}
	}
	if count != 2 {
		t.Fatalf("expected contracted passive constructions to be tracked, got %+v", response.Suggestions)
	}
}

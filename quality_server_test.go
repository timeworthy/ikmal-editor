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

// The active-voice rewrite exists only where the actor is in the sentence.
// Without a by-agent no rewrite can recover who acted, and a checker must not
// put a subject into someone's prose.
func TestPassiveVoiceOffersAnActiveRewriteWhenTheActorIsNamed(t *testing.T) {
	cases := []struct {
		text string
		want string
	}{
		{"The results were reviewed by the team.", "The team reviewed the results"},
		{"Mistakes were made by the committee.", "The committee made mistakes"},
		// Irregular participles are converted, not swapped in raw: "Ian written
		// the report" would be ungrammatical, which is worse than saying nothing.
		{"The report was written by Ian.", "Ian wrote the report"},
		{"The plan was chosen by Ian.", "Ian chose the plan"},
		// An adverb between the auxiliary and the participle moves with the
		// clause. Dropping it would be silent, and the span the candidate
		// replaces covers the words it stood in.
		{"The results were quickly reviewed by the team.", "The team quickly reviewed the results"},
		// A possessive is not a plural, and the capital on a name is the name's
		// own: "the team reviewed ian's report" is wrong about a person.
		{"Ian's report was reviewed by the team.", "The team reviewed Ian's report"},
		// The agent's own phrase is not cut short by the words inside it.
		{"The plan was approved by the board of directors.", "The board of directors approved the plan"},
		// A name ending in "s" is not a plural. The auxiliary is what tells them
		// apart — "were" agrees with a plural, "was" does not — and without that
		// test this offered "The panel interviewed james".
		{"James was interviewed by the panel.", "The panel interviewed James"},
		{"Texas was settled by the pioneers.", "The pioneers settled Texas"},
		// The agent lands in subject position, where an object pronoun is the
		// wrong form: "Him reviewed the report" is ungrammatical.
		{"The report was reviewed by him.", "He reviewed the report"},
		{"The report was reviewed by them.", "They reviewed the report"},
		{"The report was reviewed by me.", "I reviewed the report"},
		// "her" is only the pronoun when it stands alone. In front of a noun it
		// is the possessive and belongs to the agent as written.
		{"The report was reviewed by her.", "She reviewed the report"},
		{"The report was reviewed by her team.", "Her team reviewed the report"},
		// The pronoun the agent displaces makes the same trade in the other
		// direction: it lands in object position, where "The panel interviewed
		// I" is as wrong as "Him reviewed the report" was.
		{"They were reviewed by the team.", "The team reviewed them"},
		{"I was interviewed by the panel.", "The panel interviewed me"},
		{"He was interviewed by the panel.", "The panel interviewed him"},
		{"We were interviewed by the panel.", "The panel interviewed us"},
		// Only the head of either phrase changes; the words behind it are the
		// writer's and come through as written.
		{"The report was reviewed by them all.", "They all reviewed the report"},
		// A word in capitals throughout carries its own capitals, and lowering
		// the first rune of one produced "REVIEWED tHE REPORT".
		{"THE REPORT WAS REVIEWED BY THE TEAM.", "THE TEAM REVIEWED THE REPORT"},
		// Two actors joined by a conjunction are one agent. Reading the "and" as
		// a boundary and then declining on what it stranded lost these outright.
		{"The results were reviewed by the team and the board.", "The team and the board reviewed the results"},
		{"The report was reviewed by Ian and Sam.", "Ian and Sam reviewed the report"},
		// A lone letter at the end of a longer agent is a name when nothing
		// follows the period; behind an initial there is always the rest of a
		// name.
		{"The report was audited by team B.", "Team B audited the report"},
		// A bare plural subject has no determiner to stop the walk back, and the
		// guard that fixed that must not decline the ordinary case with it.
		{"Sales were reviewed by the auditors.", "The auditors reviewed sales"},
		// A quantifier in front of the determiner is part of the subject phrase,
		// not the clause boundary the determiner otherwise marks.
		{"Both the reports were reviewed by Ian.", "Ian reviewed both the reports"},
		{"Only the summary was reviewed by Ian.", "Ian reviewed only the summary"},
	}
	for _, testCase := range cases {
		tokens := tokenizeQualityText(testCase.text)
		got := ""
		for _, suggestion := range analyzeQualityPassiveVoice(testCase.text, tokens) {
			if len(suggestion.RewordCandidates) > 0 {
				got = suggestion.RewordCandidates[0].ReplacementText
			}
		}
		if got != testCase.want {
			t.Fatalf("%q\n got  %q\n want %q", testCase.text, got, testCase.want)
		}
	}
}

func TestPassiveVoiceInventsNoActor(t *testing.T) {
	// These must be flagged as passive and still offer no rewrite. An earlier
	// version of this test used "The results were reviewed", which is not
	// flagged at all without a by-agent — so it asserted nothing, and passed
	// happily with the agent requirement removed.
	for _, text := range []string{
		"Mistakes were made.",
		"The decision was given.",
	} {
		flagged := false
		for _, suggestion := range analyzeQualityPassiveVoice(text, tokenizeQualityText(text)) {
			flagged = true
			if len(suggestion.RewordCandidates) > 0 {
				t.Fatalf("%q invented an actor: %q", text, suggestion.RewordCandidates[0].ReplacementText)
			}
		}
		if !flagged {
			t.Fatalf("%q is not flagged as passive, so this case proves nothing", text)
		}
	}
}

// The rewrite is a claim about what the writer meant, and these are the
// sentences where the clause it would build says something else. Each one must
// still be flagged — the passive is really there — and must offer nothing.
func TestPassiveVoiceRefusesRewritesThatChangeMeaning(t *testing.T) {
	cases := []struct {
		text   string
		reason string
	}{
		// Negation sits between the auxiliary and the participle, outside the
		// span the rewrite rebuilds, so carrying it is impossible and dropping
		// it inverts the sentence.
		{"The results were not reviewed by the team.", "negation"},
		{"The results were never reviewed by the team.", "negation"},
		{"The results weren't reviewed by the team.", "contracted negation"},
		// The active clause is simple past. A modal, a perfect, or a present
		// habit rewritten into it would assert something that never happened.
		{"The report will be reviewed by the team.", "modal"},
		{"The report must be approved by the board.", "modal"},
		{"The report has been reviewed by the team.", "perfect"},
		{"The report is reviewed by the team.", "present"},
		// Moving the agent to the front strands whatever followed it: the
		// relative clause was about the board, not the findings.
		{"The findings were approved by the board, which met on Tuesday.", "trailing clause"},
		{"Everything was reviewed by the team; nothing changed.", "trailing clause"},
		{"The report was reviewed by the team yesterday afternoon.", "trailing adverbial"},
		{"The plan was approved by the board in 2024.", "trailing phrase"},
		// A determiner that arrives after the agent has started opens a phrase of
		// its own, and it is when the verb happened rather than more actor.
		// Reading it as part of the agent offered "The board last week approved
		// the plan".
		{"The plan was approved by the board last week.", "trailing determiner-headed time"},
		{"The report was written by Ian last night.", "trailing determiner-headed time"},
		{"The report was reviewed by the team this morning.", "trailing determiner-headed time"},
		{"The report was reviewed by the team every year.", "trailing determiner-headed time"},
		{"The plan was approved by the board Monday.", "trailing calendar word"},
		// The determiner is what marks the new phrase, so this holds for periods
		// the calendar list above does not name.
		{"The report was reviewed by the team this quarter.", "trailing determiner-headed time"},
		{"The plan was approved by the board each spring.", "trailing determiner-headed time"},
		{"The report was reviewed by the team here.", "trailing locative"},
		// The determiner marks where the subject phrase begins. What sits in
		// front of it is another phrase, and reading through it would build "Ian
		// reviewed this week the report".
		{"This week the report was reviewed by Ian.", "subject preceded by another phrase"},
		// The "by" belongs to the second clause: Ian wrote the report, and who
		// reviewed the results is not in the sentence at all.
		{"The results were reviewed, and the report was written by Ian.", "agent in another clause"},
		// The subject is not the whole clause. What precedes it is a clause
		// boundary this rule cannot see past, so it declines.
		{"He said the report was reviewed by the team.", "reported speech"},
		{"Because the report was reviewed by the team, we shipped.", "subordinate clause"},
		// Sentences are numbered on ".!?" alone, so without the line break these
		// two lines read as one clause and the first becomes the subject.
		{"The results were reviewed\nThe report was written by Ian", "line break"},
		// The same numbering ends a sentence at an abbreviation's own period,
		// which cut the agent in half: this offered "Dr reviewed the report" and
		// left "Smith." standing behind it.
		{"The report was reviewed by Dr. Smith.", "title inside the agent"},
		{"The plan was approved by the U.S. team.", "initials inside the agent"},
		{"The report was written by J. Smith.", "initial heading the agent"},
		// A middle initial is the same period one word further in, and reading it
		// as the end of the agent offered "John F approved the plan" with
		// "Kennedy." left standing behind it.
		{"The plan was approved by John F. Kennedy.", "middle initial"},
		{"The report was reviewed by Sam Q. Public.", "middle initial"},
		// The walk back from the auxiliary stops at a determiner, so a subject
		// without one ran through whatever opened the sentence and carried it
		// into the object: "Ian reviewed in 2024 reports".
		{"In 2024 reports were reviewed by Ian.", "subject with no determiner to stop the walk"},
		{"Yesterday reports were reviewed by Ian.", "subject with no determiner to stop the walk"},
		{"Last year sales were reviewed by the auditors.", "subject with no determiner to stop the walk"},
		// A conjunction joins two actors or opens a clause. The clause is not
		// more actor, and reading it as one built a board that approved the plan
		// reviewing the report.
		{"The report was reviewed by the team and the board approved the plan.", "conjunction opening a clause"},
		{"The report was reviewed by Ian and Sam left.", "conjunction opening a clause"},
		// "by Ian and me" is correct where it stands and wants "Ian and I" in
		// front of the verb. Converting one conjunct does not get the pair
		// right, so coordination declines wherever a pronoun is in it.
		{"The report was reviewed by Ian and me.", "pronoun in a coordinated agent"},
		{"The report was reviewed by me and Ian.", "pronoun heading a coordinated agent"},
	}
	for _, testCase := range cases {
		flagged := false
		for _, suggestion := range analyzeQualityPassiveVoice(testCase.text, tokenizeQualityText(testCase.text)) {
			flagged = true
			if len(suggestion.RewordCandidates) > 0 {
				t.Errorf("%s: %q offered %q", testCase.reason, testCase.text, suggestion.RewordCandidates[0].ReplacementText)
			}
		}
		if !flagged {
			t.Errorf("%s: %q is not flagged as passive, so this case proves nothing", testCase.reason, testCase.text)
		}
	}
}

// The by-agent is the only evidence that an -ed word is a participle rather than
// an adjective, and in hard-wrapped prose the wrap lands wherever the column ran
// out — including between the participle and its "by". Reading that break as a
// clause boundary did not merely decline the rewrite, it lost the finding.
func TestPassiveVoiceReadsAByAgentThroughAWrappedLine(t *testing.T) {
	for _, text := range []string{
		"The results were reviewed\nby the team.",
		"The books were audited\nby the team.",
	} {
		flagged := false
		for _, suggestion := range analyzeQualityPassiveVoice(text, tokenizeQualityText(text)) {
			flagged = true
			// The rewrite still declines: it splices a span of the text, and the
			// span here has a line break through it.
			if len(suggestion.RewordCandidates) > 0 {
				t.Errorf("%q rewrote across a line break: %q", text, suggestion.RewordCandidates[0].ReplacementText)
			}
		}
		if !flagged {
			t.Errorf("%q lost its passive finding to the line break", text)
		}
	}
	// A blank line is a paragraph break, not a wrap, and the "by" on the far
	// side of one is evidence about another sentence.
	text := "The door is closed\n\nThe letter was signed by Ian."
	for _, suggestion := range analyzeQualityPassiveVoice(text, tokenizeQualityText(text)) {
		if suggestion.Start == 0 {
			t.Errorf("a by-agent across a paragraph break made %q a passive: %+v", "closed", suggestion)
		}
	}
	// The wrap is only readable where it lands directly in front of the "by".
	// Sentences are numbered on ".!?" alone, so in line-oriented prose the next
	// line is the same sentence as far as the tokens know, and walking on into
	// it let a whole clause away — "The letter was signed by Ian" — supply the
	// evidence that made a copular "is closed" a passive, at the highest
	// confidence this rule emits.
	text = "The door is closed\nThe letter was signed by Ian."
	for _, suggestion := range analyzeQualityPassiveVoice(text, tokenizeQualityText(text)) {
		if suggestion.Start == 0 {
			t.Errorf("a by-agent a clause away made %q a passive: %+v", "closed", suggestion)
		}
	}
}

// Every participle the analyzer can flag must have a past tense this code knows.
// The refusal in pastTenseOf is unreachable today because the two lists happen
// to agree; it stops being unreachable the moment someone adds an irregular to
// the participle list without adding its past form, and the symptom would be a
// rewrite reading "Ian written the report".
func TestEveryFlaggedParticipleHasAPastTense(t *testing.T) {
	for participle := range qualityPassiveParticiples {
		if _, ok := pastTenseOf(participle); !ok {
			t.Fatalf("%q can be flagged as passive but has no past tense; add it to qualityPastTense", participle)
		}
	}
}

// The rewrite spans the whole clause while the finding stays on the verb, so
// the mark underlines what is wrong and the candidate replaces what must change.
func TestPassiveRewriteSpansTheClauseNotTheFinding(t *testing.T) {
	text := "The results were reviewed by the team."
	for _, suggestion := range analyzeQualityPassiveVoice(text, tokenizeQualityText(text)) {
		if len(suggestion.RewordCandidates) == 0 {
			continue
		}
		edit := suggestion.RewordCandidates[0].Edits[0]
		if edit.Start >= suggestion.Start || edit.End <= suggestion.End {
			t.Fatalf("the rewrite does not span wider than the finding: finding %d-%d, edit %d-%d",
				suggestion.Start, suggestion.End, edit.Start, edit.End)
		}
		if got := text[edit.Start:edit.End]; got != "The results were reviewed by the team" {
			t.Fatalf("the rewrite replaces the wrong span: %q", got)
		}
	}
}

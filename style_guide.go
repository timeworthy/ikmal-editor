package main

import (
	"bufio"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode"
)

type styleGuide struct {
	ID         string            `json:"id"`
	Name       string            `json:"name"`
	Source     string            `json:"source"`
	SourceType string            `json:"sourceType"`
	ImportedAt string            `json:"importedAt"`
	Entries    []styleGuideEntry `json:"entries"`
	RulesPath  string            `json:"rulesPath,omitempty"`
	RuleCount  int               `json:"ruleCount,omitempty"`
	ReviewPath string            `json:"reviewPath,omitempty"`
}

type styleGuideEntry struct {
	ID      string `json:"id"`
	Text    string `json:"text"`
	Kind    string `json:"kind"`
	Section string `json:"section,omitempty"`
}

type styleGuideSelection struct {
	GuideID string `json:"guideId"`
	Enabled bool   `json:"enabled"`
}

type styleGuideXMLRule struct {
	ID         string
	Name       string
	Pattern    string
	Message    string
	Suggestion string
	Example    string
	Correction string
}

type styleGuideRuleSpec struct {
	ID          string
	Name        string
	Kind        string
	Confidence  string
	Match       string
	Replacement string
	Message     string
	Example     string
	Correction  string
	Status      string
}

type styleGuideCandidate struct {
	Kind         string
	Confidence   string
	Match        string
	Replacement  string
	Alternatives []string
	Scope        string
	Notes        string
}

type styleGuideReviewRow struct {
	ID           string
	SourcePage   string
	Section      string
	SourceText   string
	Kind         string
	Confidence   string
	Match        string
	Replacement  string
	Alternatives []string
	Scope        string
	Message      string
	Example      string
	Correction   string
	Status       string
	Notes        string
}

type styleGuideEnrichmentOutput struct {
	ID           string   `json:"id"`
	Kind         string   `json:"kind"`
	Confidence   string   `json:"confidence"`
	Match        string   `json:"match"`
	Replacement  string   `json:"replacement"`
	Alternatives []string `json:"alternatives"`
	Scope        string   `json:"scope"`
	Notes        string   `json:"notes"`
}

var styleGuideReviewHeader = []string{"id", "source_page", "section", "source_text", "kind", "confidence", "match", "replacement", "alternatives", "scope", "message", "example", "correction", "status", "notes"}

var (
	styleGuideHTMLBlocks  = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>|<style[^>]*>.*?</style>|<head[^>]*>.*?</head>|<nav[^>]*>.*?</nav>|<header[^>]*>.*?</header>|<footer[^>]*>.*?</footer>`)
	styleGuideHTMLMain    = regexp.MustCompile(`(?is)<main\b[^>]*>(.*?)</main>`)
	styleGuideHTMLArticle = regexp.MustCompile(`(?is)<article\b[^>]*>(.*?)</article>`)
	styleGuideHTMLTitle   = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
	styleGuideHTMLLinks   = regexp.MustCompile(`(?is)<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']`)
	styleGuideHTMLBreaks  = regexp.MustCompile(`(?i)<(?:br\s*/?|/p|/li|/h[1-6]|/div|/tr|/dt|/dd|/blockquote)>`)
	styleGuideHTMLTags    = regexp.MustCompile(`(?is)<[^>]+>`)
	styleGuideBullet      = regexp.MustCompile(`^(?:[-*•▪◦‣]\s+|\d+[.)]\s+)`)
	styleGuideSpaces      = regexp.MustCompile(`\s+`)
	styleGuidePDFChrome   = regexp.MustCompile(`^(?:\d{1,2}/\d{1,2}/\d{2},\s+\d{1,2}:\d{2}\s+[AP]M(?:\s+Wiki\s+-\s+Style\s+Guide)?|\d+/\d+)$`)
	styleGuidePDFHeader   = regexp.MustCompile(`^(?:Style Guide(?:\s+\d+)?|Wiki\s+-\s+Style\s+Guide.*)$`)
	styleGuideDateOnly    = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
)

func runStyleGuideImport(path string) {
	guide, err := importStyleGuide(path)
	if err != nil {
		fmt.Printf("Style-guide import failed: %v\n", err)
		return
	}
	if err := saveStyleGuide(guide); err != nil {
		fmt.Printf("Style-guide import failed saving %q: %v\n", guide.ID, err)
		return
	}
	if _, err := loadActiveStyleGuide(); os.IsNotExist(err) {
		_ = selectStyleGuide(guide.ID)
		fmt.Printf("Active style guide set to %q.\n", guide.Name)
	}
	fmt.Printf("Imported style guide %q with %d entries as %s.\n", guide.Name, len(guide.Entries), guide.ID)
	fmt.Printf("Human-review CSV: %s\n", guide.ReviewPath)
}

func runStyleGuideRulesImport(guideID, path string) {
	guide, compiled, deferred, err := installStyleGuideRules(guideID, path)
	if err != nil {
		fmt.Printf("Style-guide rule import failed: %v\n", err)
		return
	}
	fmt.Printf("Imported rules for %q: %d live XML rules, %d deferred for contextual review.\n", guide.Name, compiled, deferred)
	fmt.Printf("Managed CSV: %s\nManaged XML: %s\n", styleGuideRulesCSVPath(guide.ID), guide.RulesPath)
}

func runStyleGuideReviewRefresh(path string) {
	guide, err := importStyleGuide(path)
	if err != nil {
		fmt.Printf("Style-guide review generation failed: %v\n", err)
		return
	}
	content, sourceType, err := readStyleGuideSource(path)
	if err != nil {
		fmt.Printf("Style-guide review generation failed: %v\n", err)
		return
	}
	reviewPath, err := writeStyleGuideReviewCSV(guide, content, sourceType, true)
	if err != nil {
		fmt.Printf("Style-guide review generation failed: %v\n", err)
		return
	}
	guide.ReviewPath = reviewPath
	if err := saveStyleGuide(guide); err != nil {
		fmt.Printf("Style-guide review generation failed saving %q: %v\n", guide.ID, err)
		return
	}
	fmt.Printf("Regenerated human-review CSV for %q: %s\n", guide.Name, reviewPath)
}

func runStyleGuideReviewExport(guideID string) {
	inputPath, promptPath, err := exportStyleGuideEnrichment(guideID)
	if err != nil {
		fmt.Printf("Style-guide enrichment export failed: %v\n", err)
		return
	}
	fmt.Printf("Enrichment input: %s\nPrompt: %s\n", inputPath, promptPath)
	fmt.Println("Give the JSONL input and prompt to an LLM, save its JSONL output, then import it with --style-guide-review-enrichment-import.")
}

func runStyleGuideReviewEnrichmentImport(guideID, path string) {
	outputPath, err := mergeStyleGuideEnrichment(guideID, path)
	if err != nil {
		fmt.Printf("Style-guide enrichment import failed: %v\n", err)
		return
	}
	fmt.Printf("Merged draft enrichment review: %s\n", outputPath)
}

func runStyleGuideReviewLint(guideID string) {
	report, err := lintStyleGuideReview(guideID)
	if err != nil {
		fmt.Printf("Style-guide review lint failed: %v\n", err)
		return
	}
	fmt.Printf("Style-guide review lint for %q: %d rows, %d approved, %d draft, %d disabled.\n", guideID, report.Rows, report.Approved, report.Draft, report.Disabled)
	for _, warning := range report.Warnings {
		fmt.Printf("WARNING: %s\n", warning)
	}
	for _, problem := range report.Errors {
		fmt.Printf("ERROR: %s\n", problem)
	}
	if len(report.Errors) == 0 {
		fmt.Println("Review is structurally valid; only approved rows are eligible for activation.")
	}
}

func runStyleGuideReviewActivate(guideID, path string) {
	if _, err := loadStyleGuideByID(guideID); err != nil {
		fmt.Printf("Style-guide review activation failed: %v\n", err)
		return
	}
	rows, err := loadStyleGuideReviewRowsPath(path)
	if err != nil {
		fmt.Printf("Style-guide review activation failed: %v\n", err)
		return
	}
	report := lintStyleGuideReviewRows(rows)
	if len(report.Errors) > 0 {
		fmt.Printf("Style-guide review activation refused: %d lint errors.\n", len(report.Errors))
		for _, problem := range report.Errors {
			fmt.Printf("ERROR: %s\n", problem)
		}
		return
	}
	if err := writeStyleGuideReviewRows(styleGuideReviewCSVPath(guideID), rows); err != nil {
		fmt.Printf("Style-guide review activation failed: %v\n", err)
		return
	}
	fmt.Printf("Activated review CSV for %q. Only rows marked approved will be used by XML or the quality sidecar.\n", guideID)
}

func importStyleGuide(path string) (styleGuide, error) {
	content, sourceType, err := readStyleGuideSource(path)
	if err != nil {
		return styleGuide{}, err
	}
	name := styleGuideDisplayName(path)
	if isStyleGuideURL(path) {
		if title := styleGuideHTMLTitleText(content); title != "" {
			name = title
		}
	}
	id := styleGuideID(name)
	entries := normalizeStyleGuideEntries(content, sourceType)
	if len(entries) == 0 {
		return styleGuide{}, fmt.Errorf("no list items or guidance lines found in %s", path)
	}
	guide := styleGuide{
		ID:         id,
		Name:       name,
		Source:     path,
		SourceType: sourceType,
		ImportedAt: time.Now().UTC().Format(time.RFC3339),
		Entries:    entries,
	}
	reviewPath, err := writeStyleGuideReviewCSV(guide, content, sourceType, false)
	if err != nil {
		return styleGuide{}, err
	}
	guide.ReviewPath = reviewPath
	rulePath, ruleCount, err := compileStyleGuideRules(guide)
	if err != nil {
		return styleGuide{}, err
	}
	guide.RulesPath = rulePath
	guide.RuleCount = ruleCount
	return guide, nil
}

func styleGuideReviewCSVPath(id string) string {
	return filepath.Join(styleGuideStorageDir(), id+".review.csv")
}

func writeStyleGuideReviewCSV(guide styleGuide, content, sourceType string, overwrite bool) (string, error) {
	path := styleGuideReviewCSVPath(guide.ID)
	if _, err := os.Stat(path); err == nil && !overwrite {
		// Preserve an editor's work when the source PDF is re-imported.
		return path, nil
	} else if err != nil && !os.IsNotExist(err) {
		return "", err
	}
	if err := os.MkdirAll(styleGuideStorageDir(), 0755); err != nil {
		return "", err
	}
	file, err := os.Create(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	writer := csv.NewWriter(file)
	if err := writer.Write(styleGuideReviewHeader); err != nil {
		return "", err
	}
	pageByText := styleGuideSourcePageIndex(content, sourceType)
	for _, entry := range guide.Entries {
		page := pageByText[entry.Text]
		if page == 0 && sourceType != "pdf" {
			page = 1
		}
		candidate := deterministicStyleGuideCandidate(entry.Text)
		notes := candidate.Notes
		if notes == "" {
			notes = "No deterministic structured candidate found; fill in match and replacement if this is actionable."
		}
		row := []string{
			entry.ID,
			fmt.Sprintf("%d", page),
			entry.Section,
			entry.Text,
			candidate.Kind,
			candidate.Confidence,
			candidate.Match,
			candidate.Replacement,
			strings.Join(candidate.Alternatives, " | "),
			candidate.Scope,
			"",
			"",
			"",
			"draft",
			notes,
		}
		if err := writer.Write(row); err != nil {
			return "", err
		}
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return "", err
	}
	return path, nil
}

func styleGuideEnrichmentInputPath(id string) string {
	return filepath.Join(styleGuideStorageDir(), id+".enrichment-input.jsonl")
}

func styleGuideEnrichmentPromptPath(id string) string {
	return filepath.Join(styleGuideStorageDir(), id+".enrichment-prompt.md")
}

func styleGuideEnrichedReviewPath(id string) string {
	return filepath.Join(styleGuideStorageDir(), id+".review.enriched.csv")
}

func loadStyleGuideReviewRows(id string) ([]styleGuideReviewRow, error) {
	return loadStyleGuideReviewRowsPath(styleGuideReviewCSVPath(id))
}

func loadStyleGuideReviewRowsPath(path string) ([]styleGuideReviewRow, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	reader := csv.NewReader(file)
	reader.FieldsPerRecord = -1
	header, err := reader.Read()
	if err != nil {
		return nil, fmt.Errorf("review CSV has no header: %w", err)
	}
	columns := make(map[string]int, len(header))
	for index, name := range header {
		columns[strings.ToLower(strings.TrimSpace(strings.TrimPrefix(name, "\ufeff")))] = index
	}
	value := func(record []string, name string) string {
		index, ok := columns[name]
		if !ok || index >= len(record) {
			return ""
		}
		return strings.TrimSpace(record[index])
	}
	rows := make([]styleGuideReviewRow, 0)
	for rowNumber := 2; ; rowNumber++ {
		record, readErr := reader.Read()
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return nil, fmt.Errorf("review CSV row %d: %w", rowNumber, readErr)
		}
		if len(record) == 0 || strings.TrimSpace(strings.Join(record, "")) == "" {
			continue
		}
		if value(record, "id") == "" {
			return nil, fmt.Errorf("review CSV row %d has no id", rowNumber)
		}
		rows = append(rows, styleGuideReviewRow{
			ID:           value(record, "id"),
			SourcePage:   value(record, "source_page"),
			Section:      value(record, "section"),
			SourceText:   value(record, "source_text"),
			Kind:         value(record, "kind"),
			Confidence:   value(record, "confidence"),
			Match:        value(record, "match"),
			Replacement:  value(record, "replacement"),
			Alternatives: splitReviewAlternatives(value(record, "alternatives")),
			Scope:        value(record, "scope"),
			Message:      value(record, "message"),
			Example:      value(record, "example"),
			Correction:   value(record, "correction"),
			Status:       value(record, "status"),
			Notes:        value(record, "notes"),
		})
	}
	return rows, nil
}

func splitReviewAlternatives(value string) []string {
	parts := strings.Split(value, "|")
	alternatives := make([]string, 0, len(parts))
	for _, part := range parts {
		if part = strings.TrimSpace(part); part != "" {
			alternatives = append(alternatives, part)
		}
	}
	return alternatives
}

func writeStyleGuideReviewRows(path string, rows []styleGuideReviewRow) error {
	file, err := os.Create(path)
	if err != nil {
		return err
	}
	defer file.Close()
	writer := csv.NewWriter(file)
	if err := writer.Write(styleGuideReviewHeader); err != nil {
		return err
	}
	for _, row := range rows {
		if err := writer.Write([]string{
			row.ID, row.SourcePage, row.Section, row.SourceText, row.Kind, row.Confidence,
			row.Match, row.Replacement, strings.Join(row.Alternatives, " | "), row.Scope,
			row.Message, row.Example, row.Correction, row.Status, row.Notes,
		}); err != nil {
			return err
		}
	}
	writer.Flush()
	return writer.Error()
}

type styleGuideReviewLintReport struct {
	Rows     int
	Approved int
	Draft    int
	Disabled int
	Errors   []string
	Warnings []string
}

func lintStyleGuideReview(id string) (styleGuideReviewLintReport, error) {
	rows, err := loadStyleGuideReviewRows(id)
	if err != nil {
		return styleGuideReviewLintReport{}, err
	}
	return lintStyleGuideReviewRows(rows), nil
}

func lintStyleGuideReviewRows(rows []styleGuideReviewRow) styleGuideReviewLintReport {
	report := styleGuideReviewLintReport{Rows: len(rows)}
	hardMatches := make(map[string]string)
	seenIDs := make(map[string]bool)
	for index, row := range rows {
		label := fmt.Sprintf("row %d (%s)", index+2, row.ID)
		if seenIDs[row.ID] {
			report.Errors = append(report.Errors, label+" repeats an id")
		}
		seenIDs[row.ID] = true
		status := strings.ToLower(strings.TrimSpace(row.Status))
		switch status {
		case "approved":
			report.Approved++
		case "draft", "":
			report.Draft++
			if status == "" {
				report.Errors = append(report.Errors, label+" has no status")
			}
		case "disabled":
			report.Disabled++
		default:
			report.Errors = append(report.Errors, label+" has unsupported status "+fmt.Sprintf("%q", row.Status))
		}
		kind := normalizeStyleGuideRuleKind(row.Kind)
		if strings.TrimSpace(row.Kind) != "" && kind == "" {
			report.Errors = append(report.Errors, label+" has unsupported kind "+fmt.Sprintf("%q", row.Kind))
			continue
		}
		if kind == "" {
			if status == "approved" {
				report.Errors = append(report.Errors, label+" is approved but has no rule kind")
			}
			continue
		}
		if row.Match == "" {
			report.Errors = append(report.Errors, label+" has a kind but no match")
		}
		if kind == "hard_replacement" && row.Replacement == "" {
			report.Errors = append(report.Errors, label+" hard replacement has no replacement")
		}
		if kind == "contextual_preference" && row.Replacement == "" && len(row.Alternatives) == 0 {
			report.Errors = append(report.Errors, label+" contextual preference has no replacement or alternatives")
		}
		if row.Match != "" && row.SourceText != "" && !strings.Contains(strings.ToLower(row.SourceText), strings.ToLower(row.Match)) {
			report.Errors = append(report.Errors, label+" match is not present in source_text")
		}
		if row.Example != "" && row.Match != "" && !strings.Contains(strings.ToLower(row.Example), strings.ToLower(row.Match)) {
			report.Errors = append(report.Errors, label+" example does not contain match")
		}
		if status == "approved" && kind == "hard_replacement" {
			key := strings.ToLower(strings.TrimSpace(row.Match))
			if previous, exists := hardMatches[key]; exists && !strings.EqualFold(previous, row.Replacement) {
				report.Errors = append(report.Errors, label+" conflicts with another approved hard replacement for "+fmt.Sprintf("%q", row.Match))
			} else {
				hardMatches[key] = row.Replacement
			}
			if strings.EqualFold(strings.TrimSpace(row.Match), strings.TrimSpace(row.Replacement)) {
				report.Errors = append(report.Errors, label+" replaces a term with itself")
			}
		}
		if status == "draft" || status == "" {
			report.Warnings = append(report.Warnings, label+" remains draft and will not be active")
		}
	}
	return report
}

func exportStyleGuideEnrichment(id string) (string, string, error) {
	rows, err := loadStyleGuideReviewRows(id)
	if err != nil {
		return "", "", err
	}
	if err := os.MkdirAll(styleGuideStorageDir(), 0755); err != nil {
		return "", "", err
	}
	inputPath := styleGuideEnrichmentInputPath(id)
	inputFile, err := os.Create(inputPath)
	if err != nil {
		return "", "", err
	}
	encoder := json.NewEncoder(inputFile)
	for _, row := range rows {
		input := map[string]any{
			"id":          row.ID,
			"source_page": row.SourcePage,
			"section":     row.Section,
			"source_text": row.SourceText,
			"existing": styleGuideEnrichmentOutput{
				Kind: row.Kind, Confidence: row.Confidence, Match: row.Match,
				Replacement: row.Replacement, Alternatives: row.Alternatives, Scope: row.Scope,
			},
		}
		if err := encoder.Encode(input); err != nil {
			inputFile.Close()
			return "", "", err
		}
	}
	if err := inputFile.Close(); err != nil {
		return "", "", err
	}
	prompt := `# Style-guide enrichment task

Read each JSONL record from the companion input file and return exactly one JSON object per input record, in the same order. Do not return Markdown fences or commentary.

Output fields:

{"id":"entry-001","kind":"hard_replacement|contextual_preference|do_not_equate|","confidence":"high|medium|low","match":"text being reviewed","replacement":"one preferred replacement or empty","alternatives":["other valid alternatives"],"scope":"terminology|grammar|punctuation|capitalization|formatting|voice|other","notes":"brief evidence-based explanation"}

Rules:

- Preserve the source meaning. Never invent a replacement that is not supported by the source text.
- Use hard_replacement only for genuinely interchangeable forms with an explicit preferred form.
- Use contextual_preference when the guide gives alternatives, exceptions, or meaning-dependent advice.
- Use do_not_equate when the source says not to treat terms as interchangeable or gives no safe replacement.
- Return an empty kind when the source is general advice, a heading, an example, or not actionable as a text rule.
- Keep every proposal in draft status; a human editor approves it later.
`
	promptPath := styleGuideEnrichmentPromptPath(id)
	if err := os.WriteFile(promptPath, []byte(prompt), 0644); err != nil {
		return "", "", err
	}
	return inputPath, promptPath, nil
}

func mergeStyleGuideEnrichment(id, enrichmentPath string) (string, error) {
	rows, err := loadStyleGuideReviewRows(id)
	if err != nil {
		return "", err
	}
	byID := make(map[string]*styleGuideReviewRow, len(rows))
	for index := range rows {
		byID[rows[index].ID] = &rows[index]
	}
	file, err := os.Open(enrichmentPath)
	if err != nil {
		return "", err
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64*1024), 2*1024*1024)
	seen := make(map[string]bool)
	lineNumber := 0
	for scanner.Scan() {
		lineNumber++
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var output styleGuideEnrichmentOutput
		if err := json.Unmarshal([]byte(line), &output); err != nil {
			return "", fmt.Errorf("enrichment JSONL line %d: %w", lineNumber, err)
		}
		row, ok := byID[output.ID]
		if !ok {
			return "", fmt.Errorf("enrichment line %d references unknown review id %q", lineNumber, output.ID)
		}
		if seen[output.ID] {
			return "", fmt.Errorf("enrichment JSONL repeats review id %q", output.ID)
		}
		seen[output.ID] = true
		output.Kind = normalizeStyleGuideRuleKind(output.Kind)
		if output.Kind != "" && output.Match == "" {
			return "", fmt.Errorf("enrichment line %d rule %q has kind but no match", lineNumber, output.ID)
		}
		if output.Kind == "hard_replacement" && output.Replacement == "" {
			return "", fmt.Errorf("enrichment line %d hard rule %q has no replacement", lineNumber, output.ID)
		}
		if output.Kind == "contextual_preference" && output.Replacement == "" && len(output.Alternatives) == 0 {
			return "", fmt.Errorf("enrichment line %d contextual rule %q has no replacement or alternatives", lineNumber, output.ID)
		}
		row.Kind = output.Kind
		row.Confidence = strings.ToLower(strings.TrimSpace(output.Confidence))
		row.Match = strings.TrimSpace(output.Match)
		row.Replacement = strings.TrimSpace(output.Replacement)
		row.Alternatives = output.Alternatives
		row.Scope = strings.TrimSpace(output.Scope)
		row.Status = "draft"
		row.Notes = strings.TrimSpace(output.Notes)
		if row.Notes == "" {
			row.Notes = "LLM-enriched proposal; review against the source before approval."
		} else {
			row.Notes = "LLM-enriched proposal; review against the source before approval. " + row.Notes
		}
	}
	if err := scanner.Err(); err != nil {
		return "", err
	}
	outputPath := styleGuideEnrichedReviewPath(id)
	if err := writeStyleGuideReviewRows(outputPath, rows); err != nil {
		return "", err
	}
	return outputPath, nil
}

func deterministicStyleGuideCandidate(text string) styleGuideCandidate {
	match, replacement := deterministicStyleGuidePair(text)
	if match != "" && replacement != "" {
		kind := "hard_replacement"
		if strings.HasPrefix(strings.ToLower(strings.TrimSpace(text)), "prefer ") {
			kind = "contextual_preference"
		}
		return styleGuideCandidate{
			Kind:         kind,
			Confidence:   "medium",
			Match:        match,
			Replacement:  replacement,
			Alternatives: []string{replacement},
			Scope:        "terminology",
			Notes:        "Explicit terminology pair extracted; verify meaning and scope before approval.",
		}
	}

	match, alternatives := deterministicStyleGuideAvoidance(text)
	if match != "" {
		candidate := styleGuideCandidate{
			Kind:       "do_not_equate",
			Confidence: "medium",
			Match:      match,
			Scope:      "terminology",
			Notes:      "Explicit avoid/do-not-use guidance extracted; review the surrounding context.",
		}
		if len(alternatives) > 0 {
			candidate.Kind = "contextual_preference"
			candidate.Alternatives = alternatives
			candidate.Replacement = alternatives[0]
		}
		return candidate
	}
	return styleGuideCandidate{}
}

func deterministicStyleGuideAvoidance(text string) (string, []string) {
	lower := strings.ToLower(strings.TrimSpace(text))
	prefixes := []string{"avoid ", "don't use ", "do not use ", "never use "}
	prefix := ""
	for _, candidate := range prefixes {
		if strings.HasPrefix(lower, candidate) {
			prefix = candidate
			break
		}
	}
	if prefix == "" {
		return "", nil
	}
	body := strings.TrimSpace(text[len(prefix):])
	separatorIndex := -1
	separatorLength := 0
	for _, separator := range []string{". Instead, use ", ". instead use ", "; use ", "; instead, use "} {
		if index := strings.Index(strings.ToLower(body), strings.ToLower(separator)); index >= 0 && (separatorIndex < 0 || index < separatorIndex) {
			separatorIndex = index
			separatorLength = len(separator)
		}
	}
	term := body
	replacementText := ""
	if separatorIndex >= 0 {
		term = body[:separatorIndex]
		replacementText = body[separatorIndex+separatorLength:]
	}
	term = cleanStyleGuideTerm(term)
	if !validStyleGuideTerm(term) {
		return "", nil
	}
	if replacementText == "" {
		return term, nil
	}
	return term, splitStyleGuideAlternatives(replacementText)
}

func validStyleGuideTerm(term string) bool {
	term = strings.TrimSpace(term)
	if term == "" || len(strings.Fields(term)) > 5 || strings.ContainsAny(term, ";,:!?\n") || strings.Contains(term, ". ") {
		return false
	}
	lower := strings.ToLower(term)
	for _, fragment := range []string{" when ", " where ", " using ", " refer ", " as a ", " to refer", " such as ", " in general ", " to mean ", " in isolation ", " terms like "} {
		if strings.Contains(lower, fragment) {
			return false
		}
	}
	for _, prefix := range []string{"when ", "where ", "using ", "in general", "as a ", "as short ", "in isolation", "terms like ", "if ", "to indicate ", "to refer ", "to describe ", "to mean "} {
		if strings.HasPrefix(lower, prefix) {
			return false
		}
	}
	if lower == "when" || lower == "where" || lower == "using" || lower == "if" {
		return false
	}
	return true
}

func splitStyleGuideAlternatives(text string) []string {
	text = cleanStyleGuideTerm(text)
	if index := strings.Index(strings.ToLower(text), "such as "); index >= 0 {
		text = text[index+len("such as "):]
	}
	text = strings.TrimSpace(text)
	text = strings.TrimSuffix(text, ".")
	parts := regexp.MustCompile(`(?i)\s*,\s*|\s+or\s+|\s+and\s+`).Split(text, -1)
	alternatives := make([]string, 0, len(parts))
	for _, part := range parts {
		part = cleanStyleGuideTerm(part)
		for _, conjunction := range []string{"or ", "and "} {
			if strings.HasPrefix(strings.ToLower(part), conjunction) {
				part = strings.TrimSpace(part[len(conjunction):])
			}
		}
		if validStyleGuideTerm(part) {
			alternatives = append(alternatives, part)
		}
	}
	return alternatives
}

func styleGuideSourcePageIndex(content, sourceType string) map[string]int {
	pagesByText := make(map[string]int)
	if sourceType != "pdf" && !(sourceType == "html" && strings.Contains(content, "\f")) {
		return pagesByText
	}
	for pageNumber, page := range strings.Split(content, "\f") {
		for _, entry := range normalizeStyleGuideEntries(page, sourceType) {
			if _, exists := pagesByText[entry.Text]; !exists {
				pagesByText[entry.Text] = pageNumber + 1
			}
		}
	}
	return pagesByText
}

var styleGuideReplacementPair = regexp.MustCompile(`(?i)^\s*(?:use|prefer|choose|write|favor|favour)\s+(.+?)\s+(?:instead of|rather than|over)\s+(.+)\s*$`)
var styleGuideAvoidUsePair = regexp.MustCompile(`(?i)^\s*(?:avoid|do not use|don't use|never use)\s+(.+?)[,;:]\s*(?:use|prefer)\s+(.+)\s*$`)

func deterministicStyleGuidePair(text string) (string, string) {
	match := styleGuideReplacementPair.FindStringSubmatch(text)
	if len(match) != 3 {
		match = styleGuideAvoidUsePair.FindStringSubmatch(text)
		if len(match) != 3 {
			return "", ""
		}
		return validateStyleGuidePair(match[1], match[2])
	}
	return validateStyleGuidePair(match[2], match[1])
}

func validateStyleGuidePair(match, replacement string) (string, string) {
	match = cleanStyleGuideTerm(match)
	replacement = cleanStyleGuideTerm(replacement)
	if replacement == "" || match == "" {
		return "", ""
	}
	for _, term := range []string{replacement, match} {
		lower := strings.ToLower(term)
		if len(strings.Fields(term)) > 5 || strings.ContainsAny(term, ";,:!?\n") || strings.Contains(term, ". ") ||
			strings.Contains(lower, " when ") || strings.Contains(lower, " if ") ||
			strings.Contains(lower, " refer ") || strings.Contains(lower, " using ") ||
			strings.Contains(lower, " such as ") {
			return "", ""
		}
	}
	return match, replacement
}

func cleanStyleGuideTerm(term string) string {
	term = strings.TrimSpace(term)
	term = strings.Trim(term, " \t\"'“”‘’()[]{}")
	term = strings.TrimRight(term, ",;:")
	if strings.HasSuffix(term, ".") && strings.Count(term, ".") == 1 {
		term = strings.TrimSuffix(term, ".")
	}
	return term
}

func readStyleGuideSource(path string) (string, string, error) {
	if isStyleGuideURL(path) {
		return readStyleGuideURL(path)
	}
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".pdf":
		pdftotext, err := exec.LookPath("pdftotext")
		if err != nil {
			return "", "", fmt.Errorf("PDF import requires pdftotext (install Poppler, then retry)")
		}
		output, err := exec.Command(pdftotext, "-layout", path, "-").Output()
		if err != nil {
			return "", "", fmt.Errorf("pdftotext failed: %w", err)
		}
		return string(output), "pdf", nil
	case ".html", ".htm":
		content, err := os.ReadFile(path)
		return string(content), "html", err
	case ".md", ".markdown", ".txt":
		content, err := os.ReadFile(path)
		return string(content), "text", err
	default:
		content, err := os.ReadFile(path)
		return string(content), "text", err
	}
}

func isStyleGuideURL(value string) bool {
	parsed, err := url.Parse(strings.TrimSpace(value))
	return err == nil && (parsed.Scheme == "http" || parsed.Scheme == "https") && parsed.Host != ""
}

func readStyleGuideURL(rawURL string) (string, string, error) {
	start, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || start.Host == "" || (start.Scheme != "http" && start.Scheme != "https") {
		return "", "", fmt.Errorf("invalid style-guide URL %q", rawURL)
	}
	start.Fragment = ""
	start.RawQuery = ""
	startURL := start.String()
	scope := styleGuideURLScope(start)
	client := &http.Client{Timeout: 20 * time.Second}
	queue := []string{startURL}
	visited := make(map[string]bool)
	pages := make([]string, 0)
	const maxPages = 256

	for len(queue) > 0 && len(pages) < maxPages {
		pageURL := queue[0]
		queue = queue[1:]
		if visited[pageURL] {
			continue
		}
		visited[pageURL] = true
		content, contentType, fetchErr := fetchStyleGuideHTML(client, pageURL)
		if fetchErr != nil {
			if pageURL == startURL {
				return "", "", fetchErr
			}
			continue
		}
		if contentType != "" && !strings.Contains(contentType, "text/html") && !strings.Contains(contentType, "application/xhtml") {
			continue
		}
		pages = append(pages, content)
		for _, link := range extractStyleGuideLinks(content, pageURL, start, scope) {
			if !visited[link] && len(queue)+len(pages) < maxPages {
				queue = append(queue, link)
			}
		}
	}
	if len(pages) == 0 {
		return "", "", fmt.Errorf("style-guide URL returned no HTML pages: %s", rawURL)
	}
	return strings.Join(pages, "\f"), "html", nil
}

func fetchStyleGuideHTML(client *http.Client, target string) (string, string, error) {
	request, err := http.NewRequest(http.MethodGet, target, nil)
	if err != nil {
		return "", "", err
	}
	request.Header.Set("User-Agent", "ikmal-editor-style-guide-import/1.0")
	response, err := client.Do(request)
	if err != nil {
		return "", "", err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", "", fmt.Errorf("style-guide URL %s returned HTTP %d", target, response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, 20<<20))
	if err != nil {
		return "", "", err
	}
	return string(body), strings.ToLower(response.Header.Get("Content-Type")), nil
}

func styleGuideURLScope(start *url.URL) string {
	path := strings.Trim(start.Path, "/")
	if path == "" {
		return "/"
	}
	parts := strings.Split(path, "/")
	guideIndex := -1
	for i, part := range parts {
		lower := strings.ToLower(part)
		if strings.Contains(lower, "style") || strings.Contains(lower, "guide") {
			guideIndex = i
		}
	}
	if guideIndex >= 0 {
		return "/" + strings.Join(parts[:guideIndex+1], "/") + "/"
	}
	if len(parts) > 1 {
		return "/" + strings.Join(parts[:len(parts)-1], "/") + "/"
	}
	return "/" + parts[0] + "/"
}

func extractStyleGuideLinks(content, base string, start *url.URL, scope string) []string {
	links := make([]string, 0)
	seen := make(map[string]bool)
	for _, match := range styleGuideHTMLLinks.FindAllStringSubmatch(content, -1) {
		if len(match) != 2 {
			continue
		}
		href := strings.TrimSpace(html.UnescapeString(match[1]))
		if href == "" || strings.HasPrefix(href, "#") || strings.HasPrefix(strings.ToLower(href), "mailto:") || strings.HasPrefix(strings.ToLower(href), "javascript:") {
			continue
		}
		resolved, err := url.Parse(href)
		if err != nil {
			continue
		}
		resolved = mustResolveURL(base, resolved)
		resolved.Fragment = ""
		resolved.RawQuery = ""
		if resolved.Scheme != start.Scheme || !strings.EqualFold(resolved.Host, start.Host) || !strings.HasPrefix(resolved.Path, scope) {
			continue
		}
		ext := strings.ToLower(filepath.Ext(resolved.Path))
		if ext != "" && ext != ".html" && ext != ".htm" && ext != ".web" {
			continue
		}
		canonical := resolved.String()
		if !seen[canonical] {
			seen[canonical] = true
			links = append(links, canonical)
		}
	}
	return links
}

func mustResolveURL(base string, relative *url.URL) *url.URL {
	baseURL, err := url.Parse(base)
	if err != nil {
		return relative
	}
	return baseURL.ResolveReference(relative)
}

func styleGuideHTMLTitleText(content string) string {
	match := styleGuideHTMLTitle.FindStringSubmatch(content)
	if len(match) != 2 {
		return ""
	}
	title := styleGuideHTMLTags.ReplaceAllString(match[1], " ")
	title = html.UnescapeString(styleGuideSpaces.ReplaceAllString(title, " "))
	title = strings.TrimSpace(title)
	for _, separator := range []string{" | ", " - ", " — "} {
		if index := strings.Index(title, separator); index > 0 {
			title = strings.TrimSpace(title[:index])
			break
		}
	}
	return title
}

func normalizeStyleGuideEntries(content, sourceType string) []styleGuideEntry {
	if sourceType == "html" {
		pages := make([]string, 0)
		for _, page := range strings.Split(content, "\f") {
			pages = append(pages, normalizeStyleGuideHTMLPage(page))
		}
		content = strings.Join(pages, "\f")
	} else if sourceType == "pdf" {
		content = normalizeStyleGuidePDFPages(content)
	}

	entries := make([]styleGuideEntry, 0)
	seen := make(map[string]bool)
	content = strings.ReplaceAll(content, "\r\n", "\n")
	for _, page := range strings.Split(content, "\f") {
		section := ""
		for _, line := range strings.Split(page, "\n") {
			line = strings.TrimSpace(styleGuideBullet.ReplaceAllString(line, ""))
			line = styleGuideSpaces.ReplaceAllString(line, " ")
			line = strings.TrimSpace(line)
			line = strings.TrimRight(line, "; ")
			if styleGuidePDFChrome.MatchString(line) || line == "Style Guide" || strings.HasPrefix(line, "Wiki - Style Guide") ||
				strings.HasPrefix(line, "Wiki Home") || strings.HasPrefix(line, "https://") {
				continue
			}
			if sourceType == "html" && isStyleGuideHTMLChrome(line) {
				continue
			}
			if len([]rune(line)) < 3 {
				continue
			}
			key := strings.ToLower(line)
			if seen[key] {
				continue
			}
			seen[key] = true
			if styleGuideSectionHeading(line) {
				section = line
			}
			entries = append(entries, styleGuideEntry{
				ID:      fmt.Sprintf("entry-%03d", len(entries)+1),
				Text:    line,
				Kind:    styleGuideEntryKind(line),
				Section: section,
			})
		}
	}
	return entries
}

// Headings are deliberately inferred only when the line is short, title-like,
// and not itself an instruction. This gives reviewers useful context without
// pretending that a wrapped paragraph or an example is a section boundary.
func styleGuideSectionHeading(line string) bool {
	line = strings.TrimSpace(line)
	if line == "" || len([]rune(line)) > 80 || len(strings.Fields(line)) > 8 || strings.ContainsAny(line, ".?!:;,") {
		return false
	}
	lower := strings.ToLower(line)
	for _, prefix := range []string{"use ", "prefer ", "choose ", "write ", "favor ", "favour ", "avoid ", "don't ", "do not ", "never ", "omit ", "limit "} {
		if strings.HasPrefix(lower, prefix) {
			return false
		}
	}
	runes := []rune(line)
	return len(runes) > 0 && (unicode.IsUpper(runes[0]) || strings.ToUpper(line) == line)
}

func normalizeStyleGuidePDFPages(content string) string {
	pages := make([]string, 0)
	for _, page := range strings.Split(content, "\f") {
		paragraphs := make([]string, 0)
		current := make([]string, 0)
		flush := func() {
			if len(current) > 0 {
				paragraphs = append(paragraphs, strings.Join(current, " "))
				current = nil
			}
		}
		for _, rawLine := range strings.Split(page, "\n") {
			line := strings.TrimSpace(styleGuideBullet.ReplaceAllString(rawLine, ""))
			line = styleGuideSpaces.ReplaceAllString(line, " ")
			line = strings.TrimSpace(strings.TrimRight(line, "; "))
			if line == "" {
				flush()
				continue
			}
			if styleGuidePDFChrome.MatchString(line) || styleGuidePDFHeader.MatchString(line) || strings.HasPrefix(line, "https://") {
				flush()
				continue
			}
			current = append(current, line)
		}
		flush()
		pages = append(pages, strings.Join(paragraphs, "\n"))
	}
	return strings.Join(pages, "\f")
}

func normalizeStyleGuideHTMLPage(content string) string {
	if match := styleGuideHTMLArticle.FindStringSubmatch(content); len(match) == 2 {
		content = match[1]
	} else if match := styleGuideHTMLMain.FindStringSubmatch(content); len(match) == 2 {
		content = match[1]
	}
	content = styleGuideHTMLBlocks.ReplaceAllString(content, " ")
	content = strings.ReplaceAll(strings.ReplaceAll(content, "\r\n", " "), "\n", " ")
	content = styleGuideHTMLBreaks.ReplaceAllString(content, "\n")
	content = styleGuideHTMLTags.ReplaceAllString(content, " ")
	return html.UnescapeString(content)
}

func isStyleGuideHTMLChrome(line string) bool {
	switch line {
	case "Home", "Products", "Style", "Table of contents", "Exit editor mode", "Ask Learn", "Reading mode", "Read in English", "Add", "Add to Plans", "Edit", "Copy Markdown", "Print", "Note", "Feedback", "Summarize this article for me", "In this article", "Was this page helpful?", "Yes", "No", "Need help with this topic?", "Suggest a fix?", "Additional resources":
		return true
	}
	return strings.HasPrefix(line, "Skip to ") ||
		strings.HasPrefix(line, "Access to this page requires authorization.") ||
		strings.HasPrefix(line, "Want to try using Ask Learn") ||
		strings.HasPrefix(line, "Last updated on ") ||
		(strings.Contains(line, "Table of contents") && strings.Contains(line, "Exit editor mode")) ||
		(strings.Contains(line, "Reading mode") && strings.Contains(line, "Copy Markdown")) ||
		(strings.Contains(line, "Need help with this topic?") && strings.Contains(line, "Yes")) ||
		(strings.Contains(line, "Need help with this topic?") && strings.Contains(line, "Ask Learn")) ||
		strings.HasPrefix(line, "Ask Learn Ask Learn") ||
		strings.HasPrefix(line, "© ") || styleGuideDateOnly.MatchString(line)
}

func styleGuideEntryKind(text string) string {
	lower := strings.ToLower(strings.TrimSpace(text))
	for _, prefix := range []string{"avoid ", "do not ", "don't ", "never ", "omit ", "limit "} {
		if strings.HasPrefix(lower, prefix) {
			return "avoid"
		}
	}
	for _, prefix := range []string{"use ", "prefer ", "choose ", "write ", "keep ", "favor ", "favour "} {
		if strings.HasPrefix(lower, prefix) {
			return "prefer"
		}
	}
	return "guidance"
}

func styleGuideDisplayName(path string) string {
	name := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
	name = strings.NewReplacer("_", " ", "-", " ").Replace(name)
	return strings.TrimSpace(styleGuideSpaces.ReplaceAllString(name, " "))
}

func styleGuideID(name string) string {
	parts := make([]string, 0)
	lastDash := false
	for _, r := range strings.ToLower(name) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			parts = append(parts, string(r))
			lastDash = false
		} else if !lastDash && len(parts) > 0 {
			parts = append(parts, "-")
			lastDash = true
		}
	}
	return strings.Trim(strings.Join(parts, ""), "-")
}

func styleGuideStorageDir() string {
	if dir := strings.TrimSpace(os.Getenv("IKMAL_STYLE_GUIDE_DIR")); dir != "" {
		return dir
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(".ikmal-editor", "style-guides")
	}
	return filepath.Join(home, ".ikmal-editor", "style-guides")
}

func styleGuideSelectionPath() string {
	return filepath.Join(styleGuideStorageDir(), "active.json")
}

func saveStyleGuide(guide styleGuide) error {
	if err := os.MkdirAll(styleGuideStorageDir(), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(guide, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(styleGuideStorageDir(), guide.ID+".json"), append(data, '\n'), 0644)
}

func compileStyleGuideRules(guide styleGuide) (string, int, error) {
	rules := styleGuideRuleSeeds(guide)
	explicitRules, err := loadStyleGuideRuleSpecs(guide.ID)
	if err != nil {
		return "", 0, err
	}
	if err := validateStyleGuideRuleSpecs(explicitRules); err != nil {
		return "", 0, err
	}
	rules = append(rules, compileStyleGuideRuleSpecs(guide, explicitRules)...)
	path := filepath.Join(styleGuideStorageDir(), guide.ID+".xml")
	if err := os.MkdirAll(styleGuideStorageDir(), 0755); err != nil {
		return "", 0, err
	}
	var builder strings.Builder
	builder.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	builder.WriteString(`<rules lang="en">` + "\n")
	builder.WriteString(`  <category id="IKMAL_STYLE_` + strings.ToUpper(strings.ReplaceAll(guide.ID, "-", "_")) + `" name="` + html.EscapeString(guide.Name) + `">` + "\n")
	for _, rule := range rules {
		builder.WriteString(`    <rule id="` + rule.ID + `" name="` + html.EscapeString(rule.Name) + `">` + "\n")
		builder.WriteString("      <pattern>" + rule.Pattern + "</pattern>\n")
		builder.WriteString("      <message>" + rule.Message + "</message>\n")
		builder.WriteString("      <example correction=\"" + html.EscapeString(rule.Correction) + "\">" + rule.Example + "</example>\n")
		builder.WriteString("    </rule>\n")
	}
	builder.WriteString("  </category>\n</rules>\n")
	if err := os.WriteFile(path, []byte(builder.String()), 0644); err != nil {
		return "", 0, err
	}
	return path, len(rules), nil
}

func styleGuideRulesCSVPath(id string) string {
	return filepath.Join(styleGuideStorageDir(), id+".rules.csv")
}

func loadStyleGuideRuleSpecs(id string) ([]styleGuideRuleSpec, error) {
	path := styleGuideRulesCSVPath(id)
	content, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return parseStyleGuideRulesCSV(string(content))
}

func parseStyleGuideRulesCSV(content string) ([]styleGuideRuleSpec, error) {
	reader := csv.NewReader(strings.NewReader(content))
	reader.FieldsPerRecord = -1
	header, err := reader.Read()
	if err != nil {
		return nil, fmt.Errorf("rules CSV has no header: %w", err)
	}
	columns := make(map[string]int, len(header))
	for i, column := range header {
		column = strings.ToLower(strings.TrimSpace(strings.TrimPrefix(column, "\ufeff")))
		if column != "" {
			columns[column] = i
		}
	}
	for _, required := range []string{"id", "kind", "match", "replacement"} {
		if _, ok := columns[required]; !ok {
			return nil, fmt.Errorf("rules CSV is missing required column %q", required)
		}
	}

	value := func(record []string, name string) string {
		index, ok := columns[name]
		if !ok || index >= len(record) {
			return ""
		}
		return strings.TrimSpace(record[index])
	}

	specs := make([]styleGuideRuleSpec, 0)
	seen := make(map[string]bool)
	for row := 2; ; row++ {
		record, readErr := reader.Read()
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return nil, fmt.Errorf("rules CSV row %d: %w", row, readErr)
		}
		if len(record) == 0 || strings.TrimSpace(strings.Join(record, "")) == "" {
			continue
		}
		spec := styleGuideRuleSpec{
			ID:          strings.TrimSpace(value(record, "id")),
			Name:        strings.TrimSpace(value(record, "name")),
			Kind:        normalizeStyleGuideRuleKind(value(record, "kind")),
			Confidence:  strings.ToLower(strings.TrimSpace(value(record, "confidence"))),
			Match:       value(record, "match"),
			Replacement: value(record, "replacement"),
			Message:     value(record, "message"),
			Example:     value(record, "example"),
			Correction:  value(record, "correction"),
			Status:      strings.ToLower(strings.TrimSpace(value(record, "status"))),
		}
		if spec.Status == "" {
			spec.Status = "draft"
		}
		if spec.ID == "" || spec.Match == "" {
			return nil, fmt.Errorf("rules CSV row %d requires id and match", row)
		}
		if seen[spec.ID] {
			return nil, fmt.Errorf("rules CSV row %d duplicates rule id %q", row, spec.ID)
		}
		seen[spec.ID] = true
		if spec.Kind == "" {
			return nil, fmt.Errorf("rules CSV row %d has an unsupported kind", row)
		}
		if spec.Status != "draft" && spec.Status != "approved" && spec.Status != "disabled" {
			return nil, fmt.Errorf("rules CSV row %d has unsupported status %q", row, spec.Status)
		}
		if spec.Kind != "do_not_equate" && spec.Replacement == "" {
			return nil, fmt.Errorf("rules CSV row %d requires replacement for kind %q", row, spec.Kind)
		}
		if spec.Example != "" && !strings.Contains(spec.Example, spec.Match) {
			return nil, fmt.Errorf("rules CSV row %d example does not contain match %q", row, spec.Match)
		}
		specs = append(specs, spec)
	}
	if err := validateStyleGuideRuleSpecs(specs); err != nil {
		return nil, err
	}
	return specs, nil
}

func validateStyleGuideRuleSpecs(specs []styleGuideRuleSpec) error {
	hardMatches := make(map[string]string)
	for _, spec := range specs {
		if spec.Kind != "hard_replacement" || spec.Status != "approved" {
			continue
		}
		if strings.EqualFold(strings.TrimSpace(spec.Match), strings.TrimSpace(spec.Replacement)) {
			return fmt.Errorf("approved hard rule %q replaces a term with itself", spec.ID)
		}
		for _, value := range []struct {
			name string
			text string
		}{
			{name: "match", text: spec.Match},
			{name: "replacement", text: spec.Replacement},
		} {
			if strings.ContainsAny(value.text, "\r\n<>") || len(strings.Fields(value.text)) > 8 {
				return fmt.Errorf("approved hard rule %q has an unsafe %s literal", spec.ID, value.name)
			}
		}
		key := strings.ToLower(strings.TrimSpace(spec.Match))
		if previous, exists := hardMatches[key]; exists && !strings.EqualFold(previous, spec.Replacement) {
			return fmt.Errorf("approved hard rules have conflicting replacements for %q", spec.Match)
		}
		hardMatches[key] = spec.Replacement
	}
	return nil
}

func normalizeStyleGuideRuleKind(kind string) string {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "hard", "hard_replacement", "replacement":
		return "hard_replacement"
	case "contextual", "contextual_preference", "preference":
		return "contextual_preference"
	case "do_not_equate", "non_equivalent", "exclude":
		return "do_not_equate"
	default:
		return ""
	}
}

func compileStyleGuideRuleSpecs(guide styleGuide, specs []styleGuideRuleSpec) []styleGuideXMLRule {
	rules := make([]styleGuideXMLRule, 0)
	for _, spec := range specs {
		// Only explicitly approved hard replacements become LanguageTool XML.
		// Contextual preferences remain available for the quality sidecar, and
		// do_not_equate entries are documentation rather than replacements.
		if spec.Status != "approved" || spec.Kind != "hard_replacement" {
			continue
		}
		id := strings.ToUpper(strings.ReplaceAll(guide.ID, "-", "_")) + "_" + styleGuideRuleID(spec.ID)
		name := spec.Name
		if name == "" {
			name = "Prefer " + spec.Replacement + " instead of " + spec.Match
		}
		message := spec.Message
		if message == "" {
			message = "Prefer <suggestion>" + html.EscapeString(spec.Replacement) + "</suggestion> instead of " + html.EscapeString(spec.Match) + "."
		}
		example, correction := styleGuideRuleExample(spec)
		rules = append(rules, styleGuideXMLRule{
			ID:         id,
			Name:       name,
			Pattern:    styleGuideRulePattern(spec.Match),
			Message:    message,
			Suggestion: spec.Replacement,
			Example:    example,
			Correction: correction,
		})
	}
	return rules
}

func styleGuideRuleID(id string) string {
	parts := make([]string, 0)
	lastUnderscore := false
	for _, r := range strings.ToUpper(strings.TrimSpace(id)) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			parts = append(parts, string(r))
			lastUnderscore = false
		} else if !lastUnderscore && len(parts) > 0 {
			parts = append(parts, "_")
			lastUnderscore = true
		}
	}
	return strings.Trim(strings.Join(parts, ""), "_")
}

func styleGuideRulePattern(match string) string {
	parts := strings.Fields(match)
	patterns := make([]string, 0, len(parts))
	for _, part := range parts {
		patterns = append(patterns, `<token regexp="yes">`+html.EscapeString(regexp.QuoteMeta(part))+`</token>`)
	}
	return strings.Join(patterns, "")
}

func styleGuideRuleExample(spec styleGuideRuleSpec) (string, string) {
	example := spec.Example
	if example == "" {
		example = "... " + spec.Match + " ..."
	}
	correction := spec.Correction
	if correction == "" {
		correction = strings.Replace(example, spec.Match, spec.Replacement, 1)
	}
	marked := strings.Replace(example, spec.Match, "\x00", 1)
	if marked == example {
		marked = "... \x00 ..."
	}
	parts := strings.SplitN(marked, "\x00", 2)
	return html.EscapeString(parts[0]) + `<marker>` + html.EscapeString(spec.Match) + `</marker>` + html.EscapeString(parts[1]), correction
}

func installStyleGuideRules(guideID, path string) (styleGuide, int, int, error) {
	guides, err := loadStyleGuides()
	if err != nil {
		return styleGuide{}, 0, 0, err
	}
	var guide styleGuide
	for _, candidate := range guides {
		if candidate.ID == guideID {
			guide = candidate
			break
		}
	}
	if guide.ID == "" {
		return styleGuide{}, 0, 0, fmt.Errorf("style guide %q is not installed", guideID)
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return styleGuide{}, 0, 0, err
	}
	specs, err := parseStyleGuideRulesCSV(string(content))
	if err != nil {
		return styleGuide{}, 0, 0, err
	}
	if err := os.MkdirAll(styleGuideStorageDir(), 0755); err != nil {
		return styleGuide{}, 0, 0, err
	}
	if err := os.WriteFile(styleGuideRulesCSVPath(guideID), content, 0644); err != nil {
		return styleGuide{}, 0, 0, err
	}
	rulePath, ruleCount, err := compileStyleGuideRules(guide)
	if err != nil {
		return styleGuide{}, 0, 0, err
	}
	guide.RulesPath = rulePath
	guide.RuleCount = ruleCount
	if err := saveStyleGuide(guide); err != nil {
		return styleGuide{}, 0, 0, err
	}
	deferred := 0
	for _, spec := range specs {
		if spec.Status == "approved" && spec.Kind == "hard_replacement" {
			continue
		}
		deferred++
	}
	return guide, ruleCount, deferred, nil
}

func styleGuideRuleSeeds(guide styleGuide) []styleGuideXMLRule {
	if guide.ID != "wiki-style-guide" {
		return nil
	}
	return []styleGuideXMLRule{
		{
			ID:         "WIKI_OK_VARIANT",
			Name:       "Use okay instead of OK or O.K.",
			Pattern:    `<token regexp="yes">O\.K\.|OK</token>`,
			Message:    `The Wiki styleguide prefers <suggestion>okay</suggestion> instead of OK or O.K.`,
			Suggestion: "okay",
			Example:    `Please <marker>OK</marker> the final draft.`,
			Correction: "Please okay the final draft.",
		},
		{
			ID:         "WIKI_PERCENT_SYMBOL",
			Name:       "Use the percent symbol",
			Pattern:    `<token>percent</token>`,
			Message:    `Use the percent symbol in percentages: <suggestion>%</suggestion>.`,
			Suggestion: "%",
			Example:    `The result was 35 <marker>percent</marker>.`,
			Correction: "The result was 35 %.",
		},
		{
			ID:         "WIKI_SPELL_OUT_DEGREES",
			Name:       "Spell out degrees",
			Pattern:    `<token>°</token>`,
			Message:    `Spell out degrees: <suggestion> degrees</suggestion>.`,
			Suggestion: " degrees",
			Example:    `The temperature was 88<marker>°</marker> Fahrenheit.`,
			Correction: "The temperature was 88 degrees Fahrenheit.",
		},
	}
}

func loadStyleGuides() ([]styleGuide, error) {
	entries, err := os.ReadDir(styleGuideStorageDir())
	if err != nil {
		return nil, err
	}
	guides := make([]styleGuide, 0)
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" || entry.Name() == "active.json" {
			continue
		}
		content, err := os.ReadFile(filepath.Join(styleGuideStorageDir(), entry.Name()))
		if err != nil {
			continue
		}
		var guide styleGuide
		if json.Unmarshal(content, &guide) == nil {
			guides = append(guides, guide)
		}
	}
	sort.Slice(guides, func(i, j int) bool { return guides[i].Name < guides[j].Name })
	return guides, nil
}

func loadStyleGuideByID(id string) (styleGuide, error) {
	guides, err := loadStyleGuides()
	if err != nil {
		return styleGuide{}, err
	}
	for _, guide := range guides {
		if guide.ID == id {
			return guide, nil
		}
	}
	return styleGuide{}, fmt.Errorf("style guide %q is not installed", id)
}

func loadActiveStyleGuide() (styleGuide, error) {
	selectionContent, err := os.ReadFile(styleGuideSelectionPath())
	if err != nil {
		return styleGuide{}, err
	}
	var selection styleGuideSelection
	if err := json.Unmarshal(selectionContent, &selection); err != nil {
		return styleGuide{}, err
	}
	guides, err := loadStyleGuides()
	if err != nil {
		return styleGuide{}, err
	}
	for _, guide := range guides {
		if guide.ID == selection.GuideID {
			return guide, nil
		}
	}
	return styleGuide{}, fmt.Errorf("active style guide %q is not installed", selection.GuideID)
}

func selectStyleGuide(id string) error {
	guides, err := loadStyleGuides()
	if err != nil {
		return err
	}
	for _, guide := range guides {
		if guide.ID != id {
			continue
		}
		data, err := json.MarshalIndent(styleGuideSelection{GuideID: id, Enabled: false}, "", "  ")
		if err != nil {
			return err
		}
		if err := os.WriteFile(styleGuideSelectionPath(), append(data, '\n'), 0644); err != nil {
			return err
		}
		fmt.Printf("Active style guide: %s (%d entries)\n", guide.Name, len(guide.Entries))
		return nil
	}
	return fmt.Errorf("style guide %q is not installed", id)
}

func setStyleGuideEnabled(enabled bool) error {
	selection, err := loadStyleGuideSelection()
	if err != nil {
		return err
	}
	if _, err := loadActiveStyleGuide(); err != nil {
		return err
	}
	selection.Enabled = enabled
	data, err := json.MarshalIndent(selection, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(styleGuideSelectionPath(), append(data, '\n'), 0644); err != nil {
		return err
	}
	state := "disabled"
	if enabled {
		state = "enabled"
	}
	fmt.Printf("Active style guide %s. Restart LanguageTool to apply its XML rules.\n", state)
	return nil
}

func loadStyleGuideSelection() (styleGuideSelection, error) {
	content, err := os.ReadFile(styleGuideSelectionPath())
	if err != nil {
		return styleGuideSelection{}, err
	}
	var selection styleGuideSelection
	if err := json.Unmarshal(content, &selection); err != nil {
		return styleGuideSelection{}, err
	}
	return selection, nil
}

func activeStyleGuideRulesPath() (string, bool) {
	selection, err := loadStyleGuideSelection()
	if err != nil || !selection.Enabled {
		return "", false
	}
	guide, err := loadActiveStyleGuide()
	if err != nil || guide.RulesPath == "" {
		return "", false
	}
	if _, err := os.Stat(guide.RulesPath); err != nil {
		return "", false
	}
	return guide.RulesPath, true
}

func buildCombinedStyleGuideRules(basePath string) (string, bool, error) {
	stylePath, enabled := activeStyleGuideRulesPath()
	if !enabled {
		return basePath, false, nil
	}
	styleContent, err := os.ReadFile(stylePath)
	if err != nil {
		return basePath, false, err
	}
	baseContent, err := os.ReadFile(basePath)
	if err != nil {
		return basePath, false, err
	}
	baseClose := strings.LastIndex(string(baseContent), "</rules>")
	styleOpen := strings.Index(string(styleContent), ">")
	styleClose := strings.LastIndex(string(styleContent), "</rules>")
	if baseClose < 0 || styleOpen < 0 || styleClose < 0 || styleClose <= styleOpen {
		return basePath, false, fmt.Errorf("invalid XML rule pack structure")
	}
	guide, err := loadActiveStyleGuide()
	if err != nil {
		return basePath, false, err
	}
	combined := string(baseContent[:baseClose]) + "\n" + string(styleContent[styleOpen+1:styleClose]) + "\n" + string(baseContent[baseClose:])
	combinedPath := filepath.Join(filepath.Dir(basePath), "style_conciseness_"+guide.ID+".xml")
	if err := os.WriteFile(combinedPath, []byte(combined), 0644); err != nil {
		return basePath, false, err
	}
	return combinedPath, true, nil
}

func runStyleGuideList() {
	guides, err := loadStyleGuides()
	if err != nil {
		if os.IsNotExist(err) {
			fmt.Println("No style guides imported yet.")
			return
		}
		fmt.Printf("Could not list style guides: %v\n", err)
		return
	}
	active, _ := loadActiveStyleGuide()
	if len(guides) == 0 {
		fmt.Println("No style guides imported yet.")
		return
	}
	for _, guide := range guides {
		marker := " "
		if guide.ID == active.ID {
			marker = "*"
		}
		fmt.Printf("%s %s (%s) — %d entries\n", marker, guide.Name, guide.ID, len(guide.Entries))
	}
}

func runStyleGuideCurrent() {
	guide, err := loadActiveStyleGuide()
	if err != nil {
		fmt.Printf("No active style guide: %v\n", err)
		return
	}
	selection, _ := loadStyleGuideSelection()
	fmt.Printf("Active style guide: %s (%s), %d entries, %d optional XML rules, enabled=%t\n", guide.Name, guide.ID, len(guide.Entries), guide.RuleCount, selection.Enabled)
}

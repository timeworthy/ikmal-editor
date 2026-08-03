package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestNormalizeStyleGuideEntriesFromHTML(t *testing.T) {
	entries := normalizeStyleGuideEntries(`<html><head>ignored</head><body><nav>Site navigation</nav><main><h1>Voice</h1><ul><li>Use active voice</li><li>Avoid nominalizations</li><li>Use active voice</li></ul></main></body></html>`, "html")
	if len(entries) != 3 {
		t.Fatalf("expected heading plus two unique entries, got %+v", entries)
	}
	if entries[1].Kind != "prefer" || entries[2].Kind != "avoid" {
		t.Fatalf("unexpected entry kinds: %+v", entries)
	}
}

func TestNormalizeStyleGuideEntriesGroupsWrappedPDFParagraphs(t *testing.T) {
	entries := normalizeStyleGuideEntries("Style Guide 2\n\nterm name\ncontinued explanation\n\nUse join instead of access.\n\n3/3\n", "pdf")
	if len(entries) != 2 {
		t.Fatalf("expected two paragraph entries, got %+v", entries)
	}
	if entries[0].Text != "term name continued explanation" || entries[1].Text != "Use join instead of access." {
		t.Fatalf("PDF paragraphs were not grouped correctly: %+v", entries)
	}
}

func TestImportStyleGuideURLCrawlsGuideScope(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("IKMAL_STYLE_GUIDE_DIR", dir)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "text/html; charset=utf-8")
		switch request.URL.Path {
		case "/guide/welcome":
			_, _ = writer.Write([]byte(`<html><head><title>Test Company Guide | Docs</title></head><body><nav>Navigation</nav><main><h1>Welcome</h1><p>Use plain language.</p><a href="/guide/part">Part two</a><a href="/outside">Do not crawl</a></main></body></html>`))
		case "/guide/part":
			_, _ = writer.Write([]byte(`<html><body><main><h1>Terminology</h1><p>Prefer video game over videogame.</p></main></body></html>`))
		case "/outside":
			_, _ = writer.Write([]byte(`<html><body><main><p>Outside content</p></main></body></html>`))
		default:
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()

	guide, err := importStyleGuide(server.URL + "/guide/welcome")
	if err != nil {
		t.Fatal(err)
	}
	if guide.Name != "Test Company Guide" || guide.ID != "test-company-guide" {
		t.Fatalf("unexpected URL guide metadata: %+v", guide)
	}
	if len(guide.Entries) != 5 {
		t.Fatalf("expected merged root and linked-page entries, got %+v", guide.Entries)
	}
	review, err := os.ReadFile(guide.ReviewPath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(review), ",2,Terminology,") || strings.Contains(string(review), "Outside content") {
		t.Fatalf("URL crawl review has wrong scope or page attribution: %s", review)
	}
}

func TestStyleGuideImportAndSelection(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("IKMAL_STYLE_GUIDE_DIR", dir)
	source := filepath.Join(dir, "company_style.md")
	if err := os.WriteFile(source, []byte("- Prefer plain language\n- Avoid jargon\n"), 0644); err != nil {
		t.Fatal(err)
	}
	guide, err := importStyleGuide(source)
	if err != nil {
		t.Fatal(err)
	}
	if guide.ID != "company-style" || len(guide.Entries) != 2 {
		t.Fatalf("unexpected imported guide: %+v", guide)
	}
	if err := saveStyleGuide(guide); err != nil {
		t.Fatal(err)
	}
	if err := selectStyleGuide(guide.ID); err != nil {
		t.Fatal(err)
	}
	active, err := loadActiveStyleGuide()
	if err != nil {
		t.Fatal(err)
	}
	if active.ID != guide.ID {
		t.Fatalf("expected active guide %q, got %q", guide.ID, active.ID)
	}
	review, err := os.ReadFile(guide.ReviewPath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(review), "source_text") || !strings.Contains(string(review), ",draft,") {
		t.Fatalf("expected human-review CSV, got %s", review)
	}
}

func TestDeterministicStyleGuidePair(t *testing.T) {
	match, replacement := deterministicStyleGuidePair("Use United States instead of U.S.")
	if match != "U.S." || replacement != "United States" {
		t.Fatalf("unexpected extracted pair: match=%q replacement=%q", match, replacement)
	}
	match, replacement = deterministicStyleGuidePair("Avoid videogame; use video game")
	if match != "videogame" || replacement != "video game" {
		t.Fatalf("unexpected avoid/use pair: match=%q replacement=%q", match, replacement)
	}
	if match, replacement = deterministicStyleGuidePair("Use media rather than video when referring to more than one type of media."); match != "" || replacement != "" {
		t.Fatalf("long contextual guidance should not become a replacement: match=%q replacement=%q", match, replacement)
	}
	if match, replacement = deterministicStyleGuidePair("Avoid using download to refer to what iCloud does; instead, use an alternative such as keep up to date."); match != "" || replacement != "" {
		t.Fatalf("complex guidance should not become a replacement: match=%q replacement=%q", match, replacement)
	}
}

func TestDeterministicStyleGuideCandidatesPreserveContext(t *testing.T) {
	candidate := deterministicStyleGuideCandidate("Use join instead of access.")
	if candidate.Kind != "hard_replacement" || candidate.Match != "access" || candidate.Replacement != "join" {
		t.Fatalf("unexpected hard candidate: %+v", candidate)
	}
	candidate = deterministicStyleGuideCandidate("Don't use blacklist. Instead, use denylist, allowlist, or blocklist.")
	if candidate.Kind != "contextual_preference" || candidate.Match != "blacklist" || strings.Join(candidate.Alternatives, "|") != "denylist|allowlist|blocklist" {
		t.Fatalf("unexpected contextual candidate: %+v", candidate)
	}
	candidate = deterministicStyleGuideCandidate("Avoid visually impaired.")
	if candidate.Kind != "do_not_equate" || candidate.Match != "visually impaired" || len(candidate.Alternatives) != 0 {
		t.Fatalf("unexpected do-not-equate candidate: %+v", candidate)
	}
}

func TestStyleGuideEnrichmentExportAndMerge(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("IKMAL_STYLE_GUIDE_DIR", dir)
	source := filepath.Join(dir, "editorial-guide.md")
	if err := os.WriteFile(source, []byte("Avoid blacklist. Instead, use denylist, allowlist, or blocklist.\nUse plain language.\n"), 0644); err != nil {
		t.Fatal(err)
	}
	guide, err := importStyleGuide(source)
	if err != nil {
		t.Fatal(err)
	}
	inputPath, promptPath, err := exportStyleGuideEnrichment(guide.ID)
	if err != nil {
		t.Fatal(err)
	}
	input, err := os.ReadFile(inputPath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(input), `"source_text":"Avoid blacklist.`) {
		t.Fatalf("enrichment input omitted source text: %s", input)
	}
	if prompt, err := os.ReadFile(promptPath); err != nil || !strings.Contains(string(prompt), "do_not_equate") {
		t.Fatalf("enrichment prompt missing schema: %v %s", err, prompt)
	}
	enrichmentPath := filepath.Join(dir, "model-output.jsonl")
	enrichment := `{"id":"entry-001","kind":"contextual_preference","confidence":"high","match":"blacklist","replacement":"denylist","alternatives":["denylist","allowlist","blocklist"],"scope":"terminology","notes":"The guide provides explicit alternatives."}` + "\n"
	if err := os.WriteFile(enrichmentPath, []byte(enrichment), 0644); err != nil {
		t.Fatal(err)
	}
	mergedPath, err := mergeStyleGuideEnrichment(guide.ID, enrichmentPath)
	if err != nil {
		t.Fatal(err)
	}
	merged, err := os.ReadFile(mergedPath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(merged), "denylist | allowlist | blocklist") || !strings.Contains(string(merged), "LLM-enriched proposal") || !strings.Contains(string(merged), ",draft,") {
		t.Fatalf("merged enrichment was not preserved as a draft review row: %s", merged)
	}
}

func TestLintStyleGuideReviewFindsUnsafeActivation(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("IKMAL_STYLE_GUIDE_DIR", dir)
	source := filepath.Join(dir, "lint-guide.md")
	if err := os.WriteFile(source, []byte("Prefer video game over videogame.\n"), 0644); err != nil {
		t.Fatal(err)
	}
	guide, err := importStyleGuide(source)
	if err != nil {
		t.Fatal(err)
	}
	rows, err := loadStyleGuideReviewRows(guide.ID)
	if err != nil {
		t.Fatal(err)
	}
	rows[0].Status = "approved"
	rows[0].Kind = "hard_replacement"
	rows[0].Replacement = rows[0].Match
	if err := writeStyleGuideReviewRows(styleGuideReviewCSVPath(guide.ID), rows); err != nil {
		t.Fatal(err)
	}
	report, err := lintStyleGuideReview(guide.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(report.Errors) == 0 {
		t.Fatalf("expected lint error for self-replacement, report=%+v", report)
	}
}

func TestBuildCombinedStyleGuideRulesKeepsBasePackAndAddsOptionalPack(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("IKMAL_STYLE_GUIDE_DIR", dir)
	source := filepath.Join(dir, "custom-guide.txt")
	if err := os.WriteFile(source, []byte("Prefer short sentences\n"), 0644); err != nil {
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
	if err := setStyleGuideEnabled(true); err != nil {
		t.Fatal(err)
	}
	base := filepath.Join(dir, "base.xml")
	baseXML := `<?xml version="1.0"?><rules lang="en"><category id="BASE" name="Base"><rule id="BASE_RULE" name="Base"><pattern><token>foo</token></pattern><message>foo</message></rule></category></rules>`
	if err := os.WriteFile(base, []byte(baseXML), 0644); err != nil {
		t.Fatal(err)
	}
	combined, enabled, err := buildCombinedStyleGuideRules(base)
	if err != nil {
		t.Fatal(err)
	}
	if !enabled {
		t.Fatal("expected optional style guide rules to be enabled")
	}
	content, err := os.ReadFile(combined)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(content), `id="BASE"`) || !strings.Contains(string(content), `id="IKMAL_STYLE_CUSTOM_GUIDE"`) {
		t.Fatalf("combined rule pack omitted a category: %s", content)
	}
}

func TestStyleGuideRulesCSVCompilesOnlyApprovedHardReplacements(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("IKMAL_STYLE_GUIDE_DIR", dir)
	source := filepath.Join(dir, "company-style.txt")
	if err := os.WriteFile(source, []byte("Use the company terminology\n"), 0644); err != nil {
		t.Fatal(err)
	}
	guide, err := importStyleGuide(source)
	if err != nil {
		t.Fatal(err)
	}
	if err := saveStyleGuide(guide); err != nil {
		t.Fatal(err)
	}
	rules := filepath.Join(dir, "rules.csv")
	content := "id,name,kind,confidence,match,replacement,message,example,correction,status\n" +
		"spell-out-us,Spell out United States,hard_replacement,high,United States,U.S.,,The United States signed the agreement.,The U.S. signed the agreement.,approved\n" +
		"prefer-video-game,Prefer video game,contextual_preference,medium,games,video games,,,,approved\n" +
		"keep-game-distinct,Do not equate game and video game,do_not_equate,high,game,video game,,,,approved\n"
	if err := os.WriteFile(rules, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	installed, compiled, deferred, err := installStyleGuideRules(guide.ID, rules)
	if err != nil {
		t.Fatal(err)
	}
	if compiled != 1 || deferred != 2 || installed.RuleCount != 1 {
		t.Fatalf("unexpected rule counts: compiled=%d deferred=%d guide=%+v", compiled, deferred, installed)
	}
	xml, err := os.ReadFile(installed.RulesPath)
	if err != nil {
		t.Fatal(err)
	}
	text := string(xml)
	if !strings.Contains(text, `id="COMPANY_STYLE_SPELL_OUT_US"`) || !strings.Contains(text, `<suggestion>U.S.</suggestion>`) {
		t.Fatalf("approved hard replacement missing from XML: %s", text)
	}
	if strings.Contains(text, "PREFER_VIDEO_GAME") || strings.Contains(text, "KEEP_GAME_DISTINCT") {
		t.Fatalf("contextual/non-equivalent rules should not compile into XML: %s", text)
	}
}

func TestStyleGuideRulesRejectConflictingApprovedMatches(t *testing.T) {
	content := "id,kind,match,replacement,status\n" +
		"one,hard_replacement,term,first,approved\n" +
		"two,hard_replacement,term,second,approved\n"
	if _, err := parseStyleGuideRulesCSV(content); err == nil || !strings.Contains(err.Error(), "conflicting replacements") {
		t.Fatalf("expected conflicting approved rules to fail validation, got %v", err)
	}
}

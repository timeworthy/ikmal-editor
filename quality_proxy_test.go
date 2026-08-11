package main

import (
	"compress/gzip"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStyleGuideManagementHandlersExposeAndChangeSelection(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("IKMAL_STYLE_GUIDE_DIR", dir)
	guide := styleGuide{
		ID:         "plain-language",
		Name:       "Plain Language",
		SourceType: "markdown",
		ImportedAt: "2026-08-03T00:00:00Z",
		Entries:    []styleGuideEntry{{ID: "one", Text: "Prefer plain language", Kind: "prefer"}},
		RuleCount:  1,
	}
	content, err := json.Marshal(guide)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, guide.ID+".json"), content, 0644); err != nil {
		t.Fatal(err)
	}

	state := callStyleGuideHandler(t, styleGuideStateHandler, "GET", "", "")
	if state.ActiveID != "" || state.Enabled || len(state.Guides) != 1 || state.Guides[0].Active {
		t.Fatalf("unexpected initial style-guide state: %+v", state)
	}
	state = callStyleGuideHandler(t, styleGuideSelectHandler, "POST", `{"id":"plain-language"}`, "")
	if state.ActiveID != "plain-language" || state.Enabled || !state.Guides[0].Active {
		t.Fatalf("unexpected selected style-guide state: %+v", state)
	}
	state = callStyleGuideHandler(t, styleGuideEnabledHandler, "POST", `{"enabled":true}`, "")
	if state.ActiveID != "plain-language" || !state.Enabled {
		t.Fatalf("unexpected enabled style-guide state: %+v", state)
	}
}

func TestStyleGuideStateHandlerReturnsEmptyStateWithoutImport(t *testing.T) {
	t.Setenv("IKMAL_STYLE_GUIDE_DIR", filepath.Join(t.TempDir(), "missing"))
	state := callStyleGuideHandler(t, styleGuideStateHandler, "GET", "", "")
	if state.Guides == nil || len(state.Guides) != 0 || state.ActiveID != "" || state.Enabled {
		t.Fatalf("expected empty style-guide state, got %+v", state)
	}
}

func callStyleGuideHandler(t *testing.T, handler func(http.ResponseWriter, *http.Request), method, body, contentType string) styleGuideStateResponse {
	t.Helper()
	request := httptest.NewRequest(method, "http://127.0.0.1:8096/v1/style-guides", strings.NewReader(body))
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	} else if body != "" {
		request.Header.Set("Content-Type", "application/json")
	}
	response := httptest.NewRecorder()
	handler(response, request)
	if response.Code != 200 {
		t.Fatalf("style-guide handler returned HTTP %d: %s", response.Code, response.Body.String())
	}
	var state styleGuideStateResponse
	if err := json.Unmarshal(response.Body.Bytes(), &state); err != nil {
		t.Fatalf("decode style-guide response: %v", err)
	}
	return state
}

func TestMergeProxyCandidatesPrefersBroaderQualityCorrection(t *testing.T) {
	narrow := qualityProxyCandidate{
		Start:       32,
		End:         35,
		Replacement: "their",
		Confidence:  0.82,
	}
	broad := qualityProxyCandidate{
		Start:       23,
		End:         35,
		Replacement: "produce their",
		Confidence:  0.68,
	}
	merged := mergeProxyCandidates(nil, []qualityProxyCandidate{narrow, broad})
	if len(merged) != 1 || merged[0].Replacement != "produce their" {
		t.Fatalf("expected broader correction to win, got %+v", merged)
	}
}

func TestMergeProxyCandidatesPreservesNativeLanguageToolMatch(t *testing.T) {
	native := qualityProxyCandidate{
		Match:  map[string]any{"message": "native", "offset": 10, "length": 4},
		Start:  10,
		End:    14,
		Native: true,
	}
	quality := qualityProxyCandidate{
		Match:       map[string]any{"message": "quality", "ikmalSource": "quality-sidecar"},
		Start:       10,
		End:         14,
		Replacement: "edit",
		Confidence:  0.99,
	}
	merged := mergeProxyCandidates([]qualityProxyCandidate{native}, []qualityProxyCandidate{quality})
	if len(merged) != 1 || !merged[0].Native {
		t.Fatalf("expected native match to win, got %+v", merged)
	}
	response := proxyMatches(merged)
	if len(response) != 1 {
		t.Fatalf("expected one grouped match, got %+v", response)
	}
	match := response[0].(map[string]any)
	sources, ok := match["ikmalSources"].([]string)
	if !ok || len(sources) != 2 || sources[0] != "LanguageTool" || sources[1] != "quality-sidecar" {
		t.Fatalf("expected source provenance, got %+v", match["ikmalSources"])
	}
	if related, ok := match["ikmalRelated"].([]any); !ok || len(related) != 1 {
		t.Fatalf("expected one related finding, got %+v", match["ikmalRelated"])
	}
}

func TestMergeProxyCandidatesDeduplicatesSameQualityEdit(t *testing.T) {
	first := qualityProxyCandidate{
		Start:       15,
		End:         18,
		Replacement: "their",
		Confidence:  0.82,
	}
	second := qualityProxyCandidate{
		Start:       15,
		End:         18,
		Replacement: "their",
		Confidence:  0.68,
	}
	merged := mergeProxyCandidates(nil, []qualityProxyCandidate{first, second})
	if len(merged) != 1 || merged[0].Confidence != 0.82 {
		t.Fatalf("expected duplicate edit to be deduplicated, got %+v", merged)
	}
}

func TestQualitySuggestionLanguageToolMatchUsesUTF16Offsets(t *testing.T) {
	text := "A 😀 plant produces its own food."
	suggestion := qualitySuggestion{Start: 21, End: 24, Replacement: "their", Category: "pronoun-antecedent", Source: "quality-sidecar"}
	match := qualitySuggestionLanguageToolMatch(text, suggestion)
	if match["offset"] != suggestion.Start || match["length"] != suggestion.End-suggestion.Start {
		t.Fatalf("unexpected offsets: %+v", match)
	}
	if match["ikmalSource"] != suggestion.Source {
		t.Fatalf("expected source metadata before response sanitization: %+v", match)
	}
}

func TestQualitySuggestionLanguageToolMatchCarriesUIMetadata(t *testing.T) {
	suggestion := qualitySuggestion{
		Start:    12,
		End:      22,
		Message:  "The wording repeats nearby.",
		Category: "repetition",
		Source:   "quality-sidecar",
		RelatedOccurrences: []qualityOccurrence{
			{Start: 2, End: 7, Text: "clear"},
			{Start: 12, End: 17, Text: "clear"},
		},
	}
	match := qualitySuggestionLanguageToolMatch("A clear idea is clear.", suggestion)
	if _, ok := match["ikmalRelatedOccurrences"]; !ok {
		t.Fatalf("expected repeat occurrence metadata: %+v", match)
	}
	if match["ikmalSource"] != "quality-sidecar" {
		t.Fatalf("expected source metadata: %+v", match)
	}
}

func TestParseQualityProxyRequestReadsLanguageToolDataEnvelope(t *testing.T) {
	form := url.Values{
		"data":     {`{"text":"Plants produce their own food."}`},
		"language": {"en-US"},
	}
	request := httptest.NewRequest("POST", "http://127.0.0.1:8096/v2/check", strings.NewReader(form.Encode()))
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8")
	values, err := parseQualityProxyRequest(request)
	if err != nil {
		t.Fatal(err)
	}
	if values.Get("text") != "Plants produce their own food." {
		t.Fatalf("expected data envelope text, got %q", values.Get("text"))
	}
}

func TestForwardHandlerPreservesPOSTBodyAndHeaders(t *testing.T) {
	backendHandler := http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/v2/check" {
			http.Error(writer, "unexpected path", http.StatusBadRequest)
			return
		}
		if request.Header.Get("Content-Type") != "application/x-www-form-urlencoded" {
			http.Error(writer, "unexpected content type", http.StatusBadRequest)
			return
		}
		body, err := io.ReadAll(request.Body)
		if err != nil {
			http.Error(writer, "could not read body", http.StatusBadRequest)
			return
		}
		if string(body) != "text=Plants+produce+food.&language=en-US" && string(body) != "language=en-US&text=Plants+produce+food." {
			http.Error(writer, "unexpected body", http.StatusBadRequest)
			return
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"matches":[]}`))
	})
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	backend := &http.Server{Handler: backendHandler}
	go func() { _ = backend.Serve(listener) }()
	defer backend.Close()

	proxy := qualityProxy{languageToolURL: "http://" + listener.Addr().String() + "/v2/check", client: &http.Client{}}
	request := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:8096/v2/check", strings.NewReader("text=Plants+produce+food.&language=en-US"))
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response := httptest.NewRecorder()
	proxy.forwardHandler(response, request)
	if response.Code != http.StatusOK || response.Body.String() != `{"matches":[]}` {
		t.Fatalf("unexpected proxy response: HTTP %d %s", response.Code, response.Body.String())
	}
}

// A browser sends Accept-Encoding: gzip. If the proxy forwards it, Go stops
// decompressing transparently and this handler copies compressed bytes through
// under the upstream's Content-Type, so the caller receives a gzip blob
// labelled application/json.
func TestForwardHandlerReturnsReadableJSONWhenTheClientAcceptsGzip(t *testing.T) {
	backendHandler := http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if encoding := request.Header.Get("Accept-Encoding"); strings.Contains(encoding, "br") {
			http.Error(writer, "proxy forwarded the client's Accept-Encoding", http.StatusBadRequest)
			return
		}
		if request.Header.Get("Connection") != "" {
			http.Error(writer, "proxy forwarded a hop-by-hop header", http.StatusBadRequest)
			return
		}
		writer.Header().Set("Content-Type", "application/json")
		gzipWriter := gzip.NewWriter(writer)
		writer.Header().Set("Content-Encoding", "gzip")
		defer gzipWriter.Close()
		_, _ = gzipWriter.Write([]byte(`{"languages":[]}`))
	})
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	backend := &http.Server{Handler: backendHandler}
	go func() { _ = backend.Serve(listener) }()
	defer backend.Close()

	proxy := qualityProxy{languageToolURL: "http://" + listener.Addr().String() + "/v2/check", client: &http.Client{}}
	request := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8096/v2/languages", nil)
	request.Header.Set("Accept-Encoding", "gzip, deflate, br")
	request.Header.Set("Connection", "keep-alive")
	response := httptest.NewRecorder()
	proxy.forwardHandler(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("unexpected proxy status: HTTP %d %s", response.Code, response.Body.String())
	}
	if body := response.Body.String(); body != `{"languages":[]}` {
		t.Fatalf("expected decompressed JSON, got %q", body)
	}
}

// The proxy forwards only the headers a spell check needs. A deny-list passed
// the calling page's credentials straight through to whatever
// IKMAL_LANGUAGETOOL_URL happened to point at.
func TestForwardHandlerSendsOnlyTheHeadersACheckNeeds(t *testing.T) {
	seen := make(chan http.Header, 1)
	backendHandler := http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		seen <- request.Header.Clone()
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"languages":[]}`))
	})
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	backend := &http.Server{Handler: backendHandler}
	go func() { _ = backend.Serve(listener) }()
	defer backend.Close()

	proxy := qualityProxy{languageToolURL: "http://" + listener.Addr().String() + "/v2/check", client: &http.Client{}}
	request := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8096/v2/languages", nil)
	request.Header.Set("Cookie", "session=secret")
	request.Header.Set("Authorization", "Bearer secret")
	request.Header.Set("Referer", "https://mail.example.com/inbox/42")
	request.Header.Set("Origin", "https://mail.example.com")
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Accept-Language", "en-GB")
	response := httptest.NewRecorder()
	proxy.forwardHandler(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("unexpected proxy status: HTTP %d %s", response.Code, response.Body.String())
	}
	forwarded := <-seen
	for _, header := range []string{"Cookie", "Authorization", "Referer", "Origin"} {
		if value := forwarded.Get(header); value != "" {
			t.Errorf("proxy leaked %s upstream: %q", header, value)
		}
	}
	if forwarded.Get("Accept") != "application/json" {
		t.Errorf("expected Accept to be forwarded, got %q", forwarded.Get("Accept"))
	}
	if forwarded.Get("Accept-Language") != "en-GB" {
		t.Errorf("expected Accept-Language to be forwarded, got %q", forwarded.Get("Accept-Language"))
	}
}

func TestWarnIfNotLoopbackOnlyWarnsWhenReachable(t *testing.T) {
	capture := func(host string) string {
		read, write, err := os.Pipe()
		if err != nil {
			t.Fatal(err)
		}
		original := os.Stdout
		os.Stdout = write
		warnIfNotLoopback("quality proxy", host)
		write.Close()
		os.Stdout = original
		output, _ := io.ReadAll(read)
		return string(output)
	}

	// Every spelling of "this machine only" must stay quiet, or the warning
	// becomes noise people learn to ignore.
	for _, host := range []string{"127.0.0.1", "localhost", "LOCALHOST", "::1", "[::1]"} {
		if got := capture(host); got != "" {
			t.Fatalf("expected no warning for %q, got %q", host, got)
		}
	}
	for _, host := range []string{"0.0.0.0", "192.168.1.10", "::"} {
		got := capture(host)
		if !strings.Contains(got, "WARNING") || !strings.Contains(got, host) {
			t.Fatalf("expected a warning naming %q, got %q", host, got)
		}
		if !strings.Contains(got, "IKMAL_BIND_HOST=127.0.0.1") {
			t.Fatalf("the warning must say how to undo it, got %q", got)
		}
	}
}

// A body past the limit is something the caller can act on by sending less
// text, but only if it is told that is what happened. LanguageTool answers its
// own length limit with 413, so this proxy has to agree with it.
func TestOversizedRequestBodiesAnswer413(t *testing.T) {
	oversized := strings.Repeat("x", 2<<20)
	proxy := qualityProxy{languageToolURL: "http://127.0.0.1:1/v2/check", client: &http.Client{}}

	form := url.Values{"text": {oversized}}
	check := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:8096/v2/check", strings.NewReader(form.Encode()))
	check.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response := httptest.NewRecorder()
	proxy.checkHandler(response, check)
	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected 413 from the check handler, got HTTP %d %s", response.Code, response.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("the 413 body must stay JSON: %v", err)
	}
	if payload["limit"] == nil || !strings.Contains(payload["error"].(string), "limit") {
		t.Fatalf("a 413 must name the limit it enforced, got %v", payload)
	}

	forward := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:8096/v2/words", strings.NewReader(oversized))
	forward.Header.Set("Content-Type", "application/json")
	forwarded := httptest.NewRecorder()
	proxy.forwardHandler(forwarded, forward)
	if forwarded.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected 413 from the forward handler, got HTTP %d %s", forwarded.Code, forwarded.Body.String())
	}

	// A body within the limit that is simply malformed is still a 400: the
	// caller cannot fix it by sending less.
	malformed := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:8096/v2/check", strings.NewReader("%zz"))
	malformed.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	badRequest := httptest.NewRecorder()
	proxy.checkHandler(badRequest, malformed)
	if badRequest.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for a malformed body, got HTTP %d %s", badRequest.Code, badRequest.Body.String())
	}
}

// A check that lost LanguageTool but kept the quality sidecar returns fewer
// findings than it should. Reporting that as an ordinary result would show a
// document with grammar checking switched off as a clean one.
func TestCheckHandlerReportsALostLanguageToolEngine(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		http.Error(writer, "Error: Your text exceeds this server's limit of 20000 characters", http.StatusRequestEntityTooLarge)
	}))
	defer backend.Close()
	quality := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"backend":"quality","suggestions":[],"antecedents":[]}`))
	}))
	defer quality.Close()

	proxy := qualityProxy{
		languageToolURL: backend.URL + "/v2/check",
		qualityURL:      quality.URL + "/v1/analyze",
		client:          &http.Client{},
	}
	request := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:8096/v2/check", strings.NewReader("text=Plants+produce+food.&language=en-US"))
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response := httptest.NewRecorder()
	proxy.checkHandler(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("a partial check still returns its findings, got HTTP %d", response.Code)
	}
	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	warning, ok := payload["ikmalLanguageToolWarning"].(string)
	if !ok || !strings.Contains(warning, "413") {
		t.Fatalf("expected the LanguageTool failure to be reported, got %v", payload)
	}
	// Hosts render this one rather than parsing the warning above.
	degraded, ok := payload["ikmalDegradedChecks"].([]any)
	if !ok || len(degraded) != 1 || degraded[0] != "grammar" {
		t.Fatalf("expected the missing engine to be named for hosts, got %v", payload["ikmalDegradedChecks"])
	}
	if _, unexpected := payload["ikmalQualityWarning"]; unexpected {
		t.Fatalf("the quality sidecar answered, so it must not be reported as failed: %v", payload)
	}
}

// A LanguageTool plugin pointed at this proxy uses more of the API than
// /v2/check. Answering the rest with a 404 of our own makes the proxy look like
// a broken LanguageTool rather than a compatible one, so everything the proxy
// has no opinion about reaches the upstream server.
func TestProxyForwardsTheWholeLanguageToolSurfaceButKeepsCheck(t *testing.T) {
	var upstreamPaths []string
	backend := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		upstreamPaths = append(upstreamPaths, request.URL.Path)
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"forwarded":true}`))
	}))
	defer backend.Close()

	proxy := qualityProxy{languageToolURL: backend.URL + "/v2/check", client: backend.Client()}
	mux := proxy.routes()

	// /v2/words is the personal dictionary; /v2/languages was already forwarded
	// and must stay that way now that the subtree covers it.
	for _, path := range []string{"/v2/languages", "/v2/words"} {
		response := httptest.NewRecorder()
		mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8096"+path, nil))
		if response.Code != http.StatusOK || response.Body.String() != `{"forwarded":true}` {
			t.Fatalf("%s: HTTP %d %s, want it forwarded upstream", path, response.Code, response.Body.String())
		}
	}
	if len(upstreamPaths) != 2 || upstreamPaths[0] != "/v2/languages" || upstreamPaths[1] != "/v2/words" {
		t.Fatalf("upstream saw %v", upstreamPaths)
	}

	// The subtree must not swallow the one path this proxy answers itself. The
	// check handler rejects a GET; the forwarder would have passed it upstream.
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8096/v2/check", nil))
	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("/v2/check should reach the check handler, got HTTP %d", response.Code)
	}
	if len(upstreamPaths) != 2 {
		t.Fatalf("/v2/check was forwarded instead of handled: %v", upstreamPaths)
	}
}

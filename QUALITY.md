# ikmal writing quality layer

This document describes the planned machine-learning layer that will sit beside
LanguageTool. It is deliberately separate from the XML rule pack: XML rules
are deterministic and fast, while a model is useful for context-sensitive
edits and broader writing-quality judgments.

## Current state

- LanguageTool performs the base spelling, grammar, and POS analysis.
- `rules/style_conciseness.xml` contains the embedded ikmal rules.
- Agreement rules now cover the sentence-initial pattern in which a short
  parenthetical separates a subject from its verb.
- The pronoun rule reports the detected pronoun and antecedent when that
  relationship is locally unambiguous.
- The repetition category detects nearby non-noun content-word repeats and
  includes a first word-family echo rule for `different` / `difference`.
- The passive-voice category tracks high-confidence passive constructions,
  including agent-marked, perfect, and modal forms. It reports the passage for
  review but does not generate an automatic rewrite because changing voice can
  change emphasis or meaning.
- An opt-in Go sidecar is available with `--quality-server`; it currently
  returns deterministic suggestions and antecedent links on port `8098`.
- An optional Transformers.js/ONNX adapter is included. It loads a local
  grammatical-error-correction model and the Go sidecar merges its suggestions
  when `IKMAL_TRANSFORMER_URL` is set.
- The earlier `quality_transformer.py` adapter remains as a Python/PyTorch
  fallback, but is no longer the preferred managed path.

FastText, which the launcher downloads, is a language-identification model. It
is not a writing-quality or grammatical-error-correction transformer.

## Packaging the model runtime

The preferred adapter follows the JavaScript runtime path used by ikmal editor:
Transformers.js provides the model API and uses ONNX Runtime underneath. This
keeps the ikmal release statically buildable while making Node.js/npm and the
model explicit, managed downloads rather than hidden Go build dependencies.

There are three realistic packaging choices:

| Approach | Result | Tradeoff |
| --- | --- | --- |
| Transformers.js + ONNX | Separate local Node process | Reuses ikmal editor’s runtime pattern; easy quantized model downloads |
| ONNX + native runtime | Go gateway with a native inference backend | Requires CGO/native libraries and per-OS/architecture packaging |
| Pure-Go inference runtime | One statically linked binary | Requires adopting or building a sufficiently capable Go transformer runtime |

The immediate recommended path is Transformers.js plus quantized ONNX, not a
second native runtime. Transformers.js uses ONNX Runtime and supports the
`text2text-generation` pipeline needed by T5-style correction models. A direct
ONNX Runtime C API backend remains a later optimization if Node/WASM profiling
shows it is necessary.

That still leaves two assets to package or provision: the exported model and
its tokenizer data. Embedding those assets in the executable is possible, but
it produces a much larger binary and requires a separate build artifact for
each supported platform. The current release pipeline intentionally remains
pure Go and static; the ONNX backend should therefore be introduced as a
separate native build target rather than silently changing every release.

The Go gateway already keeps inference behind a backend interface. Once the
correction corpus and latency target justify native packaging, the HTTP call
can be replaced by an `ONNXTransformerBackend` without changing the client
contract.

In the meantime, `./ikmal-editor --quality-setup` provides the managed path:
it installs the JavaScript adapter into `~/.ikmal-editor/quality`, caches the
quantized model into `~/.ikmal-editor/models`, and preloads it when Node.js and
npm are available. The download is opt-in; normal LanguageTool startup does
not incur it.

## Target architecture

```text
client
  |
  +--> LanguageTool: deterministic matches and POS/chunk data
  `--> quality sidecar :8098
          |-- deterministic repetition and antecedent analysis
          |-- optional transformer adapter :8099
          `-- gateway merger with overlap suppression
```

The first model should be a grammatical-error-correction model, not a general
chat model. An edit-oriented transformer such as the approach described by
[GECToR](https://arxiv.org/abs/2005.12592) is a useful starting point because
it can propose token edits while preserving the writer's meaning. A
full-sentence generator can be added later for explicit rewrite requests. The
included prototype uses [Xenova/t5-base-grammar-correction](https://huggingface.co/Xenova/t5-base-grammar-correction),
which provides ONNX weights and a Transformers.js text-to-text example.

Requests are processed as local correction chunks rather than whole documents.
The prototype groups complete sentences up to 80 words by default and splits a
long sentence at the word boundary. The model input is capped at 128 tokens by
default (`IKMAL_TRANSFORMER_MAX_CHUNK_WORDS` and
`IKMAL_TRANSFORMER_MAX_INPUT_TOKENS` can tune this). This is intentionally
well below a page-sized request and keeps the model focused on nearby context;
the returned offsets are translated back to the original document.

The model should initially run as a local sidecar. This keeps the Java
LanguageTool process stable, makes model upgrades independent, and preserves
the project's local-only privacy guarantee. The launcher will eventually own
the sidecar lifecycle and health check, just as it owns the LanguageTool
process today.

## Proposed analyzer contract

The model sidecar should accept a document and return point edits, rather than
returning a replacement document only:

```json
{
  "text": "Plants, by comparison, produces its own food.",
  "language": "en-US",
  "mode": "check"
}
```

```json
{
  "suggestions": [
    {
      "start": 23,
      "end": 31,
      "replacement": "produce",
      "category": "agreement",
      "message": "A plural subject usually takes a plural verb.",
      "confidence": 0.98,
      "source": "quality-model"
    }
  ]
}
```

The gateway can then translate these into LanguageTool-compatible `matches`,
merge them with XML results, and suppress overlapping lower-confidence edits.
Full-sentence rewrites should be a separate opt-in endpoint because they do
not map cleanly to an inline `/v2/check` replacement.

To run the prototype locally:

```bash
./ikmal-editor --quality-setup
```

Start the Go sidecar; it will launch the managed adapter automatically:

```bash
./ikmal-editor --quality-server --quality-transformer
```

The transformer flag starts the managed adapter as a child process, waits for
its health endpoint, wires the gateway to it, and stops it when the gateway
exits. An explicitly supplied `IKMAL_TRANSFORMER_URL` still takes precedence
for using an externally managed adapter.

## Browser extension integration

The official LanguageTool browser extensions speak the LanguageTool `/v2/check`
contract, so they cannot consume the quality sidecar's native `/v1/analyze`
response directly. The compatibility proxy combines both services:

```bash
./ikmal-editor --quality-proxy --quality-transformer
```

Configure the extension's local server as:

```text
http://127.0.0.1:8096/v2
```

The proxy leaves LanguageTool's native matches intact, converts quality
suggestions into LanguageTool matches, removes identical edits, and resolves
overlapping edits by preserving native LanguageTool matches and preferring a
broader quality correction when it subsumes a narrower one.

Model loading is lazy inside the adapter, while `--quality-setup` preloads it
so download failures are visible during setup. The Go gateway falls back to
deterministic results if the adapter is unavailable or times out.

Offsets returned by the sidecar are UTF-16 code-unit offsets, matching
LanguageTool's API convention so they can be merged without shifting text
around emoji or other supplementary Unicode characters.

The proxy also adds optional `ikmalRelatedOccurrences` metadata to repeat and
word-family echo matches, plus `ikmalAntecedent` on an agreement match and
`ikmalAntecedents` at the response level. LanguageTool clients can ignore these
unknown fields, while richer clients can highlight every occurrence and draw
pronoun-to-antecedent links.

## Antecedent tracking

Antecedent tracking is a separate signal from pronoun agreement:

1. Extract noun phrases and pronouns from LanguageTool's POS/chunk output.
2. Generate candidate antecedents using sentence position, grammatical role,
   number, person, and grammatical plausibility.
3. Rank candidates using a contextual model when the local rules are
   ambiguous.
4. Attach the selected antecedent span and confidence to the suggestion.
5. Report ambiguity instead of inventing a connection when confidence is low.

The same text-level component should own paragraph-wide repetition tracking.
It can compare normalized lemmas and derivational families within a configurable
token window, while using POS and coreference confidence to avoid flagging
necessary noun repetition.

For example, the current local rule can safely explain `its` as referring to
`Plants` in the sentence above. A later coreference component should handle
cases such as “The report was sent to the editor after it was revised,” where
the relationship requires wider context and may genuinely be ambiguous.

The initial regression corpus is stored in [`quality-regression.json`](quality-regression.json)
and can be run against the transformer gateway with `node quality_eval.mjs`.
The deterministic local expectations in the same corpus run with
`go test -run TestQualityRegressionFixtures ./...`. It contains required
corrections, clean/ambiguous examples, repeat/echo cases, and an approved
style-guide case so false positives are measured before model suggestions are
enabled by default.

## Delivery phases

1. Keep the XML rules as the high-precision baseline and build a small
   agreement/coreference regression corpus.
2. Add a model-agnostic local sidecar contract and run model suggestions in
   shadow mode, without displaying them.
3. Measure precision, recall, latency, memory, and meaning-preservation on the
   corpus; enable only high-confidence edit categories.
4. Add the gateway merger and expose accepted model matches through the same
   client integration.
5. Add explicit rewrite and tone modes separately from inline correction.

This is an independent implementation inspired by the capabilities Grammarly
advertises. It does not embed or call Grammarly Pro's private models or
endpoints.

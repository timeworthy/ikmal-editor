# ikmal writing quality layer

How ikmal produces the findings that are not LanguageTool's.

## Current state

Everything ikmal contributes beyond LanguageTool is deterministic Go, served by
`--quality-server` and merged by the proxy: repetition and word-family echoes,
pronoun-antecedent tracking, passive voice with an explicit by-agent, homophone
confusions, missing words, sentence structure, and the rules an imported style
guide adds.

There is no model. There was one — an optional Transformers.js/ONNX adapter
running `Xenova/t5-base-grammar-correction` behind `--quality-setup` — and it
was deleted. Three things decided that:

- **It only ever added a second opinion on grammar.** It emitted a single
  category with a single generic message, contributed no antecedents, and
  explicitly discarded the sentence rewrites the small T5 model sometimes
  produced. None of the product's distinctive findings came from it.
- **Its weights were non-commercial**, and the only way to change the model was
  an environment variable. A product for people who are not lawyers cannot ask
  them to evaluate CC BY-NC-SA 4.0, and cannot answer for them whether their use
  qualifies.
- **No permissive drop-in exists.** Checked against the Hugging Face API rather
  than assumed: the popular ONNX grammar models are non-commercial
  (`vennify/t5-base-grammar-correction`, `grammarly/coedit-*`) or ambiguously
  dual-licensed (`pszemraj/grammar-synthesis-small`), and the clean Apache-2.0
  option, `Unbabel/gec-t5_small`, has no ONNX build at all — so the swap this
  repo used to recommend could never have worked. Several ONNX conversions of
  CoEdIT claim Apache-2.0 while their base model is CC BY-NC; adopting one would
  have looked like a fix and been worse.

## If a model comes back

The core already carries the design for what a model should have been doing —
`RewordRequest` with a `scope` and an `intent`, `RewordCandidate` with a
`meaningRisk`, and a safety gate that demands confirmation for high-risk edits.
Nothing has ever produced one. That is the rewriting feature, and it was never
what the grammar-correction adapter did.

Two routes, in order of preference:

1. **Deterministic first.** Passive voice with an explicit by-agent is a
   well-defined transform — "the results were reviewed by the team" becomes "the
   team reviewed the results" — and the server already detects the agent. It
   fires only where the answer is recoverable, which is exactly where a model
   would also be guessing least.
2. **A permissively licensed model, converted by us.** `Unbabel/gec-t5_small` is
   Apache-2.0, which permits redistribution of a conversion. Publishing a
   transformers.js-layout ONNX build is real work and needs somewhere to publish
   it, but it is the only route to a default model with no licence question.

An instruction-tuned editor (CoEdIT-class) is what `intent` was designed for and
is the obvious fit for rewriting — and every such model found so far is
non-commercial, so that route walks back into the wall this deletion removed.

## Everything below describes the removed adapter

Kept as the record of a design that shipped and was withdrawn, not as a
description of the product. `--quality-setup`, `IKMAL_TRANSFORMER_URL` and the
Transformers.js adapter no longer exist; read the two sections above for what
runs today. Anything here is a starting point for the second route in "If a
model comes back", not a description of anything installed.

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

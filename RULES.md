# ikmal editor Conciseness & Plain English Rules

Complete rule reference catalog for [`rules/style_conciseness.xml`](rules/style_conciseness.xml), compiled from [PlainLanguage.gov](https://www.plainlanguage.gov), Vale, proselint, and write-good.

The rule pack also includes an ikmal agreement category for high-confidence
subject–verb and pronoun–antecedent checks. The planned contextual model and
antecedent tracker are documented in [`QUALITY.md`](QUALITY.md).

The repetition category currently includes:

- nearby repeated non-noun content words within a sentence;
- `different` / `difference` echoes within a 30-token window;
- noun repetition intentionally excluded from the generic content-word rule.

Paragraph-wide tracking of arbitrary repeated words requires the text-level
quality sidecar, because a LanguageTool XML token rule cannot reliably compare
an arbitrary word across sentence boundaries.

The quality sidecar also reports a `passive-voice` finding for high-confidence
passive constructions such as `was reviewed by ...`, `has been updated`, and
`can be enabled`. These findings have no automatic replacement: passive voice
is sometimes the clearest choice, and an active rewrite needs the surrounding
meaning and intended emphasis.

A past participle that is not on the known-participle list is only treated as
passive when an explicit by-agent is present. The `-ed` suffix alone cannot
separate a passive from a copular adjective, so `the door is closed` and
`I am used to the noise` are deliberately not flagged.

---

## Rule Categories

### 1. Wordiness & Filler Phrases (`WORDINESS`)

| Rule ID | Verbose Phrase | Concise Suggestion | Source / Standard |
|---|---|---|---|
| `IKMAL_WORDINESS_IN_ORDER_TO` | *"in order to"* | **"to"** | PlainLanguage.gov |
| `IKMAL_WORDINESS_DUE_TO_FACT` | *"due to the fact that"* | **"because"** | PlainLanguage.gov / Vale |
| `IKMAL_WORDINESS_AT_THIS_POINT` | *"at this point in time"* | **"now"** | proselint |
| `IKMAL_WORDINESS_FOR_THE_PURPOSE_OF` | *"for the purpose of"* | **"to"** | PlainLanguage.gov |
| `IKMAL_WORDINESS_IN_THE_EVENT_THAT` | *"in the event that"* | **"if"** | PlainLanguage.gov |
| `IKMAL_WORDINESS_A_LARGE_NUMBER_OF` | *"a large number of"* | **"many"** | PlainLanguage.gov |
| `IKMAL_WORDINESS_IN_CLOSE_PROXIMITY` | *"in close proximity to"* | **"near"** | proselint |
| `IKMAL_WORDINESS_WITH_THE_EXCEPTION_OF` | *"with the exception of"* | **"except"** | PlainLanguage.gov |
| `IKMAL_WORDINESS_PRIOR_TO` | *"prior to"* | **"before"** | PlainLanguage.gov |
| `IKMAL_WORDINESS_SUBSEQUENT_TO` | *"subsequent to"* | **"after"** | PlainLanguage.gov |
| `IKMAL_WORDINESS_AT_PRESENT` | *"at the present time"* | **"now"** | proselint |
| `IKMAL_WORDINESS_UNTIL_SUCH_TIME` | *"until such time as"* | **"until"** | PlainLanguage.gov |

---

### 2. Nominalizations / Verbification (`NOMINALIZATION`)

| Rule ID | Verbose Phrase | Concise Suggestion | Source / Standard |
|---|---|---|---|
| `IKMAL_NOMINALIZATION_MAKE_A_DECISION` | *"make a decision"* | **"decide"** | PlainLanguage.gov |
| `IKMAL_NOMINALIZATION_CONDUCT_INVESTIGATION` | *"conduct an investigation into"* | **"investigate"** | PlainLanguage.gov |
| `IKMAL_NOMINALIZATION_GIVE_CONSIDERATION` | *"give consideration to"* | **"consider"** | PlainLanguage.gov |
| `IKMAL_NOMINALIZATION_CAME_TO_CONCLUSION` | *"came to a conclusion that"* | **"concluded that"** | PlainLanguage.gov |
| `IKMAL_NOMINALIZATION_MAKE_AN_ADJUSTMENT` | *"make an adjustment to"* | **"adjust"** | PlainLanguage.gov |
| `IKMAL_NOMINALIZATION_PROVIDE_ASSISTANCE` | *"provide assistance to"* | **"help"** | PlainLanguage.gov |
| `IKMAL_NOMINALIZATION_TAKE_INTO_CONSIDERATION` | *"take into consideration"* | **"consider"** | PlainLanguage.gov |

---

### 3. Redundant Modifiers (`REDUNDANCY`)

| Rule ID | Verbose Phrase | Concise Suggestion | Source / Standard |
|---|---|---|---|
| `IKMAL_REDUNDANCY_ADVANCE_PLANNING` | *"advance planning"* | **"planning"** | proselint |
| `IKMAL_REDUNDANCY_END_RESULT` | *"end result"* | **"result"** | proselint |
| `IKMAL_REDUNDANCY_BASIC_FUNDAMENTALS` | *"basic fundamentals"* | **"fundamentals"** | proselint |
| `IKMAL_REDUNDANCY_FREE_GIFT` | *"free gift"* | **"gift"** | proselint |
| `IKMAL_REDUNDANCY_PAST_HISTORY` | *"past history"* | **"history"** | proselint |
| `IKMAL_REDUNDANCY_SUM_TOTAL` | *"sum total"* | **"total"** | proselint |

---

### 4. Clarity & Plain English (`CLARITY`)

| Rule ID | Verbose Word | Concise Suggestion | Source / Standard |
|---|---|---|---|
| `IKMAL_CLARITY_HAS_CAPABILITY` | *"has the capability to"* | **"can"** | PlainLanguage.gov |
| `IKMAL_CLARITY_UTILIZE` | *"utilize"* | **"use"** | PlainLanguage.gov |
| `IKMAL_CLARITY_ASSISTANCE` | *"assistance"* | **"help"** | PlainLanguage.gov |
| `IKMAL_CLARITY_COMMENCE` | *"commence"* | **"start"** | PlainLanguage.gov |
| `IKMAL_CLARITY_TERMINATE` | *"terminate"* | **"end"** | PlainLanguage.gov |

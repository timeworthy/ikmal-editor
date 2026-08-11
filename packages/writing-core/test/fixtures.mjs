export const documentFixture = {
  id: 'draft-1',
  text: 'The results is ready. The draft draft is concise. It are useful.',
  revision: 3,
  language: { requested: 'en-US', automatic: false, variant: 'en-US' },
  source: 'browser-extension',
};

export const rawCheckFixture = {
  matches: [
    {
      offset: 4,
      length: 7,
      message: 'Use the singular form.',
      replacements: [{ value: 'result' }],
      rule: { id: 'BE_PLURAL', issueType: 'grammar', description: 'Subject-verb agreement' },
      ikmalSource: 'LanguageTool',
      ikmalConfidence: 0.98,
    },
    {
      offset: 31,
      length: 5,
      message: 'This word is repeated.',
      replacements: [],
      rule: { id: 'IKMAL_REPETITION', issueType: 'repetition' },
      ikmalSource: 'quality-sidecar',
      ikmalConfidence: 0.74,
      ikmalRelatedOccurrences: [{ offset: 26, length: 5 }],
    },
    {
      offset: 52,
      length: 2,
      message: 'The pronoun may not agree with its antecedent.',
      replacements: [{ value: 'is' }],
      rule: { id: 'IKMAL_PRONOUN_ANTECEDENT', issueType: 'pronoun-antecedent' },
      ikmalSource: 'quality-sidecar',
      ikmalConfidence: 0.91,
      ikmalAntecedent: {
        pronoun: 'It',
        start: 52,
        end: 54,
        antecedent: 'draft',
        antecedentStart: 26,
        antecedentEnd: 31,
        confidence: 0.91,
      },
    },
    // Invalid and out-of-bounds results must not escape normalization.
    { offset: -1, length: 2, message: 'invalid' },
    { offset: 999, length: 4, message: 'stale range' },
  ],
  ikmalAntecedents: [{
    pronoun: 'It',
    start: 52,
    end: 54,
    antecedent: 'draft',
    antecedentStart: 26,
    antecedentEnd: 31,
    confidence: 0.91,
  }],
  detectedLanguage: { code: 'en-US', confidence: 0.99, dominant: true },
};

export const rewordText = 'The report is very long at https://ikmal.example.';

export const rawRewordMatch = {
  offset: 0,
  length: rewordText.length,
  message: 'This sentence may be more concise.',
  kind: 'rewording',
  rule: { id: 'IKMAL_WORDINESS', issueType: 'wordiness' },
  ikmalSource: 'transformer',
  rewordCandidates: [{
    id: 'shorten-sentence',
    replacementText: 'The report is long at https://ikmal.example.',
    edits: [{ offset: rewordText.indexOf('very '), length: 5, replacementText: '' }],
    rationale: 'Removes an unnecessary intensifier while preserving the link.',
    source: 'transformer',
    confidence: 0.88,
    meaningRisk: 'low',
    scope: 'sentence',
    diff: { removed: 'very ', added: '' },
  }],
};

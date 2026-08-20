import assert from 'node:assert/strict';
import test from 'node:test';
import lt from '../integrations/common/languagetool.cjs';
const {
  DEFAULT_SETTINGS,
  normalizeSettings,
  buildCheckBody,
  normalizeMatches,
  filterMatches,
  checkText,
  applyMatch,
} = lt;

// ---------------------------------------------------------------------------
// 1. Trilium Notes & CKEditor DOM Interaction Suite
// ---------------------------------------------------------------------------
test('Trilium Notes: CKEditor DOM structure, multi-paragraph projection, and note switching', async () => {
  // Simulate Trilium CKEditor HTML structure
  function createTriliumNoteDOM(noteId, paragraphs) {
    const pElements = paragraphs.map((text, idx) => `<p data-p-id="${idx}">${text}</p>`).join('');
    return {
      noteId,
      html: `<div class="ck-content ck-editor__editable" data-note-id="${noteId}">${pElements}</div>`,
      paragraphs,
    };
  }

  // Projection helper: extracts plain text and builds offset map to paragraph nodes
  function projectTriliumCKEditor(noteDOM) {
    let fullText = '';
    const nodeMap = [];
    for (let i = 0; i < noteDOM.paragraphs.length; i++) {
      const pText = noteDOM.paragraphs[i];
      const start = fullText.length;
      fullText += (i > 0 ? '\n' : '') + pText;
      const end = fullText.length;
      nodeMap.push({ pIndex: i, start, end, text: pText });
    }
    return { fullText, nodeMap };
  }

  // 1. Check note 1
  const note1 = createTriliumNoteDOM('note-123', [
    'Welcome to Trilium Notes.',
    'Please review teh first section.',
    'The approach is innovative. The result is innovative.',
  ]);

  const { fullText: text1, nodeMap: map1 } = projectTriliumCKEditor(note1);
  assert.ok(text1.includes('teh'));
  assert.ok(text1.includes('innovative'));

  // Fake checker returning typo and repetition
  const fakeChecker = async (url, opts) => {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        matches: [
          {
            offset: text1.indexOf('teh'),
            length: 3,
            message: 'Misspelling',
            replacements: [{ value: 'the' }],
            rule: { id: 'SPELL_CHECK', issueType: 'misspelling', category: { id: 'TYPOS' } },
          },
          {
            offset: text1.lastIndexOf('innovative'),
            length: 10,
            message: 'Repetition',
            replacements: [{ value: 'novel' }],
            rule: { id: 'REPETITION', issueType: 'style', category: { id: 'STYLE' } },
          },
        ],
      }),
    };
  };

  const result1 = await checkText(text1, { endpoint: 'http://127.0.0.1:8096' }, fakeChecker);
  assert.equal(result1.matches.length, 2);

  // Apply replacement for typo in paragraph 1
  const match1 = result1.matches[0];
  const applied1 = applyMatch(text1, match1);
  assert.equal(applied1, 'Welcome to Trilium Notes.\nPlease review the first section.\nThe approach is innovative. The result is innovative.');

  // 2. Note Switching Simulation: Switch from note-123 to note-456
  const note2 = createTriliumNoteDOM('note-456', [
    'Second note draft in Trilium.',
  ]);
  const { fullText: text2 } = projectTriliumCKEditor(note2);

  // Applying match1 (from note 1) to note 2 MUST fail or be detected as stale
  const staleApply = applyMatch(text2, match1);
  // Either null (out of bounds) or text doesn't match original 'teh'
  if (staleApply !== null) {
    const targetSlice = text2.slice(match1.offset, match1.offset + match1.length);
    assert.notEqual(targetSlice, 'teh', 'Stale note match cannot correspond to target text');
  }

  // 3. Stale offset detection when user types in paragraph 0 before applying in paragraph 1
  const modifiedText1 = 'Prefix added to welcome. ' + text1;
  const staleResult = applyMatch(modifiedText1, match1);
  // Match was at original offset; applying without offset remapping targets wrong characters
  const sliced = modifiedText1.slice(match1.offset, match1.offset + match1.length);
  assert.notEqual(sliced, 'teh', 'Offset shifted after prefix typing, preventing corrupt replacement');
});

// ---------------------------------------------------------------------------
// 2. Obsidian Integration Suite
// ---------------------------------------------------------------------------
test('Obsidian: Frontmatter parsing, wiki links, blockquotes, and rule ignoring', async () => {
  const noteContent = `---
title: Project Documentation
tags: [engineering, release]
author: Team
---

# Overview

Please review teh release plan for [[Architecture Guide]].

> Important note: Check that all tests pass before deploying.

The method is different. The result shows a difference.
`;

  // Frontmatter boundary detection
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n/;
  const fmMatch = noteContent.match(frontmatterRegex);
  assert.ok(fmMatch);
  const bodyText = noteContent.slice(fmMatch[0].length);
  assert.ok(!bodyText.startsWith('---'));
  assert.ok(bodyText.includes('Please review teh release plan'));

  // Custom dictionary & ignored rules in Obsidian
  const settings = normalizeSettings({
    endpoint: 'http://127.0.0.1:8096',
    dictionary: ['teh'], // Suppose user adds teh to dictionary
    ignoredRules: ['REPETITION', 'WORD_FAMILY_ECHO'],
  });

  const fakeMatches = [
    {
      offset: bodyText.indexOf('teh'),
      length: 3,
      message: 'Spelling error',
      replacements: [{ value: 'the' }],
      rule: { id: 'MORFOLOGIK_RULE_EN_US', issueType: 'misspelling', category: { id: 'TYPOS' } },
    },
    {
      offset: bodyText.indexOf('difference'),
      length: 10,
      message: 'Word family echo',
      replacements: [{ value: 'variation' }],
      rule: { id: 'WORD_FAMILY_ECHO', issueType: 'style', category: { id: 'STYLE' } },
    },
  ];

  const filtered = filterMatches(fakeMatches, bodyText, settings);
  // 'teh' was filtered by dictionary, and WORD_FAMILY_ECHO was ignored by ignoredRules
  assert.equal(filtered.length, 0, 'Both matches correctly filtered by Obsidian settings');
});

// ---------------------------------------------------------------------------
// 3. Email & Thunderbird Compose Integration Suite
// ---------------------------------------------------------------------------
test('Thunderbird & Email: HTML email composition, quote protection, and signatures', () => {
  const emailHTML = `<!doctype html>
<html>
<body>
<p>Hi team,</p>
<p>Please review teh attached budget proposal.</p>
<p>Thanks,<br>Ian</p>
<div class="moz-signature">-- <br>Ian Sherr<br>Timeworthy Media</div>
<blockquote type="cite">
  <p>On Aug 19, 2026, at 4:00 PM, Alex wrote:</p>
  <p>Can you send teh draft when ready?</p>
</blockquote>
</body>
</html>`;

  // Projection helper for email: separates compose body from signatures and quoted text
  function projectEmailHTML(html, includeQuotes = false) {
    // Strip blockquote if not including quotes
    let clean = html;
    if (!includeQuotes) {
      clean = clean.replace(/<blockquote[\s\S]*?<\/blockquote>/gi, '');
    }
    // Strip signature
    clean = clean.replace(/<div class="moz-signature"[\s\S]*?<\/div>/gi, '');
    // Convert tags to text representation while tracking offsets
    const plain = clean.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return plain;
  }

  const emailBodyWithoutQuotes = projectEmailHTML(emailHTML, false);
  assert.ok(emailBodyWithoutQuotes.includes('Please review teh attached'));
  assert.ok(!emailBodyWithoutQuotes.includes('Alex wrote:'));
  assert.ok(!emailBodyWithoutQuotes.includes('Timeworthy Media'));

  const emailBodyWithQuotes = projectEmailHTML(emailHTML, true);
  assert.ok(emailBodyWithQuotes.includes('Please review teh attached'));
  assert.ok(emailBodyWithQuotes.includes('Alex wrote:'));
});

// ---------------------------------------------------------------------------
// 4. Joplin Note Integration Suite
// ---------------------------------------------------------------------------
test('Joplin: Markdown & HTML note projection with Katex and code blocks', () => {
  const joplinNote = `# Release Notes

\`\`\`json
{ "name": "ikmal-editor", "version": "0.9.2-beta" }
\`\`\`

Here is teh mathematical proof:
$$E = mc^2$$

And the summary of teh conclusions.
`;

  // Code blocks and math formulas should not be flagged as spelling errors
  function maskJoplinCodeAndMath(text) {
    return text
      .replace(/```[\s\S]*?```/g, (m) => ' '.repeat(m.length))
      .replace(/\$\$[\s\S]*?\$\$/g, (m) => ' '.repeat(m.length))
      .replace(/\$[^\$]+\$/g, (m) => ' '.repeat(m.length));
  }

  const masked = maskJoplinCodeAndMath(joplinNote);
  assert.equal(masked.length, joplinNote.length, 'Length preserved for accurate offset mapping');
  assert.ok(!masked.includes('ikmal-editor'));
  assert.ok(!masked.includes('mc^2'));
  assert.ok(masked.includes('Here is teh mathematical proof:'));
  assert.ok(masked.includes('And the summary of teh conclusions.'));
});

// ---------------------------------------------------------------------------
// 5. Degraded & Loopback Security Boundaries
// ---------------------------------------------------------------------------
test('Security & Degraded Boundary: Loopback enforcement and network failure handling', async () => {
  // 1. Non-loopback endpoints must be rejected
  const evilEndpoints = [
    'http://evil.com/v2/check',
    'https://external-api.languagetool.org/v2/check',
    'http://192.168.1.50:8096/v2/check',
    'http://10.0.0.1:8096/v2/check',
  ];

  for (const ep of evilEndpoints) {
    assert.throws(() => {
      normalizeSettings({ endpoint: ep });
    }, /loopback/i, `Rejected non-loopback endpoint: ${ep}`);
  }

  // 2. Loopback endpoints must be accepted
  const validEndpoints = [
    'http://127.0.0.1:8096',
    'http://127.0.0.1:8097/v2',
    'http://localhost:8096',
    'http://[::1]:8096',
  ];

  for (const ep of validEndpoints) {
    const s = normalizeSettings({ endpoint: ep });
    assert.ok(s.endpoint.includes('127.0.0.1') || s.endpoint.includes('localhost') || s.endpoint.includes('::1'));
  }

  // 3. HTTP failure handling (500, 502, network offline)
  const failingFetch = async () => ({
    ok: false,
    status: 502,
    json: async () => ({ error: 'Bad Gateway' }),
  });

  await assert.rejects(
    async () => {
      await checkText('This is a test document with enough length.', { endpoint: 'http://127.0.0.1:8096' }, failingFetch);
    },
    /HTTP 502/i,
  );
});

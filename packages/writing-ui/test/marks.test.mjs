import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMarkSpans,
  renderMarks,
  markRoleFor,
  markAlphaFor,
  normalizeAnnotationPreferences,
  applyAnnotationPreferences,
  renderRelationshipCard,
  MARKS_CSS,
} from '../dist/marks.js';

const TEXT = 'The results is wrong and the team said they reviewed it.';

test('a span lands on exactly the words the finding describes', () => {
  const offset = TEXT.indexOf('results is');
  const [span] = buildMarkSpans(TEXT, {
    issues: [{ id: 'a', offset, length: 'results is'.length, category: 'grammar' }],
  });
  assert.equal(span.offset, offset);
  assert.equal(span.length, 'results is'.length);
  assert.equal(TEXT.slice(span.offset, span.offset + span.length), 'results is');
  // The rendered mark has to carry the same words, because an offset that is
  // quietly wrong is invisible in a screenshot and only shows up here.
  const html = renderMarks(TEXT, [span]);
  assert.match(html, /<mark [^>]*>results is<\/mark>/);
});

test('offsets outside the draft are dropped rather than drawn somewhere else', () => {
  const spans = buildMarkSpans(TEXT, {
    issues: [
      { id: 'past-end', offset: TEXT.length + 5, length: 4, category: 'grammar' },
      { id: 'zero', offset: 3, length: 0, category: 'grammar' },
      { id: 'negative', offset: -2, length: 3, category: 'grammar' },
      // A stale result can describe a longer draft than the one on screen. The
      // span is kept but clipped, so it marks real words instead of running off
      // the end and marking nothing.
      { id: 'overlong', offset: TEXT.length - 3, length: 99, category: 'grammar' },
    ],
  });
  assert.deepEqual(spans.map((span) => span.id ?? span.issueId), ['negative', 'overlong']);
  for (const span of spans) {
    assert.ok(span.offset >= 0, 'a span starts before the text');
    assert.ok(span.offset + span.length <= TEXT.length, 'a span runs past the end of the text');
  }
});

test('overlapping findings never produce overlapping marks', () => {
  const spans = buildMarkSpans(TEXT, {
    issues: [
      { id: 'outer', offset: 4, length: 10, category: 'grammar' },
      { id: 'inner', offset: 6, length: 3, category: 'style' },
      { id: 'straddle', offset: 12, length: 8, category: 'style' },
    ],
  });
  for (let i = 1; i < spans.length; i += 1) {
    const previous = spans[i - 1];
    assert.ok(spans[i].offset >= previous.offset + previous.length, 'two marks overlap');
  }
  // Rendering flat text means an overlap would silently duplicate or lose
  // characters. The marks plus the gaps must still reconstruct the draft.
  const html = renderMarks(TEXT, spans);
  const plain = html.replace(/<\/?mark[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  assert.equal(plain, TEXT);
});

test('a repeated word and its other occurrences share one group', () => {
  const [first, second] = buildMarkSpans(TEXT, {
    issues: [{
      id: 'rep',
      offset: TEXT.indexOf('the team'),
      length: 3,
      category: 'repetition',
      relatedRanges: [{ offset: TEXT.indexOf('The'), length: 3 }],
    }],
  });
  assert.equal(first.role, 'related');
  assert.equal(second.role, 'related');
  assert.deepEqual(first.groups, second.groups);
  assert.equal(first.groups[0], 'issue:rep');
});

test('a pronoun link marks both ends, and only the antecedent is drawn as one', () => {
  const spans = buildMarkSpans(TEXT, {
    relationships: [{
      id: 'r1',
      kind: 'antecedent',
      ranges: [
        { offset: TEXT.indexOf('they'), length: 4 },
        { offset: TEXT.indexOf('the team'), length: 8 },
      ],
    }],
  });
  assert.equal(spans.length, 2);
  const byRelation = Object.fromEntries(spans.map((span) => [span.relation, span]));
  assert.equal(TEXT.slice(byRelation.primary.offset, byRelation.primary.offset + byRelation.primary.length), 'they');
  assert.equal(TEXT.slice(byRelation.antecedent.offset, byRelation.antecedent.offset + byRelation.antecedent.length), 'the team');
  assert.ok(spans.every((span) => span.role === 'relationship'));
  assert.ok(spans.every((span) => span.groups.includes('relationship:r1')));
});

test('a finding on the same words as a relationship stays actionable', () => {
  const offset = TEXT.indexOf('they');
  const spans = buildMarkSpans(TEXT, {
    issues: [{ id: 'i1', offset, length: 4, category: 'grammar', relationshipId: 'r1' }],
    relationships: [{ id: 'r1', kind: 'antecedent', ranges: [{ offset, length: 4 }, { offset: 0, length: 3 }] }],
  });
  // Looked up by offset, not by position: spans come back in document order, so
  // index 0 is the antecedent near the start of the sentence.
  const span = spans.find((candidate) => candidate.offset === offset);
  // One mark, not two stacked: it carries the finding so the card can offer a
  // correction, and both groups so hovering still lights the antecedent.
  assert.equal(span.issueId, 'i1');
  assert.equal(span.relation, 'primary');
  assert.ok(span.groups.includes('issue:i1'));
  assert.ok(span.groups.includes('relationship:r1'));
});

test('an ignored finding leaves no mark behind', () => {
  const issues = [
    { id: 'a', offset: 4, length: 7, category: 'grammar' },
    { id: 'b', offset: 15, length: 5, category: 'style' },
  ];
  assert.equal(buildMarkSpans(TEXT, { issues }).length, 2);
  assert.deepEqual(buildMarkSpans(TEXT, { issues, ignored: new Set(['a']) }).map((s) => s.issueId), ['b']);
  // Hosts hold this as a plain array as often as a Set.
  assert.deepEqual(buildMarkSpans(TEXT, { issues, ignored: ['b'] }).map((s) => s.issueId), ['a']);
});

test('every category the core can emit maps to a role that has a colour', () => {
  const CORE_CATEGORIES = [
    'spelling', 'grammar', 'structure', 'missing-word', 'homophone', 'style', 'clarity',
    'repetition', 'word-family', 'passive-voice', 'wordiness', 'plain-english', 'conciseness',
    'relationship', 'quality', 'languagetool', 'other',
  ];
  const ROLES = ['grammar', 'style', 'language', 'relationship', 'related'];
  for (const category of CORE_CATEGORIES) {
    const role = markRoleFor({ category });
    assert.ok(ROLES.includes(role), `${category} has no role`);
    // A role with no --mark-ink rule draws with an unresolved custom property,
    // which paints nothing at all.
    assert.match(MARKS_CSS, new RegExp(`\\[data-role="${role}"\\]`), `${role} has no ink`);
  }
  // A category from a newer server than this build is still drawn.
  assert.equal(markRoleFor({ category: 'invented-later' }), 'language');
  assert.equal(markRoleFor({ category: 'invented-later', source: 'style-guide' }), 'style');
});

test('nothing in the overlay is focusable, because the overlay is hidden', () => {
  // The layer is a second copy of the draft and the host hides it from
  // assistive tech. A focusable element inside a hidden subtree is reachable by
  // keyboard and invisible to the reader announcing it — which is what the
  // legacy surface did. Findings are reached through the card instead.
  const html = renderMarks(TEXT, buildMarkSpans(TEXT, {
    issues: [{ id: 'a', offset: 4, length: 7, category: 'grammar' }],
  }));
  assert.match(html, /<mark /);
  assert.doesNotMatch(html, /tabindex/);
  assert.doesNotMatch(html, /\bhref=|<a\b|<button\b/);
});

test('marks escape the draft rather than letting it become markup', () => {
  const hostile = 'a <script>alert(1)</script> b';
  const spans = buildMarkSpans(hostile, { issues: [{ id: 'x', offset: 2, length: 8, category: 'grammar' }] });
  const html = renderMarks(hostile, spans);
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /&lt;script/);
  // And an id that tries to close the attribute it sits in. The test is whether
  // it becomes an attribute, not whether the characters appear: they appear
  // either way, and asserting their absence would pass on an escape that had
  // merely renamed the handler.
  const injected = renderMarks('abcd', buildMarkSpans('abcd', {
    issues: [{ id: '" onload="alert(1)', offset: 0, length: 2, category: 'grammar' }],
  }));
  assert.doesNotMatch(injected, /onload="/, 'an id closed its attribute and opened a handler');
  assert.match(injected, /onload=&quot;/);
});

test('a draft ending in a newline keeps its last line', () => {
  // `pre-wrap` drops the final break, which shortens the overlay by a line and
  // draws every mark near the bottom of a scrolled draft one line high.
  const html = renderMarks('one\ntwo\n', []);
  assert.match(html, /\n​$/);
  assert.doesNotMatch(renderMarks('one\ntwo', []), /​/);
});

test('a pronoun link explains itself and offers nothing to apply', () => {
  const html = renderRelationshipCard({ pronoun: 'they', antecedent: 'the <team>', note: 'Why this is linked.' });
  assert.match(html, /they/);
  assert.match(html, /the &lt;team&gt;/);
  assert.match(html, /Why this is linked\./);
  // There is no correction to make here, so a card offering one would be a
  // control that does nothing — the defect this whole change exists to remove.
  assert.doesNotMatch(html, /data-action="(apply|ignore|dictionary)"/);
  assert.match(html, /data-action="close"/);
  assert.match(html, /role="dialog"/);
  // Composed from the system, not restyled: the gallery smoke fails on any
  // class outside cnt- and writing-.
  for (const name of html.match(/class="([^"]+)"/g) || []) {
    for (const token of name.slice(7, -1).split(/\s+/)) {
      assert.ok(/^(cnt|writing)-/.test(token), `${token} is outside the design system`);
    }
  }
});

test('intensity never dims a mark below the contrast it was tuned for', () => {
  // The default has to land on the floor the token palettes were measured
  // against; below it the marks stop clearing 3:1 on some surfaces.
  assert.ok(markAlphaFor(55).alpha >= 0.75, 'the default intensity is below the measured floor');
  assert.ok(markAlphaFor(0).alpha > 0, 'the quietest setting erases the marks');
  assert.ok(markAlphaFor(100).alpha <= 1);
  // Monotonic, or the control argues with its own label.
  for (let i = 5; i <= 100; i += 5) assert.ok(markAlphaFor(i).alpha > markAlphaFor(i - 5).alpha);
});

test('preferences are normalised to what the tokens actually define', () => {
  assert.deepEqual(normalizeAnnotationPreferences({}), { style: 'squiggle', palette: 'balanced', intensity: 55 });
  assert.deepEqual(normalizeAnnotationPreferences(null), { style: 'squiggle', palette: 'balanced', intensity: 55 });
  // A palette with no token block would leave the marks with no ink at all,
  // so an unknown one falls back rather than being trusted.
  assert.equal(normalizeAnnotationPreferences({ palette: 'neon' }).palette, 'balanced');
  assert.equal(normalizeAnnotationPreferences({ style: 'wavy' }).style, 'squiggle');
  assert.equal(normalizeAnnotationPreferences({ intensity: 1000 }).intensity, 100);
  assert.equal(normalizeAnnotationPreferences({ intensity: -5 }).intensity, 0);
  assert.equal(normalizeAnnotationPreferences({ intensity: 62 }).intensity, 60);
  assert.equal(normalizeAnnotationPreferences({ intensity: 'nonsense' }).intensity, 55);
});

test('applying preferences writes what the stylesheet selects on', () => {
  const properties = new Map();
  const root = { dataset: {}, style: { setProperty: (name, value) => properties.set(name, value) } };
  const applied = applyAnnotationPreferences(root, { style: 'dash', palette: 'contrast', intensity: 100 });
  assert.deepEqual(applied, { style: 'dash', palette: 'contrast', intensity: 100 });
  assert.equal(root.dataset.annotationStyle, 'dash');
  assert.equal(root.dataset.annotationPalette, 'contrast');
  assert.equal(Number(properties.get('--mark-alpha')), 1);
  // The attributes it sets must be the ones the stylesheets actually match on.
  assert.match(MARKS_CSS, /\[data-annotation-style="dash"\]/);
  assert.ok(Number(properties.get('--mark-fill-alpha')) > 0);
});

test('the mark layer carries no colour of its own', () => {
  // Every colour is a token, so a palette is one edit in the design system
  // rather than one per composite.
  assert.doesNotMatch(MARKS_CSS, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(MARKS_CSS, /\brgba?\(\s*\d/);
});

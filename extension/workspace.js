const params = new URLSearchParams(location.search);
const token = params.get('token');
const meta = document.querySelector('#workspace-meta');
const state = document.querySelector('#state');
const issues = document.querySelector('#issues');
const refreshButton = document.querySelector('#refresh');
let snapshot = null;

function send(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => resolve(response || { ok: false }));
  });
}

// Two envelopes stack here. background.js resolves every handler as
// { ok: true, data }, so its ok only reports that the worker answered; the
// content script's own { ok, error } arrives nested inside data. Checking the
// outer one alone reads a rejected edit as a success.
function unwrap(response) {
  if (!response?.ok) return { ok: false, error: response?.error };
  const inner = response.data;
  if (inner && typeof inner === 'object' && 'ok' in inner) {
    return { ok: Boolean(inner.ok), error: inner.error, data: inner.data ?? inner };
  }
  return { ok: true, data: inner };
}

function sourceOf(match) {
  const sources = [
    ...(Array.isArray(match?.ikmalSources) ? match.ikmalSources : []),
    match?.ikmalSource,
  ].map((value) => String(value || '').toLowerCase());
  const rule = String(match?.rule?.id || '').toLowerCase();
  if (sources.some((value) => value.includes('style')) || rule.includes('style')) return 'ikmal style';
  if (sources.some((value) => value.includes('quality')) || rule.startsWith('ikmal_')) return 'ikmal quality';
  return 'ikmal editor';
}

function contextFor(text, match) {
  const start = Math.max(0, Number(match.offset) - 34);
  const end = Math.min(text.length, Number(match.offset) + Number(match.length) + 34);
  return text.slice(start, end).replace(/\n/g, '↵');
}

function render() {
  issues.textContent = '';
  if (!snapshot) return;
  const matches = Array.isArray(snapshot.matches) ? snapshot.matches : [];
  const mode = snapshot.focus?.mode === 'paused' ? 'Paused' : snapshot.focus?.mode === 'zen' ? 'Zen' : 'Automatic';
  meta.textContent = `${matches.length} issue${matches.length === 1 ? '' : 's'} · ${mode}`;
  if (!matches.length) {
    state.textContent = 'No issues were returned for the active editor.';
    issues.innerHTML = '<div class="empty">Your current text is clean at this checking level.</div>';
    return;
  }
  state.innerHTML = `<span class="count">${matches.length}</span> issue${matches.length === 1 ? '' : 's'} found in the active editor.`;
  matches.forEach((match, index) => {
    const item = document.createElement('article');
    item.className = 'issue';
    const body = document.createElement('div');
    const kind = document.createElement('p');
    kind.className = 'issue-kind';
    kind.textContent = sourceOf(match);
    const message = document.createElement('p');
    message.className = 'issue-message';
    message.textContent = match.message || 'Suggestion';
    const context = document.createElement('p');
    context.className = 'issue-context';
    context.textContent = contextFor(snapshot.text || '', match);
    body.append(kind, message, context);
    const actions = document.createElement('div');
    actions.className = 'issue-actions';
    (match.replacements || []).slice(0, 6).forEach((replacement) => {
      const button = document.createElement('button');
      button.className = 'replacement';
      button.type = 'button';
      button.textContent = replacement.value;
      button.addEventListener('click', async () => {
        button.disabled = true;
        const result = unwrap(await send({
          type: 'applyWorkspaceIssue',
          tabID: snapshot.tabID,
          index,
          // Sent back so the content script can confirm the match at this index
          // is still the one shown here before it rewrites anything.
          offset: match.offset,
          length: match.length,
          replacement: replacement.value,
        }));
        // Not loadSnapshot(): that is the one-shot bootstrap and it removes its
        // own storage token, so calling it again finds nothing and reports the
        // editor as gone. Re-read from the source tab the way Refresh does.
        if (result.ok) await refreshSnapshot();
        else {
          state.textContent = result.error || 'That issue is no longer available.';
          state.classList.add('is-error');
          button.disabled = false;
        }
      });
      actions.appendChild(button);
    });
    item.append(body, actions);
    issues.appendChild(item);
  });
}

async function loadSnapshot() {
  if (!token) {
    state.textContent = 'This issue workspace link is missing its active editor.';
    state.classList.add('is-error');
    return;
  }
  const response = await chrome.storage.local.get(token);
  snapshot = response[token] || null;
  if (!snapshot) {
    state.textContent = 'The active editor is no longer available. Open this workspace again from the indicator.';
    state.classList.add('is-error');
    return;
  }
  await chrome.storage.local.remove(token);
  state.classList.remove('is-error');
  render();
}

async function refreshSnapshot() {
  if (!snapshot?.tabID) return false;
  const result = unwrap(await send({ type: 'getWorkspaceIssues', tabID: snapshot.tabID }));
  if (!result.ok) {
    state.textContent = result.error || 'The active editor is no longer available.';
    state.classList.add('is-error');
    return false;
  }
  snapshot = { ...snapshot, ...result.data };
  state.classList.remove('is-error');
  render();
  return true;
}

refreshButton.addEventListener('click', refreshSnapshot);

loadSnapshot();

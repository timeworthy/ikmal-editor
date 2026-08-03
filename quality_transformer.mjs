#!/usr/bin/env node

import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const PORT = Number(process.env.IKMAL_TRANSFORMER_PORT || 8099);
const MAX_BODY = 1 << 20;
const MAX_CHUNK_WORDS = Number(process.env.IKMAL_TRANSFORMER_MAX_CHUNK_WORDS || 80);
const MODEL_ID = process.env.IKMAL_TRANSFORMER_MODEL || 'Xenova/t5-base-grammar-correction';
const MODEL_CACHE_DIR =
  process.env.IKMAL_TRANSFORMER_CACHE_DIR || path.join(os.homedir(), '.ikmal-editor', 'models');
// This model publishes q4 ONNX files, but not q4f16 files. q4 is also the
// quantization mode used by ikmal's WASM Transformers.js tier.
const DTYPE = process.env.IKMAL_TRANSFORMER_DTYPE || 'q4';

let transformers = null;
let generatorPromise = null;
let loadError = null;

async function loadGenerator() {
  if (generatorPromise) return generatorPromise;
  generatorPromise = (async () => {
    transformers = await import('@huggingface/transformers');
    transformers.env.cacheDir = MODEL_CACHE_DIR;
    transformers.env.localModelPath = MODEL_CACHE_DIR;
    return transformers.pipeline('text2text-generation', MODEL_ID, {
      dtype: DTYPE,
      progress_callback: (event) => {
        if (event?.status === 'progress') {
          process.stdout.write(`\r${event.file || 'model'} ${Math.round(event.progress || 0)}%`);
        }
      },
    });
  })().catch((error) => {
    loadError = `${error?.name || 'Error'}: ${error?.message || error}`;
    generatorPromise = null;
    throw error;
  });
  return generatorPromise;
}

function tokenize(text) {
  const pattern = /\w+|[^\w\s]/gu;
  return [...text.matchAll(pattern)].map((match) => ({
    value: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function detokenize(parts) {
  return parts
    .join(' ')
    .replace(/\s+([,.!?;:%])/g, '$1')
    .replace(/\s+(['’])/g, '$1')
    .replace(/(['’])\s+/g, '$1');
}

function wordCount(text) {
  return [...text.matchAll(/[\p{L}\p{N}_]+/gu)].length;
}

function sentenceRanges(text) {
  const ranges = [];
  let start = 0;
  for (const token of tokenize(text)) {
    if ('.!?'.includes(token.value)) {
      ranges.push([start, token.end]);
      start = token.end;
    }
  }
  if (start < text.length) ranges.push([start, text.length]);
  return ranges;
}

function splitLongRange(text, start, end) {
  const words = [...text.slice(start, end).matchAll(/[\p{L}\p{N}_]+/gu)].map((match) => ({
    start: start + match.index,
    end: start + match.index + match[0].length,
  }));
  if (!words.length) return [[start, end]];
  const ranges = [];
  let chunkStart = start;
  for (let index = MAX_CHUNK_WORDS; index <= words.length; index += MAX_CHUNK_WORDS) {
    ranges.push([chunkStart, words[index - 1].end]);
    chunkStart = index < words.length ? words[index].start : words[index - 1].end;
  }
  if (chunkStart < end) ranges.push([chunkStart, end]);
  return ranges;
}

function correctionChunks(text) {
  const ranges = [];
  let pending = null;
  let pendingWords = 0;
  const flush = () => {
    if (pending) ranges.push(pending);
    pending = null;
    pendingWords = 0;
  };

  for (const [start, end] of sentenceRanges(text)) {
    const count = wordCount(text.slice(start, end));
    if (count > MAX_CHUNK_WORDS) {
      flush();
      ranges.push(...splitLongRange(text, start, end));
      continue;
    }
    if (pending && pendingWords + count > MAX_CHUNK_WORDS) flush();
    if (!pending) pending = [start, end];
    else pending[1] = end;
    pendingWords += count;
  }
  flush();
  return ranges;
}

function diffSuggestions(text, corrected, baseOffset) {
  const source = tokenize(text);
  const target = tokenize(corrected).map((token) => token.value);
  const sourceValues = source.map((token) => token.value);
  const rows = sourceValues.length + 1;
  const cols = target.length + 1;
  const lcs = Array.from({ length: rows }, () => new Uint16Array(cols));
  for (let i = sourceValues.length - 1; i >= 0; i -= 1) {
    for (let j = target.length - 1; j >= 0; j -= 1) {
      lcs[i][j] = sourceValues[i] === target[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const suggestions = [];
  let i = 0;
  let j = 0;
  while (i < sourceValues.length || j < target.length) {
    if (i < sourceValues.length && j < target.length && sourceValues[i] === target[j]) {
      i += 1;
      j += 1;
      continue;
    }
    const sourceStart = i;
    const targetStart = j;
    while (i < sourceValues.length || j < target.length) {
      if (i < sourceValues.length && j < target.length && sourceValues[i] === target[j]) break;
      if (j < target.length && (i === sourceValues.length || lcs[i][j + 1] >= lcs[i + 1][j])) j += 1;
      else i += 1;
    }
    const start = sourceStart < source.length ? source[sourceStart].start : text.length;
    const end = sourceStart < source.length ? source[Math.max(sourceStart, i) - 1].end : start;
    const replacement = detokenize(target.slice(targetStart, j));
    // Keep this adapter focused on grammar corrections. The small T5 model
    // occasionally rewrites a sentence boundary (for example, joining two
    // sentences with "and the"); that is a style rewrite, not a safe grammar
    // suggestion for this endpoint.
    if (/[.!?]/.test(text.slice(start, end)) && !/[.!?]/.test(replacement)) continue;
    suggestions.push({
      start: baseOffset + start,
      end: baseOffset + end,
      replacement,
      category: 'transformer-grammar',
      message: 'The local grammar model suggests this correction.',
      confidence: 0.68,
      source: 'transformer-js-onnx',
    });
  }
  return suggestions;
}

async function analyze(payload) {
  if (!payload || typeof payload.text !== 'string' || !payload.text.trim()) {
    throw new Error('text is required');
  }
  const generator = await loadGenerator();
  const suggestions = [];
  for (const [start, end] of correctionChunks(payload.text)) {
    const output = await generator(payload.text.slice(start, end), {
      max_new_tokens: 128,
      num_beams: 4,
      do_sample: false,
    });
    const corrected = output?.[0]?.generated_text || payload.text.slice(start, end);
    suggestions.push(...diffSuggestions(payload.text.slice(start, end), corrected, start));
  }
  return { backend: 'transformer-js-onnx', suggestions, antecedents: [] };
}

function sendJSON(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  response.end(body);
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    sendJSON(response, 200, {
      status: loadError ? 'degraded' : 'ok',
      backend: 'transformer-js-onnx',
      model: MODEL_ID,
      dtype: DTYPE,
      cacheDir: MODEL_CACHE_DIR,
      loaded: Boolean(generatorPromise && !loadError),
      error: loadError,
    });
    return;
  }
  if (request.method !== 'POST' || request.url !== '/v1/analyze') {
    sendJSON(response, 404, { error: 'not found' });
    return;
  }
  let body = '';
  request.on('data', (chunk) => {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY) request.destroy();
  });
  request.on('end', async () => {
    try {
      sendJSON(response, 200, await analyze(JSON.parse(body)));
    } catch (error) {
      sendJSON(response, 503, { error: error?.message || String(error) });
    }
  });
});

if (process.argv.includes('--preload')) {
  loadGenerator()
    .then(() => {
      console.log(`Quality model ready: ${MODEL_ID}`);
      process.exit(0);
    })
    .catch(() => process.exit(1));
} else {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`ikmal transformer adapter listening on http://127.0.0.1:${PORT}`);
  });
}

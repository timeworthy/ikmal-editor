/** Versioned WebExtension runtime message boundary. No Chrome APIs belong here. */

export const EXTENSION_CONTRACT_VERSION = 'ikmal-extension-v1';

export type ExtensionMessageType =
  | 'check'
  | 'health'
  | 'settings'
  | 'focus'
  | 'focusDurations'
  | 'setFocus'
  | 'openSettings'
  | 'openWorkspace'
  | 'getWorkspaceIssues'
  | 'applyWorkspaceIssue'
  | 'updateSettings'
  | 'addDictionary'
  | 'settings-changed'
  | 'getIssues'
  | 'applyIssue';

export interface CheckMessage {
  type: 'check';
  text: string;
  language?: string;
  languageHint?: string;
  host?: string;
  selection?: boolean;
  // Where the writing is happening, and which field it belongs to. A caret
  // asks for a check around it rather than over the whole field; the id keeps
  // one field's findings apart from another's in the same frame.
  caret?: number;
  fieldID?: string;
  // 'document' asks for the whole field even when a caret is supplied, for the
  // pass that restores findings a chunk cannot see.
  scope?: 'document';
}

export interface SetFocusMessage {
  type: 'setFocus';
  mode: 'active' | 'paused' | 'zen';
  duration?: string;
}

export interface ApplyWorkspaceIssueMessage {
  type: 'applyWorkspaceIssue';
  tabID: number;
  index: number;
  offset: number;
  length: number;
  replacement: string;
}

export interface ApplyIssueMessage {
  type: 'applyIssue';
  index: number;
  offset: number;
  length: number;
  replacement: string;
}

export type ExtensionMessage =
  | CheckMessage
  | SetFocusMessage
  | ApplyWorkspaceIssueMessage
  | ApplyIssueMessage
  | { type: 'health' | 'settings' | 'focus' | 'focusDurations' | 'openSettings' | 'openWorkspace' | 'getIssues' }
  | { type: 'getWorkspaceIssues'; tabID: number }
  | { type: 'updateSettings'; patch: Record<string, unknown> }
  | { type: 'addDictionary'; word: string }
  | { type: 'settings-changed' };

export type ExtensionResponse<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function integerValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
}

function positiveRange(object: Record<string, unknown>): { offset: number; length: number } | null {
  const offset = integerValue(object.offset);
  const length = integerValue(object.length);
  return offset !== undefined && length !== undefined && offset >= 0 && length >= 0 ? { offset, length } : null;
}

export function parseExtensionMessage(value: unknown): ExtensionMessage | null {
  const object = objectValue(value);
  if (!object) return null;
  const type = stringValue(object?.type) as ExtensionMessageType | undefined;
  if (!type) return null;
  if (type === 'check') {
    if (typeof object?.text !== 'string') return null;
    const language = stringValue(object.language);
    const languageHint = stringValue(object.languageHint);
    const host = stringValue(object.host);
    const fieldID = stringValue(object.fieldID);
    return {
      type,
      text: object.text,
      ...(language ? { language } : {}),
      ...(languageHint ? { languageHint } : {}),
      ...(host ? { host } : {}),
      ...(typeof object.selection === 'boolean' ? { selection: object.selection } : {}),
      ...(Number.isSafeInteger(object.caret) && (object.caret as number) >= 0 ? { caret: object.caret as number } : {}),
      ...(fieldID ? { fieldID } : {}),
      ...(object.scope === 'document' ? { scope: 'document' as const } : {}),
    };
  }
  if (type === 'setFocus') {
    if (!['active', 'paused', 'zen'].includes(String(object?.mode))) return null;
    const duration = stringValue(object.duration);
    return { type, mode: object.mode as SetFocusMessage['mode'], ...(duration ? { duration } : {}) };
  }
  if (type === 'updateSettings') {
    const patch = objectValue(object?.patch);
    return patch ? { type, patch } : null;
  }
  if (type === 'addDictionary') {
    const word = stringValue(object.word);
    return word?.trim() ? { type, word } : null;
  }
  if (type === 'getWorkspaceIssues') {
    const tabID = integerValue(object.tabID);
    return tabID !== undefined && tabID >= 0 ? { type, tabID } : null;
  }
  if (type === 'applyWorkspaceIssue') {
    const range = positiveRange(object);
    const tabID = integerValue(object.tabID);
    const index = integerValue(object.index);
    return tabID !== undefined && tabID >= 0 && index !== undefined && index >= 0 && range && typeof object.replacement === 'string'
      ? { type, tabID, index, ...range, replacement: object.replacement } : null;
  }
  if (type === 'applyIssue') {
    const range = positiveRange(object);
    const index = integerValue(object.index);
    return index !== undefined && index >= 0 && range && typeof object.replacement === 'string'
      ? { type, index, ...range, replacement: object.replacement } : null;
  }
  if (type === 'settings-changed' || ['health', 'settings', 'focus', 'focusDurations', 'openSettings', 'openWorkspace', 'getIssues'].includes(type)) {
    return { type } as ExtensionMessage;
  }
  return null;
}

export function okResponse<T>(data?: T): ExtensionResponse<T> {
  return data === undefined ? { ok: true } : { ok: true, data };
}

export function errorResponse(error: unknown): ExtensionResponse<never> {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error');
  return { ok: false, error: message || 'Unknown error' };
}

/** Versioned Electron preload/main IPC boundary. No Electron APIs belong here. */

export const DESKTOP_IPC_CONTRACT_VERSION = 'ikmal-desktop-ipc-v1';

export const DESKTOP_INVOKE_CHANNELS = [
  'service-state', 'start-services', 'stop-services', 'open-editor', 'open-compact',
  'set-compact-expanded', 'set-compact-height', 'integration-status', 'quality-status',
  'quality-setup', 'open-third-party-notices', 'reveal-extension', 'configure-integrations',
  'check-text', 'recent-checks', 'clear-recent-checks', 'style-guide-state',
  'import-style-guide', 'style-guide-select', 'style-guide-enabled', 'get-launch-at-login',
  'set-launch-at-login', 'desktop-presence-state', 'set-desktop-presence',
  'get-annotation-preferences', 'add-dictionary-word', 'set-annotation-preferences',
  'get-checking-preferences', 'set-checking-preferences', 'focus-mode-state',
  'set-focus-mode', 'spell-server-state', 'install-spell-server', 'remove-spell-server',
  'office-bridge-state', 'office-bridge-generate-certificate', 'office-bridge-start',
  'office-bridge-stop', 'office-bridge-remove-certificate', 'office-reveal-manifest',
  'office-reveal-excel-manifest', 'office-reveal-powerpoint-manifest',
  'office-reveal-outlook-manifest', 'office-reveal-onenote-manifest', 'office-reveal-project-manifest',
] as const;

export const DESKTOP_EVENT_CHANNELS = [
  'service-state', 'service-error', 'quick-check', 'compact-invoked', 'show-history',
  'annotation-preferences', 'checking-preferences', 'focus-mode', 'editor-text',
] as const;

export type DesktopInvokeChannel = typeof DESKTOP_INVOKE_CHANNELS[number];
export type DesktopEventChannel = typeof DESKTOP_EVENT_CHANNELS[number];

export interface DesktopInvoke {
  channel: DesktopInvokeChannel;
  args: unknown[];
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function isDesktopInvokeChannel(value: unknown): value is DesktopInvokeChannel {
  return typeof value === 'string' && (DESKTOP_INVOKE_CHANNELS as readonly string[]).includes(value);
}

export function isDesktopEventChannel(value: unknown): value is DesktopEventChannel {
  return typeof value === 'string' && (DESKTOP_EVENT_CHANNELS as readonly string[]).includes(value);
}

export function parseDesktopInvoke(channel: unknown, args: unknown[] = []): DesktopInvoke | null {
  if (!isDesktopInvokeChannel(channel) || !Array.isArray(args)) return null;
  const first = args[0];
  const noArguments = new Set<DesktopInvokeChannel>([
    'service-state', 'start-services', 'stop-services', 'open-compact', 'integration-status',
    'quality-status', 'open-third-party-notices', 'reveal-extension', 'recent-checks',
    'clear-recent-checks', 'style-guide-state', 'import-style-guide', 'get-launch-at-login',
    'desktop-presence-state', 'get-annotation-preferences', 'get-checking-preferences',
    'focus-mode-state', 'spell-server-state', 'install-spell-server', 'remove-spell-server',
    'office-bridge-state', 'office-bridge-generate-certificate', 'office-bridge-start',
    'office-bridge-stop', 'office-bridge-remove-certificate', 'office-reveal-manifest',
    'office-reveal-excel-manifest', 'office-reveal-powerpoint-manifest', 'office-reveal-outlook-manifest',
    'office-reveal-onenote-manifest', 'office-reveal-project-manifest',
  ]);
  if (noArguments.has(channel)) return args.length === 0 ? { channel, args: [] } : null;
  if (channel === 'open-editor' || channel === 'add-dictionary-word' || channel === 'style-guide-select') {
    return args.length === 1 && typeof first === 'string' ? { channel, args: [first] } : null;
  }
  // check-text takes an optional caret and scope: a renderer that supplies them
  // is asking for a chunked check, and one that does not is checking whole
  // documents as before.
  if (channel === 'check-text') {
    if (typeof first !== 'string') return null;
    if (args.length === 1) return { channel, args: [first] };
    return args.length === 2 && objectValue(args[1]) ? { channel, args: [first, args[1]] } : null;
  }
  if (channel === 'set-compact-expanded') {
    return typeof first === 'boolean' && (args.length === 1 || args.length === 2 && typeof args[1] === 'boolean') ? { channel, args } : null;
  }
  if (channel === 'set-compact-height') return args.length === 1 && isFiniteNumber(first) ? { channel, args } : null;
  if (channel === 'quality-setup' || channel === 'set-launch-at-login' || channel === 'style-guide-enabled') {
    return args.length === 1 && typeof first === 'boolean' ? { channel, args } : null;
  }
  if (channel === 'configure-integrations') {
    return args.length === 1 && Array.isArray(first) && first.every((value) => typeof value === 'string') ? { channel, args } : null;
  }
  if (channel === 'set-desktop-presence' || channel === 'set-annotation-preferences' || channel === 'set-checking-preferences') {
    return args.length === 1 && objectValue(first) ? { channel, args } : null;
  }
  if (channel === 'set-focus-mode') {
    const value = objectValue(first);
    return args.length === 1 && value && ['active', 'paused', 'zen'].includes(String(value.mode))
      && (value.duration === undefined || typeof value.duration === 'string') ? { channel, args } : null;
  }
  return null;
}

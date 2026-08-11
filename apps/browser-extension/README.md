# Browser rewrite slice

This is the fresh browser vertical-slice runtime. It packages compiled
`writing-core`, `writing-adapters`, and `writing-ui` artifacts plus the
Continental token and primitive CSS. The existing `extension/` directory remains the
deprecated reference runtime and is deliberately not replaced by this slice.

Build with `node tools/package_browser_rewrite.mjs`; the output is staged under
`bin/browser-extension/` and can be loaded as an unpacked MV3 extension.

Run `node tools/browser_rewrite_smoke.mjs` for the packaged-runtime Chromium
smoke. It loads the staged modules in a controlled page with a local
`chrome.runtime` stub so DOM, Shadow DOM, contenteditable, IME-event, and
stale-mutation behavior can be exercised even when the current headless
environment cannot inject an MV3 content script. This does not replace a
headed extension-injection smoke.

After `npm ci` and `npx playwright install chromium` at the workspace root, run
`node tools/browser_extension_injection_smoke.mjs`. That harness loads the
packaged MV3 extension into headed Chromium, verifies the rewrite service
worker, and exercises a real loopback textarea. Without the browser install it
falls back to a system Chromium and says so; `IKMAL_CHROMIUM` and
`IKMAL_PLAYWRIGHT_MODULE` override the browser and the Playwright it imports.

Run the same command with `node tools/browser_extension_unavailable_smoke.mjs`
to point the packaged smoke artifact at an unreachable loopback checker and
verify the injected UI presents the unavailable state without stopping any
local checker.

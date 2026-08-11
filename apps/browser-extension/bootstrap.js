// Manifest content scripts are classic scripts. Load the rewrite controller
// as an isolated extension module; the deprecated extension is not involved.
void import(chrome.runtime.getURL('content_module.js')).catch((error) => {
  console.error('ikmal browser rewrite failed to start', error);
});

// Where "Help fund it" goes. Kept in its own file so changing the funding
// destination never means touching UI logic, and so it is trivial for anyone
// packaging a fork to point it at themselves instead.
//
// Rules this project holds itself to, enforced by how the code is written
// rather than by policy:
//
//   1. No feature is ever gated on payment. There is no premium tier, no
//      license key, and no entitlement check anywhere in this extension.
//   2. The prompt appears once and is dismissible forever. See
//      supportPromptSeen in config.js — nothing resets it.
//   3. No nagging on a timer, on a word count, or on a "you have used your
//      free checks" threshold. None of those counters exist.
//   4. Declining is not tracked or reported. There is nowhere to report it to.

// Points at the project's support page rather than a payment processor. That
// page leads with the ways to help that cost nothing, which is the honest
// ordering: bug reports and rule contributions are worth more to this project
// than small donations, and someone who cannot give money should not land on a
// page that only asks for it.
//
// Swap this for a sponsors URL once one exists; see .github/FUNDING.yml.
export const SUPPORT_URL = 'https://github.com/timeworthy/ikmal-editor/blob/main/SUPPORT.md';

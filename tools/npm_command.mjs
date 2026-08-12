// Running npm from a script, on every platform this project packages for.
//
// npm on Windows is `npm.cmd`, and since the fix for CVE-2024-27980 Node
// refuses to execFile a `.cmd` without a shell. It does not refuse with
// anything that names the problem — it throws `spawnSync npm.cmd EINVAL`,
// which is what the Windows release job failed with the first time this
// pipeline ran. Every packager and verifier here shells out to npm to build
// the portable packages, so all of them were affected and none of them could
// have known: the platform that breaks is the one a macOS checkout never runs.
//
// A shell means quoting is ours to do. The paths passed to `--prefix` are
// absolute and can contain spaces, and an unquoted one would be split into
// arguments by the shell rather than by us.

import { execFileSync } from 'node:child_process';

function quoteForShell(argument) {
  return /[\s"&|<>^()]/.test(argument) ? `"${String(argument).replace(/"/g, '\\"')}"` : argument;
}

export function runNpm(args, options = {}) {
  if (process.platform !== 'win32') {
    return execFileSync('npm', args, { stdio: 'inherit', ...options });
  }
  return execFileSync('npm.cmd', args.map(quoteForShell), { stdio: 'inherit', shell: true, ...options });
}

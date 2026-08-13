# Supporting ikmal editor

Good writing is how we stay informed and how history stays legible. The tools
that help people write clearly should not sit behind a paywall.

So ikmal editor is free, and it stays free. Not free-for-now, not free-until-we-
raise-a-round, not free-with-limits. There is no premium tier, no license key,
and no entitlement check anywhere in this codebase — not disabled, not behind a
flag, simply absent. [`tools/verify_extension.mjs`](tools/verify_extension.mjs)
fails the build if one ever appears.

That is the whole promise. Everything below is optional, and none of it changes
what you get.

---

## Ways to help that cost nothing

These are worth as much as money, and often more.

**Use it and tell us what broke.** Bug reports from real writing are the most
valuable thing this project receives. [Open an issue](https://github.com/timeworthy/ikmal-editor/issues)
with the text that misbehaved.

**Write rules.** The [Plain English rule pack](rules/style_conciseness.xml) is
plain XML in LanguageTool's rule schema. If you know a construction that muddies
writing in your field — legal, medical, academic, government — a rule for it
helps everyone who writes in that field. No Go or JavaScript needed.

**Improve a language other than English.** Grammar checking is far better
resourced in English than almost anywhere else. LanguageTool supports 25+
languages, and ikmal's quality layer currently understands one. That gap is
worth closing.

**Tell someone.** Most people paying a subscription for grammar checking do not
know a local, private, free option exists.

**Package it.** Homebrew, Scoop, and an Unraid template exist. Debian, Arch,
Nix, Flatpak, and Windows Store do not.

---

## Ways to help that cost money

If ikmal is useful to you, and you are in a position where a few dollars is not
a real decision, funding it pays for the maintenance that keeps it working:
tracking LanguageTool releases, testing across three operating systems, and
answering issues.

If you are not in that position, use it anyway. That is the entire point of
building it this way.

> **Status:** GitHub Sponsors is not yet enabled for this project. Until it is,
> the most useful contribution is one of the above. This section will carry the
> funding link once it exists.

---

## What funding does not buy

Stating this plainly because the reverse is so common:

- **It does not unlock features.** There are none to unlock.
- **It does not remove ads or prompts.** There are none. The support prompt in
  the browser extension appears once, is dismissible forever, and never returns.
- **It does not buy priority.** Bug reports are triaged by severity, not by
  sponsorship.
- **It does not buy influence over the roadmap.** Suggestions are weighed on
  their merit.

If any of that ever stops being true, it will be because the project changed
hands or changed principles — and this file should be the first thing that
changes to say so.

---

## For companies

If your organization has people writing all day and a budget for the tools they
use, ikmal is a reasonable thing to fund. It runs entirely on your own
infrastructure, so your drafts never leave your network — which is usually a
procurement argument on its own.

Nothing ikmal installs carries a non-commercial restriction. It once shipped an
optional local model whose weights were CC BY-NC-SA 4.0; that model has been
removed, because a product meant for people who are not lawyers should not ask
them to judge a licence. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

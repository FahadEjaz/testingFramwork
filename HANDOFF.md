# How this platform works

A walkthrough for someone new to the project — read this one document and you should understand
the whole platform without opening any code. For deeper technical detail once you're oriented,
`ARCHITECTURE.md` is the reference; `REQUIREMENTS.md`/`PLAN.md`/`PROGRESS.md` are the spec and
build history if you need the "why" behind a decision.

## What this is, in one paragraph

A hosted web app where a non-technical user records, runs, and manages Playwright end-to-end
tests for a target website entirely from a browser — no CLI, no git, no local install. Under the
hood it's a normal Playwright test suite. The one twist: when a test's locator breaks (the page
changed and a button/link can no longer be found the old way), the system tries to heal itself
automatically — first with zero AI involvement, and only as an absolute last resort with one
small, tightly scoped AI call. A human always has the final say before a healed fix becomes
permanent.

## The end-user flow

Everything below happens by clicking through the web app — no terminal, no files, no git.

### 1. Record a test

From "New Recording," the user types in a URL. The app launches a real browser on the server and
streams a live, interactive view of it into the user's own browser — they click and type against
it exactly like they would against the real site. Every click and keystroke is captured behind
the scenes as a test step, along with a handful of backup ways to find that same element later
(its test-id, its accessible role/name, its CSS position, and so on). When they click "Stop
Recording," they see a plain-English preview of what was captured, give it a name, and save.

*Heads up shown in the app itself:* whatever you type while recording is saved as plain text in
the resulting test file so it can be replayed later — don't type real passwords or other
sensitive personal data during a recording.

### 2. Run it

One click on "Run" for any saved test. The app runs the real Playwright test in the background
and shows the result — passed, failed, or **healed** (see below) — along with the same kind of
detailed report Playwright always produces: pass/fail per step, screenshots, video on failure,
and a full trace you can step through, all viewable right in the browser.

### 3. Self-healing, when a locator breaks

If the site changes and a test can no longer find an element the way it used to, the system
doesn't just fail immediately. It tries each of that element's backup locators, in order, with
**no AI involved** — this is pure "try a different known-good way to find the same thing." If one
of those works, the test still passes for that run, and the fix (old way → new way) is queued for
a human to review.

Only if *every* backup also fails does the system make one small AI call: it sends the model just
the broken locator's old definition and a small, pruned snapshot of the page's clickable elements
(never the whole page, never anything that looks like an email/token/card number — filtered out
automatically) and asks for one replacement. If that works, it's queued the same way, just marked
"AI-healed" instead of "Fallback-healed" so a reviewer knows which kind of fix it is and can see
how many AI tokens it cost.

### 4. Review and approve fixes ("Pending Fixes")

Nothing a self-heal (fallback or AI) finds ever becomes permanent on its own. Every healed fix
sits in the "Pending Fixes" queue showing exactly what changed — old locator, new locator, which
test, which kind of heal — until a human clicks **Approve** or **Reject**. Approve makes it the
new default for every future run of that test. Reject throws it away; the test will need a
re-record or another heal next time it breaks. This queue also shows the running total of AI
tokens spent healing locators, so cost stays visible.

### 5. Manage tests

List, rename, delete, or re-record any test from the app. Each test's run history and current
Pending Fixes are browsable without ever touching a file directly.

## Under the hood (for whoever maintains this)

- **The execution engine is a normal Playwright + TypeScript project** (`tests/`, `manifests/`,
  `playwright.config.ts`) — everything above is a web app wrapped around it, not a replacement
  for it. A developer can still run `npm test` from a terminal exactly like any Playwright repo.
- **`server/`** is a small Express/TypeScript API (single shared login, JSON files on disk for
  storage) that drives that engine on the end user's behalf: trigger a run, read results back,
  manage the Pending Fixes queue, run a live recording session. **`web/`** is the React frontend
  that talks to it.
- **The self-healing pipeline is deliberately layered, cheapest-first:** normal locator → try
  each manifest fallback (no AI) → only then, one scoped AI call. This is the project's
  non-negotiable core philosophy (`REQUIREMENTS.md` Section 2) — AI is an *exception handler*,
  never a per-run participant, and never applies its own fix without a human clicking Approve.
- **Full technical detail** — every file, every API route, every environment variable, exactly
  what data does and doesn't reach the AI model — lives in `ARCHITECTURE.md`. Start there once
  you need to actually change something.
- **Project history and current state** — what's built, what's deliberately deferred, open
  questions for whoever's driving the project — lives in `PROGRESS.md`, updated at the end of
  every work session. Check it before assuming anything about what phase the project is in.

## Where things stand today

Phases 0-10 of `PLAN.md` are built (the CLI-era engine plus every part of the pivot to a hosted
web app: recording, execution/reporting, the Pending Fixes queue, AI escalation, accessibility +
visual-regression checks). See `PROGRESS.md` for exactly what's committed vs. still on a branch
awaiting review, and for the handful of intentionally-deferred edge cases (artifact retention,
manifest schema drift on an AI-approved fix, and a few others) that are documented rather than
silently ignored.

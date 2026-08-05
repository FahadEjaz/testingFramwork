# Phase 12 spike's per-session sandbox (see PLAN.md's gated "In-app AI debug terminal"). Minimal
# on purpose: this container's only job is running `claude` against a sparse-checked-out worktree
# with shell access — it does not re-run Playwright/Chromium inside the sandbox (that would need
# its own --no-sandbox/seccomp carve-outs on top of --cap-drop=ALL, out of scope for this pass;
# see PROGRESS.md's "known gaps" for this session).
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Pinned to the same version already installed on the host (server/src/debugSession/session.ts
# assumes CLI behavior at this version) — official package, same one `claude` itself resolves to.
RUN npm install -g @anthropic-ai/claude-code@2.1.222

# node:22-slim already ships a non-root "node" user (uid 1000) — reuse it rather than colliding.
USER node
WORKDIR /workspace

ENTRYPOINT ["claude"]

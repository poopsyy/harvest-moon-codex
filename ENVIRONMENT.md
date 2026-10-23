# Managed cloud environment

The project lives at `/workspace/harvest-moon-codex`. Node.js 24.19.0 and pnpm 11.25.0 are available. No application secrets, database, or external service credentials are required.

## Tested installation

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /workspace/harvest-moon-codex
export XDG_DATA_HOME=/workspace/.local/share
export XDG_CACHE_HOME=/workspace/.cache
pnpm install --frozen-lockfile --store-dir /workspace/.pnpm-store
pnpm build
```

The workspace cache paths avoid writes to the read-only home directory. Frozen-lockfile installation succeeds. The build regenerates original assets and checks TypeScript before producing the static PWA.

## Start a session

Use the existing checkout. Run `pnpm dev --host 0.0.0.0 --port 5173` from the project directory. Confirm readiness with an HTTP request and a real browser; do not treat a process start alone as verification. Background servers need restarting in a new task. The production server for offline checks is `pnpm exec vite preview --host 0.0.0.0 --port 4173` after building.

System Chromium is `/usr/bin/chromium`. The Playwright configuration uses it when available and otherwise uses Playwright's installed Chromium. Complete browser testing additionally needs Firefox and WebKit:

```sh
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright pnpm exec playwright install firefox webkit
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright pnpm e2e
```

Official browser downloads were denied by the running network policy with HTTP 403. The configuration draft includes `cdn.playwright.dev` and `playwright.download.prss.microsoft.com`; saving the draft does not apply these domains to the current runtime. Review and save the environment settings, then publish the environment to activate the configuration. Browser installation and the full check must then be retried; cross-browser success is not established by saving network settings.

The implementation is a local Git checkpoint. Publishing the configuration is separate from pushing source code. Reliable restoration of local-only commits into a fresh task has not been demonstrated; retain this checkout and its commit rather than assuming that selecting the original empty remote branch will reproduce it.

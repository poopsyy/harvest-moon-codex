# Willowmere Acres

An original browser farming life simulation about making a home and helping a valley decide its future. Plant seasonal crops, care for animals, meet the people of Willowmere, explore the old mine, and restore the Lantern Tree. All visual assets, fonts, music, and sound effects are generated from project source.

## Run locally

Use Node.js 24 LTS (or Node.js 22.12+) and pnpm 11.25.0. The committed lockfile selects the tested dependency graph.

```sh
pnpm install --frozen-lockfile
pnpm gen:assets
pnpm dev
```

Open the URL printed by Vite. Asset generation writes original sprite sheets, map JSON, fonts, title art, and icons into `public/`. The generator must run before the first development session. `pnpm build` regenerates assets automatically, checks TypeScript, and creates `dist/`.

```sh
pnpm build
pnpm exec vite preview --host 0.0.0.0
```

## Controls and play

| Action              | Keyboard           |
| ------------------- | ------------------ |
| Walk                | WASD or arrow keys |
| Interact / use tool | Space or Z         |
| Cycle tools         | Q / E              |
| Inventory           | I                  |
| Journal             | J                  |
| Menu / back         | Escape             |
| Run                 | Shift              |

Gamepad and touch controls are available. Options include time speed, precise sowing, audio levels, reduced flashes, and control preferences. Most menus pause the clock. Save at the farmhouse diary or through the menu; sleep creates a morning autosave. Three manual save slots and JSON export/import provide additional backups. Saves belong to the current browser profile and site origin.

[WALKTHROUGH.md](WALKTHROUGH.md) introduces the first fourteen days and includes a marked spoiler guide. [STORY.md](STORY.md) describes narrative triggers. [CONTENT.md](CONTENT.md) records generated content counts. [BALANCE.md](BALANCE.md) explains crop and livestock economics.

## Verification

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm exec playwright install --with-deps chromium firefox webkit
pnpm build
pnpm e2e
pnpm sim --short
pnpm sim
pnpm bundle:check
pnpm check
```

`pnpm check` chains typechecking, linting, coverage tests, production build, browser tests, a short simulation, and bundle budgets. The full simulation is separate. `pnpm exec tsx tools/content.ts` regenerates the content inventory from validated data. `pnpm bundle:check` reads the production manifest and records actual initial static JavaScript gzip bytes and the complete distribution size in `BUNDLE_METRICS.json`.

Playwright projects cover desktop Chromium, Firefox, WebKit, mobile Chromium, and production offline behavior. Chromium can use an installed system executable through `CHROMIUM_PATH` (default `/usr/bin/chromium`). In this managed build environment, official Firefox/WebKit browser download domains were blocked during setup; those projects remain configured and must run where their browser binaries are available. A missing browser is a blocked verification step, not a passing test. Use `pnpm exec playwright test --project=chromium --project=mobile --project=offline` for the available subset. Consult the final report for actual completed checks and measurements.

## Architecture

- `src/state/`: the serializable game state, commands, and new-game factory.
- `src/core/` and `src/systems/`: deterministic rules, clock, relationships, economy, exploration, progression, and pathfinding without Phaser dependencies.
- `src/data/`: validated catalogs, narrative, schemas, and localization strings.
- `src/render/`, `src/scenes/`, and `src/input/`: Phaser presentation, movement, and input translation.
- `src/ui/`: accessible HTML panels and application controls.
- `src/audio/`: five-channel original music sequencer and synthesized effects.
- `src/persistence/`: IndexedDB slots, autosave, validation, migration, and portable backups.
- `tools/`: procedural original assets, font generation, content inventory, and bundle checks.
- `tests/unit/`, `tests/e2e/`, and `tests/sim/`: rule tests, real-browser journeys, and deterministic long runs.

The game loads renderer code separately from the title interface. Vite PWA generates a service worker and offline precache for the production build. Test offline behavior after opening the production site online once and waiting for the service worker to finish installing; development Vite sessions do not represent production offline behavior.

## Static deployment

All three providers use the same static `dist/` output. No server or database is required. The default build deploys at the domain root. Set `VITE_BASE_PATH` to a leading-and-trailing-slash path for a subdirectory deployment; runtime assets and the PWA scope follow it. Use HTTPS for installability and service workers.

### GitHub Pages preview

The preview files are published separately on the `gh-pages` branch. In repository **Settings → Pages**, choose **Deploy from a branch**, then **gh-pages / (root)**. Once GitHub finishes deployment, the preview URL is `https://poopsyy.github.io/harvest-moon-codex/`.

Build updated preview files with:

```sh
VITE_BASE_PATH=/harvest-moon-codex/ pnpm build
```

Publish the contents of `dist/` at the root of `gh-pages`, including an empty `.nojekyll` file. Source commits on `main` alone do not update this preview branch. Changes to gameplay code should also pass the checks above before publishing.

| Provider         | Configuration                                                                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel           | Import the repository, select Vite, install with `pnpm install --frozen-lockfile`, build with `pnpm build`, and publish `dist`. Set Node.js 24 LTS.                                |
| Netlify          | Import the repository, set build command `pnpm build` and publish directory `dist`. Set Node.js 24 LTS and the project’s pnpm version in the build environment.                    |
| Cloudflare Pages | Connect the repository, select Vite, set build command `pnpm build` and output directory `dist`. Set `NODE_VERSION` to a supported 24 LTS version and ensure pnpm 11.25.0 is used. |

After deployment, open the site, make a save, reload it, then repeat offline. Confirm the manifest icons and generated font load. Service worker updates install automatically; a reload may be needed to activate the latest build. Changing the deployed origin creates a different browser save namespace, so export saves before moving domains.

## Attribution

See [CREDITS.md](CREDITS.md) for installed library versions and verified license metadata, and [ORIGINALITY.md](ORIGINALITY.md) for asset production. [CHANGELOG.md](CHANGELOG.md) tracks implementation by the brief’s milestone categories without treating a category entry as proof of passing checks.

## Verification scope

The headless command simulation has completed five deterministic 300-day runs with all four Hearthstones, all nine sequential neighbor arcs, all twenty-four fish species, ten Sunroot discoveries, marriage, adoption, all nine festivals, and Thriving endings; see BALANCE.md for per-seed figures. The catalog inventory is generated rather than manually counted. These results establish rule-level reachability, not a measured human play length or complete graphical parity with every detail of BUILD_BRIEF.md.

Performance reports distinguish desktop Lighthouse, local title-load timings, offline behavior, bundle size, and retained-heap checks. Localhost load timing is not a broadband benchmark; a headless stress-frame sample does not establish 60 FPS on a physical midrange phone. The final report should be read for the current acceptance status, browser restrictions, and any specification deviations.

The final checkpoint has 82 passing unit tests and 36 passing available-browser scenarios, with two intentional project-specific skips. The complete `pnpm check` exits at 36 missing-browser launch failures. Formal stress measured 50.1 FPS, and one of five cold title loads took 4.568 seconds; acceptance remains open. See [FINAL_REPORT.md](FINAL_REPORT.md), [VALIDATION_RESULTS.json](VALIDATION_RESULTS.json), and [PERFORMANCE_METRICS.json](PERFORMANCE_METRICS.json) for the complete evidence and remaining work.

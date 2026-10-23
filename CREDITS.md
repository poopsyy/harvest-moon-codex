# Credits and licenses

All Willowmere Acres art, character designs, maps, font glyphs, music, synthesized sounds, and writing were created for this project. No downloaded asset packs, recorded samples, or preexisting game artwork are used. See ORIGINALITY.md for generation techniques and source files.

## Direct dependencies and development tools

Versions and licenses below were read from installed package metadata on 2026-10-23, rather than inferred from package names.

| Library             | Installed version | Declared license |
| ------------------- | ----------------- | ---------------- |
| phaser              | 4.2.1             | MIT              |
| zod                 | 4.6.7             | MIT              |
| idb-keyval          | 6.3.0             | Apache-2.0       |
| typescript          | 6.0.3             | Apache-2.0       |
| vite                | 8.3.5             | MIT              |
| vite-plugin-pwa     | 2.0.0             | MIT              |
| workbox-build       | 7.4.1             | MIT              |
| workbox-window      | 7.4.1             | MIT              |
| vitest              | 5.0.5             | MIT              |
| @vitest/coverage-v8 | 5.0.5             | MIT              |
| @playwright/test    | 1.64.1            | Apache-2.0       |
| eslint              | 10.13.0           | MIT              |
| typescript-eslint   | 8.72.0            | MIT              |
| prettier            | 3.9.10            | MIT              |
| tsx                 | 4.23.15           | MIT              |
| pngjs               | 7.0.0             | MIT              |
| @types/node         | 24.19.2           | MIT              |
| @types/pngjs        | 6.0.5             | MIT              |

## Runtime dependency closure

This includes the application dependency graph and the Workbox modules used for offline caching. Transitive runtime package declarations are checked separately from direct development tools.

| Library              | Installed version | Declared license |
| -------------------- | ----------------- | ---------------- |
| @types/trusted-types | 2.0.7             | MIT              |
| eventemitter3        | 5.0.4             | MIT              |
| idb                  | 7.1.1             | ISC              |
| idb-keyval           | 6.3.0             | Apache-2.0       |
| phaser               | 4.2.1             | MIT              |
| workbox-core         | 7.4.1             | MIT              |
| workbox-expiration   | 7.4.1             | MIT              |
| workbox-precaching   | 7.4.1             | MIT              |
| workbox-routing      | 7.4.1             | MIT              |
| workbox-strategies   | 7.4.1             | MIT              |
| workbox-window       | 7.4.1             | MIT              |
| zod                  | 4.6.7             | MIT              |

All listed licenses are permissive MIT, ISC, or Apache-2.0 licenses and fall within the brief’s allowed license families. Library authors retain their copyrights. Their license files and notices are distributed in the installed packages; production bundling retains library license comments where emitted by the bundler. Apache-2.0 packages also carry their applicable patent grant and notice requirements. The game’s original assets and writing are not third-party library material.

## Additional audit tool

Lighthouse 13.5.0, Apache-2.0, was verified and installed in an isolated tooling directory for the final desktop performance audit. It is not part of the game bundle. Its recorded version, environment and measurements appear in `PERFORMANCE_METRICS.json`.

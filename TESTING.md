# Testing

## Phase 3 local verification

The default suite uses temporary SQLite databases, temporary private data directories, deterministic IDs/time, and `FakeGeminiGateway`. It requires no `GEMINI_API_KEY` and makes no external network request. Transport tests use a temporary loopback-only HTTP server and never contact Google.

Focused results recorded during implementation:

```text
npm run test --workspace backend -- tests/phase3-pipeline.test.ts
Test Files  1 passed (1)
Tests       2 passed (2)

npm run test --workspace backend -- tests/gemini-transport.test.ts
Test Files  1 passed (1)
Tests       4 passed (4)

npm run test --workspace backend -- tests/artifacts.test.ts
Test Files  1 passed (1)
Tests       3 passed (3)

npm run test --workspace backend -- tests/phase3-resume-validation.test.ts
Test Files  1 passed (1)
Tests       14 passed (14)
```

The complete fake run makes exactly nine gateway calls for the default two-adult project:

```text
uploadSource ×1
createBookContext ×1
defineStyle ×1
extractCharacters ×1
createImageContext ×1
generatePortrait ×2
extractChapter ×1
generateIllustration ×1
```

It persists one style, two validated adults, two portraits, one chapter, one illustration, nine succeeded provider-operation rows, and a Done project. All three artifacts remain readable through authenticated URLs after rebuilding the app against the same temporary database and data root.

The controlled 429 transport test invokes `defineStyle`, receives one HTTP 429, observes exactly one `POST /v1beta/interactions`, and returns `QUOTA_EXCEEDED`. It proves no transport retry and no automatic image-model fallback. Files transport is separately asserted as exactly its two documented resumable requests.

Additional coverage includes upload/book/style resume boundaries, user art direction with no style-generation call, malformed JSON, zero adults, child output, three characters, short prompts, two chapters, unknown cast references, PNG/JPEG/WebP validation, malformed/mismatched/oversized/no-image output, path traversal, foreign-owner 404s, partial portrait preservation, missing-only retry, reconciliation without another gateway call, stale artifact rejection, and immediate stale-runner spend cutoff.

Final root verification:

```text
npm run typecheck
All 3 workspaces passed.

npm run lint
All 3 workspaces passed with 0 errors and 0 warnings.

npm test
Frontend: 3 files passed, 6 tests passed.
Backend: 13 files passed, 83 tests passed.

npm run build
Contracts, Vite frontend, and Fastify backend production builds passed.
```

The final built-runtime smoke started `backend/dist/server.js` with an explicitly empty `GEMINI_API_KEY`, isolated temporary `DATA_DIR`/`DATABASE_PATH`, and loopback binding. `GET /api/health` returned `{"status":"ok"}`; the temporary runtime directory was then removed. An earlier keyless smoke also created a temporary session/project and confirmed Stage I returned `GEMINI_NOT_CONFIGURED` without provider work.

Paid end-to-end Gemini image generation is intentionally not part of this keyless test gate.

# Gradion Folio Book Studio

An editorial book-illustration studio migrated from the approved vinext UI to a local npm workspace. The Phase 4 frontend now uses the persistent Fastify APIs for identity sessions, projects, manuscripts, the five-stage pipeline, and authenticated artifacts while preserving the approved visual system. The backend provides the Phase 3 Gemini pipeline, private local artifacts, structured validation, provider-operation provenance, and owner-scoped artifact delivery behind the existing Phase 2 state machine.

## Architecture

```text
Gradion-Folio-Book-Studio/
├── frontend/   React + Vite + TypeScript + Tailwind + TanStack Router
├── backend/    Node.js + Fastify + TypeScript + Zod + SQLite
├── packages/   shared API contracts and canonical pipeline constants
├── docs/       migration baseline, behavior inventory, and comparison
├── data/       ignored private runtime database, manuscripts, and generated artifacts
├── package.json
└── package-lock.json
```

The frontend uses TanStack Query as its server-state boundary and TanStack Router loaders for cookie-session restoration and protected-route redirects. It does not store authoritative identity, project, manuscript, step, or artifact state in localStorage. New Volume form values remain component-local until one explicit create request succeeds.

The backend exposes health, assessment identity sessions, owner-scoped projects, and authenticated manuscript retrieval. SQLite uses WAL, foreign keys, a busy timeout, and versioned migrations. Canonical manuscripts are stored privately under `data/users/<userId>/projects/<projectId>/source/book.txt`; `data/` is never exposed as static content.

Identity is email-based continuity for the local assessment: returning with the same normalized email restores the same user and projects and updates the saved display name. It does not verify that the person owns that email address and is not production authentication.

Phase 2's owner-scoped run/recover routes, short atomic SQLite claims, durable attempts, leases, heartbeat extension, attempt fencing, and explicit retry/recovery remain intact. Phase 3 adds a deterministic fake full pipeline, versioned prompts, server-side character/chapter rules, strict PNG/JPEG/WebP persistence, per-call provider-operation records, and a native-fetch `GoogleGeminiGateway` with one attempt per request, explicit timeouts, standard service tier, and no model fallback.

When `GEMINI_API_KEY` is absent, the server starts normally and generation persists a safe `GEMINI_NOT_CONFIGURED` failure. When it is set in the backend environment, runtime composition selects the real gateway and fenced executor. The key is never part of frontend code, DTOs, health responses, or logs. The adapter has been verified only against controlled local HTTP transport tests: paid end-to-end Gemini image UAT is not complete because the candidate's project currently has free-tier image quota `0`.

Phase 4 replaces the former `DemoStore`, browser generation timers, seed projects, and generated-artifact fixture mappings. Library summaries come from the owner-scoped API; Studio derives the active stage from the five persisted step DTOs, polls only while a run is pending or a server step is visibly running, and keeps Retry and Recover as separate manual actions.

## Requirements

- Node.js 22.23.2 or newer (the verified Node 22 minimum for the pinned SQLite driver)
- npm 10 or newer

## Run locally

```bash
npm install
npm run dev
```

Local configuration is read from the repository-root `.env` when present, while explicit shell variables take precedence. Runtime data defaults to the ignored repository-root `data/` directory. The application is designed for a single-host, localhost-only HTTP runtime; it does not require or include Docker.

The workspace starts:

- Frontend: `http://localhost:3000`
- Backend: `http://127.0.0.1:3001`
- Proxied health check: `http://localhost:3000/api/health`

Backend routes through Phase 3:

- `POST`, `GET`, and `DELETE /api/session`
- `GET` and `POST /api/projects`
- `GET /api/projects/:projectId`
- `GET /api/projects/:projectId/manuscript`
- `POST /api/projects/:projectId/steps/:ordinal/run`
- `POST /api/projects/:projectId/steps/:ordinal/recover`
- `GET /api/projects/:projectId/characters/:characterId/portrait`
- `GET /api/projects/:projectId/chapters/:chapterId/illustration`

The run endpoint returns `200` after a successful fake execution (or for an already-succeeded step), `202` for a duplicate request while the current lease is live, and typed `409` errors for out-of-order or expired-running requests. Only the first incomplete step can be claimed. A failed step is retried only by another explicit run request; there is no automatic execution retry.

Steps store only `pending`, `running`, `succeeded`, and `failed`. `stuck` is a derived DTO state for a running step whose lease has expired. Recovery is a separate zero-execution action: it abandons the expired attempt, records `PROCESS_INTERRUPTED`, clears its fence/lease, resets only in-progress item checkpoints, and preserves succeeded steps and items.

Attempt IDs are private fencing tokens. Heartbeats, checkpoints, and terminal writes update only the matching active attempt. This prevents a late result from an abandoned process from replacing newer state, but it is not a distributed exactly-once guarantee. Process-local foreground work does not survive server death. If a future real provider accepts a request and the process dies before its response is durably checkpointed, an explicit later retry may issue another provider operation.

Each provider sub-call is its own fenced operation. Source upload, book context, generated style, character extraction, image context, each portrait, chapter extraction, and final illustration checkpoint independently. Completed remote context and artifacts are reused on explicit retry; expired required provider context returns `CONTEXT_EXPIRED` rather than silently spending calls to rebuild it. Provider operations store model/prompt provenance, symbolic context ownership, request IDs, safe usage/timing data, and typed failures—never prompts, manuscript text, API keys, cookies, base64 images, or raw upstream bodies.

Generated images are stored with server-owned attempt-specific names below `data/users/<userId>/projects/<projectId>/portraits|illustrations/`. Writes use a private temporary file, flush, and atomic rename. Database associations contain only relative paths plus MIME, size, and SHA-256 metadata. Artifact routes perform the owner check before reading, revalidate path containment and stored bytes, use `nosniff`, and return private immutable cache headers. Crash-orphaned files may remain on disk, but they are never reachable without a valid fenced association.

The backend sends manuscript content to Google's Files and Interactions APIs only when the real adapter is explicitly configured and Stage I is run. Treat provider Files/interactions as expiring cache and local source/artifacts as durable truth. Use public-domain, non-sensitive assessment text; Google retention varies by resource and account/tier.

Session cookies are opaque, finite-lived, HttpOnly, `SameSite=Lax`, and scoped to `/`. Only a SHA-256 token hash is stored in SQLite. Cookies intentionally omit `Secure` for the documented localhost HTTP runtime.

The application routes are:

- `/login`
- `/library`
- `/volumes/new`
- `/volumes/$volumeId`

Direct navigation, cookie-session restoration, dialogs, upload/paste behavior, persisted pipeline states, authenticated artifact URLs, Retry, and Recover are covered by focused frontend tests and the intercepted-API Playwright capture.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The root scripts run all workspaces. Frontend tests cover typed API parsing, session guards and cache isolation, Library states, exact paste/multipart creation, persisted Studio states, conditional polling, explicit Retry/Recover, real artifact URLs, and manuscript dialog states. Backend tests use isolated temporary databases and file roots for migrations, constraints, sessions, owner scoping, source/image validation, compensation, two-instance concurrency, fencing, recovery, partial checkpoints, restart persistence, and all five fake stages. Provider transport tests bind a controlled loopback HTTP server; they require no Gemini key, never contact Google, and prove that a 429 causes exactly one outgoing adapter request.

Project creation validates and canonicalizes the complete source before visibility, writes through a flushed sibling temporary file and atomic rename, then inserts the project and its five pending stages in one immediate SQLite transaction. An ordinary database failure removes the new project directory. A process crash can leave an unreferenced orphan directory, but cannot expose a database project pointing at a partially written source; orphan reconciliation is intentionally deferred beyond Phase 1.

## Visual regression evidence

The accepted pre-migration screenshots are committed in `docs/baseline/before/`; migrated screenshots live in `docs/baseline/after/`. Both use `1440 × 1000` desktop and `390 × 844` mobile viewports. See `docs/baseline/behavior.md` for the interaction inventory and `docs/baseline/comparison.json` for the image comparison report.

Playwright remains a root development dependency because the capture is reusable regression coverage. The current harness intercepts same-origin `/api` requests with deterministic session/project/pipeline fixtures; it does not restore production seed mode, require an API key, or contact Gemini. Install its local Chromium binary once if needed:

```bash
npx playwright install chromium
npm run visual:after
npm run visual:compare
```

Set `PLAYWRIGHT_EXECUTABLE_PATH` to reuse an existing Chromium executable. The capture intentionally uses `http://localhost:3000`; this also supports the legacy baseline server's IPv6 localhost binding.

## Styling migration boundary

Tailwind is active in the Vite pipeline with the approved palette, typography, spacing, and shadow tokens. Utilities are used for new structural wrappers and route-level fallback UI. The parity-sensitive custom stylesheet remains in place so the migration does not redesign or simplify the approved interface; sections can be converted incrementally only after screenshot verification.

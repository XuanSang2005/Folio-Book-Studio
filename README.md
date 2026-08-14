# Gradion Folio Book Studio

Gradion Folio is a local editorial studio that turns one plain-text manuscript into a visual style, a cast of up to two adults, one portrait per character, one chapter brief, and one final illustration. Every stage is started manually, persisted in SQLite, and recoverable without discarding completed work.

The approved vinext prototype was migrated without redesign to React, Vite, TypeScript, Tailwind, TanStack Router, and TanStack Query. Fastify, Zod, SQLite, and a private local filesystem provide the backend. Shared browser-safe contracts live in `packages/contracts`.

## Prerequisites and setup

- Node.js 22.23.2 or newer
- npm 10 or newer
- A Gemini API key with access and paid image quota for real generation

```bash
npm ci
cp .env.example .env
# Edit .env and set GEMINI_API_KEY for a manual real-provider run.
./start.sh
```

Open **http://127.0.0.1:3001**. The application and all deterministic tests also boot with `GEMINI_API_KEY=` so reviewers can inspect the UI without spending quota; generation then fails safely with `GEMINI_NOT_CONFIGURED`.

Run the complete keyless verification gate with:

```bash
./test.sh
```

For Vite hot reload, use `npm run dev`; the frontend runs at `http://localhost:3000`, proxies `/api`, and the backend remains at `http://127.0.0.1:3001`.

## Environment

The backend reads the repository-root `.env`; explicit process variables take precedence.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | Runtime mode; `start.sh` uses production composition |
| `HOST` | `127.0.0.1` | Bind address; production validation permits loopback only |
| `PORT` | `3001` | Fastify port |
| `LOG_LEVEL` | `info` | Structured log level |
| `DATABASE_PATH` | `./data/folio.sqlite` | Private SQLite database |
| `DATA_DIR` | `./data` | Private manuscript and generated-image root |
| `GEMINI_API_KEY` | empty | Backend-only key; optional at boot, required for real generation |
| `GEMINI_TEXT_MODEL` | `gemini-3.6-flash` | Text/context model |
| `GEMINI_IMAGE_MODEL` | `gemini-3.1-flash-image` | Portrait and illustration model |
| `GEMINI_REQUEST_TIMEOUT_MS` | `120000` | One provider-request timeout |
| `STEP_LEASE_MS` | `180000` | Running-step lease |
| `HEARTBEAT_MS` | `30000` | Lease extension; must be less than half the lease |
| `SESSION_TTL_SECONDS` | `604800` | Local session lifetime |
| `MAX_SOURCE_BYTES` | `5242880` | Manuscript byte limit |
| `MAX_IMAGE_BYTES` | `15728640` | Generated-image byte limit |
| `COOKIE_NAME` | `folio_session` | Session cookie name |

Never commit `.env` or place a key in frontend code. Health responses and logs expose no secret values.

## Architecture and five-stage flow

```text
Browser ──same-origin API──> Fastify ──> SQLite
                                  ├────> private data/ filesystem
                                  └────> Gemini, only when configured
```

Fastify serves `frontend/dist` and `/api` from one loopback origin. SQLite owns identities, project/step facts, attempts, leases, fences, and artifact associations. The filesystem owns canonical source and image bytes. See [docs/architecture.md](docs/architecture.md) for the state, concurrency, and provider-context diagrams.

| Stage | Persisted result | Provider-context rule |
| --- | --- | --- |
| I. Style | selected/generated style | upload source and create book context once |
| II. Characters | one or two validated adults | continue from stored text interaction |
| III. Portraits | one independently persisted image per adult | sequential image context; retry only missing items |
| IV. Chapters | exactly one validated chapter brief | continue from stored character text context |
| V. Illustrations | exactly one final image | fresh call with style, chapter, and relevant local portraits |

The server—not the UI—enforces a maximum of **two adult characters** and **one chapter**. Later stages do not resend the manuscript.

## Persistence, Retry, and Recover

Project state survives refresh, sign-out, backend restart, and a second tab. An atomic SQLite claim allows one live attempt for the first incomplete stage. A concurrent duplicate returns the existing running state without invoking Gemini again. Every checkpoint is fenced by its active attempt ID so an abandoned runner cannot publish late data.

A provider or validation failure becomes a persisted failed step. **Retry** is the only action that starts another attempt; neither the application nor transport retries automatically, and there is no automatic model fallback. A running step whose lease expires is shown as stuck. **Recover** abandons that attempt and changes it to a failed, retryable state without making a provider call. If Gemini accepted a request immediately before process death, a later explicit retry may still incur another provider operation; local fencing cannot guarantee exactly-once upstream billing.

## Local data, privacy, and imagery

Runtime data is ignored and private:

```text
data/
├── folio.sqlite
└── users/<userId>/projects/<projectId>/
    ├── source/book.txt
    ├── portraits/
    └── illustrations/
```

Manuscripts and generated images are never static files. Authenticated owner-scoped API routes stream artifacts after path and byte validation. Session cookies are opaque, finite-lived, HttpOnly, `SameSite=Lax`, scoped to `/`, and Secure only when HTTPS is actually used.

When real generation is enabled, manuscript content is uploaded to Google’s Files API and used by the Interactions API. Use short public-domain, non-sensitive text and review provider retention for the selected account/tier. The default models are `gemini-3.6-flash` and `gemini-3.1-flash-image`; alternatives require an explicit environment override and are never selected as fallback.

The decorative images in `frontend/public/illustrations/` came from the approved pre-migration prototype and remain visual fixtures, not proof of a successful current provider run. Per-file source/license or generation provenance is not recorded in this repository and must be confirmed by the candidate before submission. New project portraits and final illustrations are attributable to the configured Gemini model through persisted provider-operation metadata.

## Local-only delivery

There is no Docker configuration and no public deployment. Docker would add packaging and filesystem/SQLite ownership complexity without improving this required single-host workflow. Horizontal operation would require a shared database, object storage, and durable job coordination; the repository does not claim those properties. Any previously hosted prototype must be decommissioned manually by the candidate and is not part of this submission.

## Health and troubleshooting

- `GET /api/health` — compatibility health
- `GET /api/health/live` — process liveness
- `GET /api/health/ready` — SQLite, migrations, writable data directory, and non-secret `geminiConfigured`

Common failures:

- **Missing key:** the server still starts; generation records `GEMINI_NOT_CONFIGURED`. Add the key only to local `.env`, restart, then explicitly Retry.
- **Billing/model access:** `MODEL_ACCESS_DENIED` or related failures mean the configured project/model is unavailable. Confirm billing and model access; do not expect fallback.
- **Quota HTTP 429:** `QUOTA_EXCEEDED` persists after one provider attempt. Wait or add quota, then click Retry; no automatic request is made.
- **Expired provider context:** `CONTEXT_EXPIRED` preserves local work and does not silently upload/regenerate. This core submission has no automatic rebuild action.
- **Stuck step:** wait for lease expiry, click Recover, then click Retry. Recover itself performs no generation.
- **Native SQLite install:** use a supported Node version and rerun `npm ci`; do not switch database implementations.

## Verification status

Implementation and deterministic verification are complete for the required local, single-host runtime: the keyless suite passes 144 tests, both npm audits report zero vulnerabilities, the built-server smoke covers direct SPA routes and private-data isolation, and the Playwright record contains 15 screenshots with 41/41 assertions and no external/provider request. See [TESTING.md](TESTING.md) and [docs/submission-checklist.md](docs/submission-checklist.md).

Submission remains blocked pending a successful paid Gemini portrait/final-image UAT. The candidate’s official-notebook preflight reached text generation, but the first image request returned HTTP 429 with free-tier image quota `0`. No successful paid portrait or final-image result is claimed.

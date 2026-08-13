# Gradion Folio Book Studio

An editorial book-illustration studio prototype, migrated from the approved vinext UI to a local npm workspace. The visible product and simulated five-stage pipeline are preserved; the runtime is now a Vite React frontend with a deliberately small Fastify foundation.

## Architecture

```text
Gradion-Folio-Book-Studio/
├── frontend/   React + Vite + TypeScript + Tailwind + TanStack Router
├── backend/    Node.js + Fastify + TypeScript + Zod
├── docs/       migration baseline, behavior inventory, and comparison
├── package.json
└── package-lock.json
```

The frontend owns the current demo behavior behind `src/lib/demo-store/`. It persists the same `gradion-folio-prototype-v2` localStorage snapshot used by the approved prototype. The backend currently exposes only `GET /api/health`, validates its environment with Zod, and binds to `127.0.0.1`.

No Gemini integration, SQLite database, real authentication, or production pipeline logic is included yet.

## Requirements

- Node.js 22.13 or newer
- npm 10 or newer

## Run locally

```bash
npm install
npm run dev
```

The workspace starts:

- Frontend: `http://localhost:3000`
- Backend: `http://127.0.0.1:3001`
- Proxied health check: `http://localhost:3000/api/health`

The application routes are:

- `/login`
- `/library`
- `/volumes/new`
- `/volumes/$volumeId`

Direct navigation, back/forward history, reload persistence, dialogs, upload/paste behavior, and all simulated pipeline states are covered by the migration capture.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The root scripts run both workspaces. Frontend tests cover identity validation, storage recovery/persistence, and a studio component; backend tests cover environment validation and the health route.

## Visual regression evidence

The accepted pre-migration screenshots are committed in `docs/baseline/before/`; migrated screenshots live in `docs/baseline/after/`. Both use `1440 × 1000` desktop and `390 × 844` mobile viewports. See `docs/baseline/behavior.md` for the interaction inventory and `docs/baseline/comparison.json` for the image comparison report.

Playwright remains a root development dependency because the capture is reusable regression coverage. Install its local Chromium binary once if needed:

```bash
npx playwright install chromium
npm run visual:after
npm run visual:compare
```

Set `PLAYWRIGHT_EXECUTABLE_PATH` to reuse an existing Chromium executable. The capture intentionally uses `http://localhost:3000`; this also supports the legacy baseline server's IPv6 localhost binding.

## Styling migration boundary

Tailwind is active in the Vite pipeline with the approved palette, typography, spacing, and shadow tokens. Utilities are used for new structural wrappers and route-level fallback UI. The parity-sensitive custom stylesheet remains in place so the migration does not redesign or simplify the approved interface; sections can be converted incrementally only after screenshot verification.

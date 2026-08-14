# Folio Book Studio — Runtime Migration Record

> Historical note: this records the original workspace migration checkpoint. Backend Phases 1–3 and the Phase 4 frontend API cutover now supersede its deliberately deferred scope; see the root README and implementation plan for the current state.

## Delivered scope

The approved single-page prototype has been migrated to a local npm workspace without redesigning its interface:

    Gradion-Folio-Book-Studio/
    ├── frontend/   React + Vite + TypeScript + Tailwind + TanStack Router
    ├── backend/    Node.js + Fastify + TypeScript + Zod
    ├── docs/       behavior and visual-regression evidence
    ├── package.json
    └── package-lock.json

At this checkpoint, the frontend exposed `/login`, `/library`, `/volumes/new`, and `/volumes/$volumeId`, with the approved demo snapshot still in localStorage. Phase 4 subsequently removed that snapshot and connected these routes to the persistent APIs.

At this checkpoint, the backend deliberately exposed only `GET /api/health`. Later phases added the session, project, pipeline, manuscript, and artifact routes while retaining Zod configuration, loopback binding, and the Vite `/api` proxy.

## Migration sequence completed

1. Captured the accepted application at `1440 × 1000` and `390 × 844`.
2. Recorded navigation, localStorage, dialogs, motion, pipeline states, and responsive behavior.
3. Committed the pre-migration evidence independently.
4. Created the root npm workspaces and migrated the approved UI to Vite.
5. Added TanStack Router without changing the stored demo schema.
6. Activated Tailwind tokens and utilities while retaining parity-sensitive custom CSS.
7. Added the Fastify health foundation, Zod environment validation, proxy, and tests.
8. Repeated the interaction suite and captured the migrated desktop/mobile evidence.
9. Removed the vinext, Next-style, Wrangler, Worker, D1, Cloudflare hosting, and obsolete starter sources.
10. Verified a clean root install, typecheck, lint, tests, build, routes, proxy, and health endpoint.

## Visual migration rule

The custom stylesheet remains the visual authority until a section has been converted and compared at the accepted viewports. Tailwind is configured with semantic tokens from the approved palette and is used for new structural UI. Future CSS conversion should remain incremental and must keep `npm run visual:after` and `npm run visual:compare` green by inspection and metrics.

## Intentionally deferred

The following were explicitly outside the migration and must not be inferred from the current demo behavior:

- Gemini or any other model integration
- SQLite or another persistent server database
- real authentication or sessions
- uploads to server storage
- production pipeline execution, concurrency, retry, or recovery logic
- deployment and hosted-environment configuration

Those capabilities are planned in [implementation-plan.md](./implementation-plan.md).

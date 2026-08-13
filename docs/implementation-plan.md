# Folio Book Studio — Runtime Migration Record

## Delivered scope

The approved single-page prototype has been migrated to a local npm workspace without redesigning its interface:

```text
Gradion-Folio-Book-Studio/
├── frontend/   React + Vite + TypeScript + Tailwind + TanStack Router
├── backend/    Node.js + Fastify + TypeScript + Zod
├── docs/       behavior and visual-regression evidence
├── package.json
└── package-lock.json
```

The frontend exposes `/login`, `/library`, `/volumes/new`, and `/volumes/$volumeId`. The approved demo snapshot remains in localStorage behind `frontend/src/lib/demo-store/`; browser history is now URL-aware and direct route loads are supported.

The backend deliberately exposes only `GET /api/health`. It validates `NODE_ENV` and `PORT` with Zod and binds to `127.0.0.1`. Vite proxies `/api` to that local service.

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

The following are explicitly outside this migration and must not be inferred from the current demo behavior:

- Gemini or any other model integration
- SQLite or another persistent server database
- real authentication or sessions
- uploads to server storage
- production pipeline execution, concurrency, retry, or recovery logic
- deployment and hosted-environment configuration

Those capabilities should be planned as separate product work after their contracts and persistence model are approved.

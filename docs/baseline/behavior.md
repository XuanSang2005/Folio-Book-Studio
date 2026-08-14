# Approved UI migration baseline

> Historical scope: the DemoStore, localStorage, and simulated-pipeline sections below describe the pre-migration baseline and are intentionally absent from the current production runtime. Current server-backed verification is recorded later in this document.

Captured from the vinext application at `http://localhost:3000` before the monorepo migration.

## Viewports and evidence

- Desktop captures use a `1440 × 1000` viewport.
- Mobile captures use a `390 × 844` viewport.
- `before/` contains Login, Library, New Volume, Studio, upload, paste, manuscript, and pipeline-state screenshots.
- `before/observations.json` records the automated assertions and runtime errors collected during capture.

## Navigation

- The baseline application has one browser URL, `/`.
- Login, Library, New Volume, and Studio are React state views; moving between them does not push browser history.
- The masthead wordmark and Library control open Library; New volume and commission controls open New Volume; project rows open Studio.
- Sign out returns to Login while retaining the entered name and email values in the stored snapshot.
- Reload restores the last persisted non-login view; a persisted Login view remains Login.

The migrated application intentionally changes the address model to the required TanStack Router paths while preserving the visible transitions and stored demo state.

## Demo persistence

- Storage key: `gradion-folio-prototype-v2`.
- The JSON snapshot contains `projects`, `userName`, `userEmail`, `activeProjectId`, and `view`.
- The sample identity is `Xuan Sang / sang@example.com` and reveals the three curated seed projects.
- A corrupt or absent snapshot falls back to curated seed data.
- Project creation prepends a new draft and makes it active.
- Pipeline stage results, portrait progress, errors, active project, and simulated identity survive reloads.

## Identity and Library

- Identity requires a non-empty full name and a syntactically valid email, focuses the failing field, and exposes inline accessible errors.
- “Use the sample library” fills the sample identity and opens the curated library.
- The Library can switch between populated and empty specimen states.
- Project status is derived as Draft, In progress, or Done from completed stage count.

## New Volume and source dialog

- New Volume requires a title and one non-empty source manuscript.
- The source dialog traps focus, closes on Escape or backdrop click, restores focus, and locks body scrolling while open.
- Upload accepts one non-empty `.txt` file; wrong extensions, empty files, unreadable files, and multiple dropped files show errors.
- A valid upload closes the dialog and shows a source receipt with filename and word count.
- Paste mode requires non-empty text and produces the same receipt boundary.
- Replace and Remove preserve the intended focus path.

## Studio and simulated pipeline

- The five manual stages are Style, Characters, Portraits, Chapter, and Illustration.
- Only the current stage can run; completed work is not regenerated automatically.
- Running locks duplicate execution and shows a progress treatment; portraits additionally advance `0 → 1 → 2`.
- Stage completion delays are approximately 1.45 seconds, or 2.1 seconds for portraits.
- Failed state exposes Retry; stuck state exposes Recover; both preserve completed artifacts.
- The final state exposes the completed plate and survives reload.
- Portrait and final-plate buttons open an image lightbox only when their artifact is ready.
- “Read the complete text” opens the read-only manuscript dialog with word count.

## Motion, dialogs, and accessibility

- Hover transitions cover buttons, underlines, image crops, stamps, and row movement.
- Running stages use the animated press line and portrait pulse; overlays fade/rise into place.
- The title mascot uses the animated WebP only when reduced motion is not requested.
- `prefers-reduced-motion: reduce` effectively removes animations and transitions.
- Overlays trap Tab/Shift+Tab, close on Escape, restore focus, and expose dialog names and live status.

## Responsive behavior

- Login changes from a two-column editorial/form composition to a stacked layout at `960px`; supporting quote, stage index, seal, and registration marks are hidden.
- Masthead navigation and account name are hidden below `960px`; the wordmark prefix is hidden below `760px`.
- Library hero, project rows, summary ledger, and empty state progressively collapse for tablet and mobile.
- New Volume proof plates, pipeline ledger, and Studio stepper become horizontally scrollable rather than widening the document.
- Studio notes, portrait cards, chapter folio, dialogs, and footer stack on mobile.
- Automated checks at `390 × 844` found no document-level horizontal overflow on Login, Library, or Studio.

## Runtime baseline

- No console errors.
- No uncaught page errors.
- No failed network requests.
- All interaction and persistence assertions in `before/observations.json` passed.

## Phase 4 server-backed verification

- `after/` repeats all 15 accepted screenshots at the identical `1440 × 1000` and `390 × 844` viewport sizes.
- `after/observations.json` records 41 passing interaction assertions with no application console errors, uncaught page errors, or failed requests. Expected browser diagnostics for unauthenticated `401` session restoration and intentional React Query/navigation aborts are classified separately.
- The harness intercepts only root `/api/**` requests with a deterministic stateful fixture. It exercises the production API client, Zod parsing, Query cache, route guards, polling, and UI mapping without localStorage seed mode, an API key, or provider traffic.
- Login creates a session; protected routes restore it; `/login` redirects an active session; sign-out deletes it. The harness confirms that no authoritative localStorage snapshot is written.
- Library values and five-stage progress come from the list DTO. New Volume creates a real paste-contract project. Upload/paste dialogs, Escape close, focus restoration, and body/dialog behavior remain intact.
- Studio exercises pending, running, complete, failed, stuck, explicit Recover-to-Retry, manuscript, authenticated portrait, and authenticated illustration states. Generated surfaces use `/api` artifact URLs; a pending final plate no longer shows a fixture image.
- The recorded stage and recovery API traces fail the capture if either action refetches manuscript or performs a redundant successful detail reconciliation.
- Mobile Login, Library, and Studio again have no document-level horizontal overflow.

`comparison.json` contains the raw perceptual pixel result for every full viewport and a second alignment measurement that searches only for a vertical offset. It does not scale, recolor, crop, or otherwise transform either image. Raw differences include the Phase 4 requirements to remove the sample-library control, prototype copy, fixture-generated pending imagery, and simulated footer wording; DTO content and historical click/scroll positions also change pixels. Unchanged desktop compositions such as New Volume, Library, failed, and stuck remain within roughly 3.5–5.6% raw difference. Visual inspection confirms the approved type treatment, palette, rules, spacing, cards, dialogs, imagery, responsive collapses, and animation states. The retained custom CSS remains the parity authority.

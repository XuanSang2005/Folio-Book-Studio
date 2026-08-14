# Submission checklist

Status date: 2026-08-14. Implementation and deterministic verification are complete for the required local, single-host runtime. Submission remains blocked pending a successful paid Gemini portrait/final-image UAT; “verified” below does not mean that real-provider gate succeeded.

## Complete and verified

| Deliverable or requirement | Evidence |
| --- | --- |
| Reviewer README, environment example, start/test commands | `README.md`, `.env.example`, executable `start.sh` and `test.sh` |
| Final testing and engineering-decision records | `TESTING.md`, `DECISIONS.md` |
| AI-workflow artifact index and notebook observations | `docs/ai/README.md`, `docs/ai/notebook-observations.md` |
| Architecture and agent invariants | `docs/architecture.md`, `AGENTS.md` |
| Five ordered stages and server caps | shared contracts, database constraints, domain validation, contract/pipeline tests |
| Persistence and resumability | SQLite migrations, private local files, restart and partial-checkpoint tests |
| Duplicate execution protection | atomic claim, live-duplicate, two-instance concurrency, and fencing tests |
| Explicit failure Retry and expired-lease Recover | pipeline service plus backend/frontend state tests |
| Source/context cost discipline | fake full-run and resume tests prove one source upload and context reuse |
| Local-only release and private artifacts | Fastify static/API isolation, owner-scoped artifact routes, smoke and security tests |
| Keyless verification | 144 tests, build, both zero-vulnerability audits, built-server smoke |
| Visual behavior | 15 captures and 41/41 assertions at desktop/mobile viewports |

## Candidate manual action required

- Export the complete Codex prompt/transcript history into `docs/ai/` if the assessment expects full transcripts. The repository contains genuine, explicitly labeled prompt excerpts only.
- Review the first-person authorship and motivation paragraphs in `DECISIONS.md`; they are grounded in the recorded implementation history but must remain the candidate’s own wording.
- Confirm and document the origin/license or generation provenance of the approved static prototype imagery in `frontend/public/illustrations/`. The repository does not contain per-file provenance records.
- Use candidate-controlled Git tools to verify the intended files are tracked, inspect the final diff, run a whitespace check, and create the required small commits with honest AI-assistance notes. No automation in this task inspected or changed Git history.
- Remove or exclude local `.env`, `data/`, SQLite sidecars, build output, and temporary files before packaging. The clean-room rehearsal excludes these successfully.
- Decommission any previously hosted public prototype manually before submission and confirm no deployment link is supplied. This task performed no external unpublish action.

## Blocked until paid Gemini portrait/final-image UAT

The project is not fully submission-ready. The candidate’s notebook image attempt returned HTTP 429 because the account reported zero image quota. Portrait generation and the final illustration have not succeeded against the real provider.

After billing and model access are available, the candidate must perform this bounded manual UAT—there is intentionally no spend-capable script:

1. Put the key only in local `.env`.
2. Use a short public-domain manuscript.
3. Start with `./start.sh`.
4. Create a fresh user and project.
5. Run Style through Illustration manually.
6. Verify no more than two adult characters and one chapter.
7. Verify each portrait appears individually.
8. Verify one final illustration is stored and served locally.
9. Confirm the source upload occurs once.
10. Confirm no automatic retry or model fallback occurs.
11. Test refresh and a second tab during one running step.
12. Record model IDs, date, per-stage duration, provider-operation count, image count, and result.
13. Redact the API key, manuscript, cookies, and full provider IDs.
14. Update `TESTING.md` and `DECISIONS.md` only with real observations.
15. Remove generated private runtime data before submission.

## Optional / not required

- Public deployment, Docker, CI/CD, Redis, queues, cloud object storage, SSE, and horizontal scaling are intentionally outside this local assignment.
- Attempt-history UI and automatic remote-context rebuilding are post-core ideas; neither is needed for submission.

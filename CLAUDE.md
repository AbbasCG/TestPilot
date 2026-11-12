# TestPilot continuation contract

Read docs/IMPLEMENTATION_STATUS.md, docs/CLAUDE_HANDOFF.md and docs/REQUIREMENTS_TRACEABILITY.md first. Read the complete docs/MASTER_REQUIREMENTS.md once the user supplies the missing PHASE 0–22 source; its current placeholder does not constitute the official reference.

Preserve the independent D:\Projects\TestPilot workspace. Never change Tharaa, EMC, LifeOS, global PATH, XAMPP configuration, DNS, or production services. No deployment without authorization. Never stage `.local/`, `.env`, vendor, node_modules, screenshots/traces or database data. Stage explicit paths, not `git add .`.

Stack: Laravel 13, PHP 8.3, Sanctum stateful session cookies; React 19, TypeScript, Vite, Tailwind 4, Router, TanStack Query, RHF/Zod; PostgreSQL 18. Preserve lockfiles. Runtime versions and commands are documented in DEVELOPMENT_SETUP.md.

Project membership is the authorization boundary. Use policies on every nested operation, derive project identity server-side, validate all cross-entity associations, use transactions and optimistic versions. Never conflate a project role with the future Tester A/B scenario role. Do not retrofit an unscoped generic CRUD endpoint over project resources.

Keep Arabic RTL, actual API data, accessible forms, responsive layout and light/dark themes. Do not add inactive navigation or pretend future features exist. Split frontend pages into modules as the domain expands; the current App.tsx contains the initial small set of routes.

After meaningful changes: PostgreSQL backend tests, TypeScript, lint, build, relevant Playwright checks. Keep status and handoff evidence current. Never mark a milestone complete based only on the initial scope when the authoritative reference is missing.

## Git and GitHub policy (owner decision 2026-11-12)

Remote: https://github.com/AbbasCG/TestPilot (public). Follow docs/GIT_WORKFLOW.md in every session:
1. Start by checking `git status`, branch, recent log, worktrees and remote.
2. Branch `feature/*` or `fix/*` from `dev`; implement; run the relevant tests.
3. Commit clearly (explicit paths, owner identity, no AI attribution), push the task branch, open a PR into `dev` with an Arabic description.
4. Merge into `dev` only after checks, review and owner approval; push `dev`.
5. Keep exactly one open `dev` → `main` PR: open it if missing, otherwise update its description.
6. Never merge into `main` without the owner's approval. No force push, no history rewrite, no deployment.
Never push failing or incomplete work as ready, secrets, build output, `.local/` or backups. The Thmanyah fonts in frontend/src/assets/fonts/thmanyah/ are committed with the owner's permission (2026-11-12); do not modify or rename them.

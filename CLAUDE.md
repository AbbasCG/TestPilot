# TestPilot continuation contract

Read docs/IMPLEMENTATION_STATUS.md, docs/CLAUDE_HANDOFF.md and docs/REQUIREMENTS_TRACEABILITY.md first. Read the complete docs/MASTER_REQUIREMENTS.md once the user supplies the missing PHASE 0–22 source; its current placeholder does not constitute the official reference.

Preserve the independent D:\Projects\TestPilot workspace. Never change Tharaa, EMC, LifeOS, global PATH, XAMPP configuration, DNS, or production services. No deployment, remote creation or push without authorization. Never stage `.local/`, `.env`, vendor, node_modules, screenshots/traces or database data. Stage explicit paths, not `git add .`.

Stack: Laravel 13, PHP 8.3, Sanctum stateful session cookies; React 19, TypeScript, Vite, Tailwind 4, Router, TanStack Query, RHF/Zod; PostgreSQL 18. Preserve lockfiles. Runtime versions and commands are documented in DEVELOPMENT_SETUP.md.

Project membership is the authorization boundary. Use policies on every nested operation, derive project identity server-side, validate all cross-entity associations, use transactions and optimistic versions. Never conflate a project role with the future Tester A/B scenario role. Do not retrofit an unscoped generic CRUD endpoint over project resources.

Keep Arabic RTL, actual API data, accessible forms, responsive layout and light/dark themes. Do not add inactive navigation or pretend future features exist. Split frontend pages into modules as the domain expands; the current App.tsx contains the initial small set of routes.

After meaningful changes: PostgreSQL backend tests, TypeScript, lint, build, relevant Playwright checks. Keep status and handoff evidence current. Never mark a milestone complete based only on the initial scope when the authoritative reference is missing.

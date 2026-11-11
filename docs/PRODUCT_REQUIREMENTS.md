# Product requirements

TestPilot is an independent Arabic RTL SaaS quality platform for multiple projects, including but not restricted to Tharaa, EMC and LifeOS. Data and permissions must be isolated by project. It must be a persisted application, not a mock dashboard.

## Source priority

1. User instructions and corrections in this chat.
2. Official PHASE 0–22 reference, designated authoritative but not yet supplied. MASTER_REQUIREMENTS.md clearly marks this gap.
3. FOUNDATION_REQUEST.md, preserved verbatim from the original attachment.

## Authorized milestones from the available source

- M1: Laravel, React, dedicated PostgreSQL, authentication, roles, architecture, design tokens, shell/sidebar/topbar, Arabic RTL, themes and error handling.
- M2: create/edit/list/detail projects, environments, project members and permissions, dashboard using real data.
- M3: suites, cases, prerequisites, expected results, steps, Tester A/B roles, scenario builder, templates, creation/editing/reordering, project/environment/test associations.
- M4 after M1–M3: test runs, participants, step assignments, shared checkpoints, per-tester step results, persistence, activity history and a real two-person integration test.
- M5–M8: retained in the roadmap; exact requirements await the complete authoritative reference. No features are assumed or discarded.

## Security acceptance

Migrations, foreign keys, indexes, uniqueness, hashed passwords, sessions, throttling, project isolation, validation, audit history, private files and safe concurrent writes. Prove project A users cannot access project B tests and tester B cannot mutate tester A results when those entities are implemented. Current tests prove the foundation project isolation and role restrictions only.

## Required screens

Login, dashboard, projects, project wizard, overview, suites, scenario builder, case detail, collaborative runner, team and settings. The last three testing-domain screens plus suites remain pending; no placeholder navigation advertises them as usable.

## Operations

Hetzner VPS, qa.softbuild.nl, private independent PostgreSQL, one origin serving SPA and API, workers/scheduler, private persistent storage, secrets, HTTPS, health checks, backups, rollback and deployment logs. Prepare only; no DNS changes or deployment. Do not disturb existing VPS services.

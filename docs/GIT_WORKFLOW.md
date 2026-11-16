# Git workflow — TestPilot

Repository: https://github.com/AbbasCG/TestPilot (remote `origin`).

## Branches

| Branch | Role |
|---|---|
| `main` | Stable release line. Changes arrive only through a reviewed PR from `dev`, merged by the owner. |
| `dev` | Development and integration. Every finished task lands here first. |
| `feature/<topic>` | New functionality, branched from `dev`. |
| `fix/<topic>` | Bug fixes, branched from `dev` (hotfixes for `main` only with explicit owner approval). |

Flow: `feature/*` or `fix/*` → PR → `dev` → PR → `main`.

Local-only branches such as `backup/*` and `claude/*` are never pushed.

## Every development session

1. Check the state first: `git status`, `git branch -vv`, `git log --oneline -5`, `git worktree list`, `git remote -v`. Stop and report anything unexpected (uncommitted work you did not create, a diverged branch).
2. Update `dev` (`git fetch origin` and `git switch dev` then `git pull --ff-only`) and branch from it: `git switch -c feature/<topic>`.
3. Make the change. Keep commits focused.
4. Run the relevant checks (see DEVELOPMENT_SETUP.md): PostgreSQL backend tests, Pint, TypeScript, lint, build, and the affected Playwright specs. Run the full Playwright suite before a PR to `main`.
5. Commit with a clear Conventional Commit message. Stage explicit paths; never `git add .`. Author and committer must be the owner's configured identity; no AI attribution trailers or signatures.
6. Push the task branch: `git push -u origin feature/<topic>`.
7. Open a PR into `dev`. Description in Arabic, using the template below.
8. After CI passes, review and owner approval, merge it into `dev`, then push `dev`.
9. If no `dev` → `main` PR is open, open one. If one is open, it updates automatically with the new `dev` commits; update its description (results, risks, notes) instead of creating a duplicate.
10. Never merge into `main` without the owner's explicit approval. Never deploy as part of this flow.
11. After a `dev` → `main` PR is merged, do **not** delete `dev` (GitHub offers a "Delete branch" button). Fast-forward `dev` to `main` (`git merge --ff-only origin/main`, then push) before starting the next task. Task branches may be deleted after merge.

Never: force push, `git reset --hard`, `git clean -fd`, rewriting published history, pushing failing or incomplete work as ready, or committing secrets, `.env`, `.local/`, `vendor/`, `node_modules/`, `dist/`, test artifacts, or database dumps. The Thmanyah font files are committed with the owner's permission; keep them unmodified.

## Pull request description (Arabic)

```
## ملخص التحديث
## التغييرات الرئيسية
### الخلفية (Backend)
### الواجهة (Frontend)
### قاعدة البيانات
### الاختبارات
## نتائج التحقق
PHPUnit / PostgreSQL / Playwright / TypeScript / ESLint / Build
## الجوانب الأمنية
الصلاحيات، عزل المشاريع، الملفات الخاصة، التحقق من المدخلات
## ملاحظات
الوظائف غير المكتملة والمشكلات المعروفة
## قائمة المراجعة
- [ ] مراجعة الشيفرة
- [ ] نجاح الاختبارات
- [ ] التحقق من قاعدة البيانات
- [ ] مراجعة الواجهة
- [ ] الموافقة على الدمج
```

## Branch used for user management (2026-11-13)

`feature/user-management` from `dev` → PR into `dev` (Arabic description) → rolling PR `dev` → `main` after approval.

## Continuous integration

`.github/workflows/ci.yml` runs on pushes to `main`/`dev` and on every PR: Pint, PostgreSQL 18 backend tests, ESLint/oxlint, TypeScript, Vite build (asserting all seven Thmanyah faces are bundled), and Playwright in Chromium against an isolated `testpilot_e2e` database. It needs no repository secrets; the database password is a CI-only value.

## Authentication

Pushes use the owner's Git Credential Manager login. Tokens are never written into the repository, remotes, docs or logs.

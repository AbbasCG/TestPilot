# TestPilot frontend

React/TypeScript Arabic RTL application. Product source is in src/, real API fetch in src/api.ts, browser checks in e2e/.

See ../README.md and ../docs/DEVELOPMENT_SETUP.md for setup and private PostgreSQL requirements.

Commands: npm run dev, npm run typecheck, npm run lint, npm run build, npm run test:e2e.

Local browser checks use installed Chrome, isolated TestPilot test accounts, API port 8001 and frontend port 5174. The normal development frontend uses 5173 and proxies to 8000.

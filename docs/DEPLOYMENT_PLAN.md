# Hetzner deployment plan — preparation only

Target: https://qa.softbuild.nl. No VPS login, DNS change, certificate issuance, deployment, port change or modification of another service has been performed.

## Prepared assets

`infra/compose.yaml`, API PHP-FPM and web multi-stage Dockerfiles, internal Nginx, reviewed-host edge Nginx example, PostgreSQL init script creating an application role without superuser privileges, secret example and DB backup script. Project-scoped volumes/networks. PostgreSQL has **no published port**; only web binds an adjustable loopback port (8088 by example). Existing host Nginx terminates HTTPS and proxies to that port. A containerized existing proxy may instead need an approved shared network; do not change it blindly.

PostgreSQL 18 volume mounts at `/var/lib/postgresql`, consistent with the official image: https://hub.docker.com/_/postgres. App, worker and scheduler share private storage, never served by Nginx. Administrator database password is passed only to the database container; app gets its own role secret. The role initialization script only runs on an empty volume; rotating the environment value later does not rotate an existing database password.

## Before any approved deployment

1. Inventory current VPS OS/resources, Docker, Nginx, n8n and other services, listeners, networks, volumes, firewall and certificate management read-only. Check disk and backup capacity.
2. Confirm port/network choice without altering existing services. Confirm isolated DB location on Hetzner. Current Compose defines a dedicated DB container on the VPS; a separate DB host requires private-network credentials and a revised configuration.
3. Choose immutable image tags/digests, build and scan images, run migration/restore/smoke rehearsal in staging. Local Docker runtime was unavailable: **image build, Nginx runtime and container health remain unverified**.
4. Copy `.env.example` privately to `infra/.env` with mode 600, set unique APP_KEY, DB_PASSWORD, POSTGRES_ADMIN_PASSWORD, origin and stateful hostname. Preserve APP_KEY across releases. Do not commit secrets. Do not dump expanded Compose configuration into logs.
5. Configure DNS and Let's Encrypt only after explicit authorization. Check existing certbot renewal/HTTP-01 or DNS-01 setup. Validate `nginx -t`, then reload only approved configuration. Test HTTPS and renewal before enabling strict HSTS.

## Release sequence (future, not executed)

Use the explicit TestPilot Compose project and a recorded RELEASE_TAG. Record UTC timestamp, operator, git commit, image digests, migration status and health result to a private deployment log. Back up DB/storage before migrations. Start database/API, run `php artisan migrate --force` as a one-off app container, then start web/worker/scheduler. Verify `/up`, `/api/health`, browser CSRF/login/logout, a project mutation, queued heartbeat and scheduler. Do not expose FPM directly. Cache configuration only after runtime secrets are injected; never bake secrets into images.

Single-origin routing: `/` React; `/api/*`, `/sanctum/csrf-cookie`, `/up` Laravel. APP_URL and SANCTUM_STATEFUL_DOMAINS configure the public origin. Session cookie host-only, HttpOnly, Secure, SameSite=Lax; frontend decodes CSRF cookie and sends the X-XSRF-TOKEN header. CORS allows no cross-origin clients. Internal Nginx declares HTTPS to FPM because only the approved TLS edge can reach it; do not use this production config as a plain-HTTP public endpoint.

## Backup and restore

Run `infra/backup.sh` from infra with a pre-existing private destination to produce a custom-format PostgreSQL dump atomically. Schedule daily after a restore drill, encrypt off-host copies and define retention (proposed 7 daily/4 weekly/6 monthly, owner to confirm). Add private-storage backups when uploads exist; preserve APP_KEY securely alongside recovery procedures. Backup script is prepared but not executed against production. Do not use destructive automatic cleanup before retention policy approval.

Restore into a NEW isolated database/volume, never directly over live production. Use matching-major pg_restore with exit-on-error, validate counts/FKs/login/project isolation and files. Record recovery time and data-loss window. This restore drill is still pending.

## Rollback and monitoring

Keep previous tagged API/web images and release metadata. Revert application images only when migrations remain backward compatible; prefer expand/contract migrations. Do not blindly run migrate:rollback. For incompatible schema changes, require a documented restore plan and explicit approval for potential data loss. Retain backups before attempting it.

Health checks: DB pg_isready; API FPM socket; web DB-aware endpoint. Process restarts: unless-stopped, worker periodic recycle. Queue heartbeat is cached every five minutes; alerts/monitoring and log rotation are still pending. Capture deployment logs without credentials, set Docker log size/retention before production.

Current readiness: Compose syntax validated with dummy secrets; no container build, TLS test, backup restore drill or remote deployment. CI definition exists locally but has not run on GitHub. Application M3–M4 and master-reference alignment are prerequisites to claiming product readiness.

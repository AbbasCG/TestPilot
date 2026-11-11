# TestPilot API

Laravel 13 / PHP 8.3 / Sanctum sessions / PostgreSQL. This directory is the API, not the product frontend.

Read ../README.md, ../docs/DEVELOPMENT_SETUP.md and ../docs/API_REFERENCE.md.

Run php artisan serve --host=127.0.0.1 --port=8000. Provision accounts with php artisan testpilot:user <email> --name=<name>. There are no production default credentials.

Use ../infra/test-postgres.ps1 for PostgreSQL verification. Default php artisan test runs SQLite in memory. Never run RefreshDatabase on the development database.

The original Laravel welcome page and backend asset scaffold remain unused by the React application. Use frontend/ for the UI, not this directory's scaffold npm scripts.

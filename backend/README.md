# Backend

This app's backend is the Next.js app at the repo root (`src/app/`), not a separate
service — it's deployed to Substrait as a single "backend-only" container
(`cicd/Dockerfile.backend`) that serves both pages and the `/api`/`/health` routes on
one port. This directory exists only because the Substrait deploy tooling expects a
`backend/` directory to be present; there's no code here to run.

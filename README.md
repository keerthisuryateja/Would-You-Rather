# Would You Rather

Production-ready React + Vite poll app where users vote between two options and immediately see community results.

## Features

- Clean, responsive UI with animated vote results
- Supabase-backed live question and vote storage
- Live-only polling mode (no fake local vote data)
- CI quality checks (lint + build) on pull requests and main branch
- GitHub Pages deployment through GitHub Actions

## Tech Stack

- React 19
- Vite 8
- Supabase JavaScript client
- ESLint 9
- GitHub Actions

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Create local env file:

```bash
cp .env.example .env
```

3. Add values in `.env`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

4. Start development server:

```bash
npm run dev
```

## Quality Checks

```bash
npm run lint
npm run build
```

## Deploy (GitHub Pages)

Deployment runs from `.github/workflows/deploy.yml`.

- Pull requests to `main` run CI only.
- Pushes to `main` run CI, then deploy to Pages.
- Workflow build injects `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` so deployed Pages uses live Supabase data.

Repository Pages should be configured as:

- Source: `GitHub Actions`

Because this is a project page, Vite base is set to `/Would-You-Rather/` in `vite.config.js`.

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as repository secrets in GitHub Actions.

## Security Notes

- `.env` is ignored by git.
- If secrets were ever committed in history, rotate them at provider level.

## Setup Checklist

See `SETUP_CHECKLIST.md` for the complete Supabase SQL setup, GitHub Actions variables, and verification steps.

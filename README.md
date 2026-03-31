# Would You Rather

A React + Vite app where players choose between two options and see community vote totals from Supabase in real time.

## Concepts Used

- React hooks: `useState`, `useEffect`, `useMemo`, `useCallback`
- Stateful UI flows: loading, live/offline mode, voted state, category state
- Optimistic updates: vote UI updates immediately, then syncs with Supabase
- Backend integration: Supabase table queries + RPC vote increment fallback
- Derived state: vote percentages and filtered category question sets
- Responsive design: mobile-first layout with fixed header/footer and fluid cards
- CI/CD: GitHub Actions lint/build/deploy to GitHub Pages

## Features

- Live question fetch from Supabase `questions` table
- Live vote sync with RPC (`increment_vote`) or update fallback
- Category tabs: Daily, Wild, School, Party
- Graceful category fallback: if a category has no matching rows, app shows mixed live questions instead of a dead-end screen
- Live mode toggle: controls whether votes are pushed to Supabase
- Pop-art editorial UI with responsive behavior

## Project Structure

- `src/App.jsx`: main app logic, data fetch, voting, category filtering, UI states
- `src/supabaseClient.js`: Supabase client setup and env validation
- `src/App.css`: custom styling, utility classes, animations
- `index.html`: fonts, Tailwind runtime config, favicon links
- `.github/workflows/deploy.yml`: CI + Pages deployment pipeline

## Supabase Setup

Required environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Expected table:

- `questions`
	- `id` (int, primary key)
	- `option_one` (text)
	- `option_two` (text)
	- `votes_one` (int)
	- `votes_two` (int)

Optional RPC used by app:

- `increment_vote(row_id int, col_name text)`

If RPC is missing, app automatically falls back to standard `update` queries.

## Run Locally

1. Install packages:

```bash
npm install
```

2. Create `.env` and add Supabase values:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

3. Start dev server:

```bash
npm run dev
```

4. Quality checks:

```bash
npm run lint
npm run build
```

## Deployment

This repo deploys to GitHub Pages through GitHub Actions.

- PRs to `main`: run CI checks
- Push to `main`: run CI then deploy

For project pages, Vite base is configured for `/Would-You-Rather/`.

## Notes

- `.env` must stay gitignored.
- Use only public client keys in frontend (`VITE_*`).
- Never expose Supabase service role key in client code.

For full end-to-end setup validation, see `SETUP_CHECKLIST.md`.

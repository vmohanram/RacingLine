# F1 Paper Track Vision System

F1 Paper Track Vision System lets drivers upload or draw a racing line on a paper circuit, simulate the lap, generate AI coaching, and persist runs to Supabase for leaderboard and report playback.

## Stack

- Vite + React + TypeScript frontend
- Vercel API routes in `api/`
- Gemini for coaching feedback
- Supabase Postgres for lap runs
- Supabase Storage for uploaded racing-line photos

## Local Development

Prerequisites:

- Node.js 20+

1. Install dependencies:
   `npm install`
2. Create `.env.local` with:
   `GEMINI_API_KEY`
   `SUPABASE_URL`
   `SUPABASE_SERVICE_ROLE_KEY`
   `SUPABASE_STORAGE_BUCKET`
3. Run the app locally:
   `npm run dev`
4. Typecheck the project:
   `npm run lint`

## Environment Variables

Add these both locally and in Vercel project settings:

- `GEMINI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`

Use raw values in Vercel without surrounding quotes.

## Supabase Setup

Create a bucket named `racing-line-uploads`.

Create the `lap_runs` table in the Supabase SQL editor:

```sql
create extension if not exists pgcrypto;

create table if not exists public.lap_runs (
  id uuid primary key default gen_random_uuid(),
  driver_name text not null,
  track_id text not null,
  lap_time numeric not null,
  avg_speed numeric not null,
  max_speed numeric not null,
  max_g numeric not null,
  throttle_ratio numeric not null,
  braking_points_count integer not null,
  average_deviation numeric not null,
  ideal_lap_time numeric not null,
  summary_points jsonb not null,
  coaching_text text,
  source_image_url text,
  created_at timestamptz not null default now()
);

create index if not exists lap_runs_track_lap_time_idx
on public.lap_runs (track_id, lap_time);

create index if not exists lap_runs_created_at_idx
on public.lap_runs (created_at desc);
```

## Deploy To Vercel

1. Import the Git repository into Vercel.
2. Set the root directory to the RacingLine project if needed.
3. Use these project settings:
   Install Command: `npm install`
   Build Command: `npm run build`
   Output Directory: `dist`
4. Add the required environment variables in Vercel.
5. Deploy.

## Notes

- Uploaded-photo runs store a `source_image_url` in Supabase Storage.
- Digital runs intentionally leave `source_image_url` as `null`.
- `summary_points` should be populated for both digital and uploaded runs once the latest frontend payload is deployed.

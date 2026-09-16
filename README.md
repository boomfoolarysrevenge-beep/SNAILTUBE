# SnailTube

## Run locally

```sh
npm install
npm start
```

Without Supabase variables, the server uses `videos.json` and `uploads/` as a local fallback.

## Supabase setup

1. Create a Supabase project and a public Storage bucket named `videos`.
2. Run this SQL in the Supabase SQL editor:

```sql
create table public.videos (
	id uuid primary key,
	title text not null,
	format text not null default 'Full video',
	category text not null default 'People & blogs',
	storage_path text not null unique,
	created_at timestamptz not null default now()
);

create table public.comments (
	id uuid primary key,
	video_id uuid not null references public.videos(id) on delete cascade,
	author text not null default 'You',
	text text not null,
	created_at timestamptz not null default now()
);
```

3. Copy `.env.example` to `.env` and fill in the project URL and service-role key.
4. Start the server with `npm start`.

The server uses the service-role key only on the backend. Never expose it in browser code or commit `.env`.

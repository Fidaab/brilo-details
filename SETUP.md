# Brilo Details: turn on shared live data (Supabase)

The app works right now in **local mode** (data stays on each device). To make
data **shared and real-time across every device**, connect Supabase. One-time setup,
~10 minutes.

## 1. Create the project
1. Go to https://supabase.com and sign in (GitHub login works).
2. **New project** → name it `brilo`, set a database password (save it), pick the
   region closest to you, Free plan. Wait ~2 minutes for it to provision.

## 2. Create the tables
1. Left sidebar → **SQL Editor** → **New query**.
2. Open [`schema.sql`](./schema.sql), copy all of it, paste into the editor, click **Run**.
3. You should see "Success. No rows returned."

## 3. Get your keys
1. Left sidebar → **Project Settings** (gear) → **API**.
2. Copy:
   - **Project URL** (e.g. `https://abcdxyz.supabase.co`)
   - **Project API keys → `anon` `public`** (a long token)

## 4. Plug them in
Edit [`config.js`](./config.js) and replace the placeholders:

```js
window.BRILO_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT.supabase.co",
  supabaseAnonKey: "YOUR-ANON-PUBLIC-KEY"
};
```

Commit and push. GitHub Pages redeploys in ~1 minute. The header subtitle will read
**"Mobile detailing · Live"** when cloud mode is active, and changes made on one
device (a booking, a review, a status change) appear on all others in real time.

## Notes
- The `anon public` key is safe to commit; it is meant to be public.
- This demo uses permissive row-level security so anyone with the link can read/write.
  Fine for a personal/demo app; tighten the policies in `schema.sql` before any real use.

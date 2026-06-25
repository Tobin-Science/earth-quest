# Earth Quest — go-live checklist (Derek)

The code is done. These are the external steps to wire it up — the **same
playbook you already ran for Science Quest**, just with Earth-Quest names.
Do it all in **TEST mode** first, run the end-to-end test at the bottom, then
flip to LIVE.

---

## 1. Supabase — tables (one-time)
Same Supabase project as Science Quest / the hub. Open **SQL Editor**, paste
and run this. (Science Quest's `quest_*` tables are untouched — these are new
`eq_*` tables.)

```sql
-- Earth Quest: owners (teachers) + their 150 codes each.
create table if not exists eq_owners (
  id uuid primary key default gen_random_uuid(),
  access_token text unique not null,
  email text,
  source text default 'purchase',          -- 'purchase' or 'district'
  stripe_customer text,
  stripe_payment_intent text,
  created_at timestamptz default now()
);
create index if not exists eq_owners_email_idx on eq_owners (lower(email));
create index if not exists eq_owners_pi_idx    on eq_owners (stripe_payment_intent);

create table if not exists eq_codes (
  code text primary key,                    -- e.g. EARTH-7K2PX
  owner uuid references eq_owners(id) on delete cascade,
  label text,                               -- optional student name
  activated_at timestamptz,                 -- set when a seat is first used
  created_at timestamptz default now()
);
create index if not exists eq_codes_owner_idx on eq_codes (owner);

-- Lock the tables down. No public policies => no public access.
-- The server uses the SERVICE ROLE key, which bypasses RLS.
alter table eq_owners enable row level security;
alter table eq_codes  enable row level security;
```

## 2. Supabase — private bucket (one-time)
- **Storage → New bucket → name it `earthquest`** → **Private** (NOT public).
- Upload these 3 files into the bucket (exact names):
  | Upload this file from your Earth Quest folder | as | 
  |---|---|
  | `earth_quest.html` | **`game.html`** |
  | `earth_quest_leaderboard.html` | **`leaderboard.html`** |
  | `guide.pdf` (the Strategy Guide — see note) | **`guide.pdf`** |
- To push a game update later, just re-upload `game.html` (reaches students within ~1 hour).

> The game's art/music/cutscenes are **public static files in the repo** (see
> step 5), so the bucket only holds the 3 protected files above. The game HTML
> stays gated; only the bulky art/audio is public.

## 3. Stripe — product, price, webhook
- **Products → New** → "Earth Quest" → one-time price **$19.99** → copy the
  **price id** into `STRIPE_PRICE_EARTHQUEST`. (Make it in TEST first, then
  again in LIVE at launch.)
- **Developers → Webhooks → Add endpoint** → URL
  `https://<your-earth-quest-domain>/api/webhook` → event
  **`checkout.session.completed`** → copy the signing secret into
  `STRIPE_WEBHOOK_SECRET`.

## 4. Vercel — new project
- Create a **new** Vercel project from this repo (separate from Science Quest).
- Add all env vars from `ENV_SETUP.md`. Reuse the hub's `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM`.
- Set `SITE_ORIGIN` to the deployed URL.
- Add the subdomain **`earthquest.tobinscience.com`** (Vercel → Domains; add
  the CNAME it gives you at your DNS host).

## 5. Two images still needed (graceful if missing, but do add them)
Save into the **repo root** (and re-deploy):
- `eq_icon.png` — favicon / tab icon.
- `eq_banner.png` — the wide store banner (used as the sales-page hero, the
  play-page crest, and the trailer poster).
Until they exist, the pages just hide those images (no broken-image icons).

## 6. End-to-end test (TEST mode, before going live)
1. Open the site root → **Buy** → pay with Stripe test card `4242 4242 4242 4242`.
2. `welcome.html` should show your dashboard link; the same link is emailed.
3. Dashboard shows **150 `EARTH-` codes**. Paste a roster → names fill codes.
4. Open `play.html`, enter one code → **Enter the game** → the game loads with
   all art, music, and cutscenes (the `<base href>` injection working).
5. Re-enter the same code → "Welcome back! Same seat." (no second seat used).
6. **Reset for new year** → seats/labels clear.
7. `recover.html` with the buyer email → link re-emailed.
8. `district.html` with an `@cherokeek12.net` email → activation link → free
   dashboard, no charge.
9. Open **Hall of Champions** and **Strategy Guide** from the dashboard.

## 7. Go live
Swap the 3 Stripe env vars to LIVE values (secret key, price id, webhook
secret). No code change. Optionally list on TPT.

---
### Notes / flags
- **Repo size ~205MB** (Images 114M, trailer 70M, Soundtrack 20M). It pushes
  and deploys fine, but it's chunky — if updating art often becomes painful,
  we can move the asset tree to a public Supabase bucket and point
  `ASSETS_BASE` at it instead (keeps the repo lean).
- **Trailer (70MB)** is self-hosted. The sales page uses `preload="none"` so it
  only downloads when played. Can move to YouTube later to lighten it.
- `guide.pdf` = the generated **Earth Quest Strategy Guide** (in your Earth
  Quest folder). Upload it to the bucket in step 2.

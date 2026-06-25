# Earth Quest — environment variables

These go in the Vercel project's settings (and a local `.env` if testing
locally). All are env-var'd so the test -> live switch needs no code change.
This mirrors the Science Quest setup — same Supabase project, same Stripe
account, just new Earth-Quest-specific values.

## Now (TEST / sandbox mode)
| Variable | Value | Where it comes from |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` | Stripe sandbox → Developers → API keys (SECRET — Derek adds) |
| `STRIPE_PRICE_EARTHQUEST` | `price_…` | the **Earth Quest** test product/price (make a new one) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` | created when you register the webhook (Stripe → Webhooks) |
| `SUPABASE_URL` | `https://fmbdoxfkjldvpkyryqlx.supabase.co` | **same project as Science Quest / the hub** |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_…` | Supabase → Project settings → API (SECRET — Derek adds) |
| `SITE_ORIGIN` | the Earth Quest site URL (e.g. `https://earthquest.tobinscience.com` or the `…vercel.app` URL while testing) | set after the Vercel project exists |
| `ASSETS_BASE` | *(optional)* defaults to `SITE_ORIGIN` | only set this if you host the game art/music somewhere other than this site |
| `RESEND_API_KEY` | `re_…` | Resend → API Keys (welcome / recovery emails; email is skipped if unset) |
| `RESEND_FROM` | e.g. `Earth Quest <hello@tobinscience.com>` | optional; defaults to `onboarding@resend.dev` (test sender only delivers to your own Resend account email — a VERIFIED DOMAIN is required to email real buyers) |

## At launch (LIVE mode)
Swap to: `STRIPE_SECRET_KEY` = `sk_live_…`, `STRIPE_PRICE_EARTHQUEST` = the
LIVE price id, `STRIPE_WEBHOOK_SECRET` = the LIVE webhook secret. Everything
else stays the same.

## Endpoints
- `POST /api/create-checkout` — starts the $19.99 one-time checkout.
- `POST /api/webhook` — Stripe → us; on purchase, makes the owner + 150 codes.
  Register in Stripe for the single event **checkout.session.completed**.
- `GET  /api/game?code=EARTH-XXXXX` — serves the protected game (from the
  private bucket) with a `<base href>` injected so its art/music load.
- `GET  /api/teacher-file?token=…&asset=leaderboard|guide` — teacher files.
- `GET|POST /api/district` — Cherokee County free-access flow.

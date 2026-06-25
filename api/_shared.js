// =====================================================================
// Shared helpers for the Earth Quest standalone backend.
// Faithful port of the Science Quest backend (same proven style: Web-
// standard handlers, Stripe + service-role Supabase, env-var'd so the
// test -> live switch needs no code change). Earth-Quest-specific bits:
// EARTH- code prefix, eq_owners/eq_codes tables, the "earthquest" bucket,
// the earth_quest product tag, and ASSETS_BASE for the game <base> inject.
// =====================================================================
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const PRICE_EARTHQUEST = process.env.STRIPE_PRICE_EARTHQUEST;
export const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
export const SITE_ORIGIN = process.env.SITE_ORIGIN || '';

// Where the game's relative assets (Cutscenes/, Images/, Soundtrack/,
// three.min.r128.js, eq_icon.png, …) live publicly. Defaults to the site
// origin, where the repo's static asset tree is served. game.js injects a
// <base href> pointing here so the protected game HTML can find them.
export const ASSETS_BASE = process.env.ASSETS_BASE || SITE_ORIGIN;

// Service-role Supabase client — server only, bypasses RLS. The Earth
// Quest tables have no public policies, so ALL access goes through this.
export function adminDb() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
}

// CORS: allow the live Earth Quest site + localhost during testing.
const ALLOWED = [SITE_ORIGIN, 'http://localhost:5190', 'http://127.0.0.1:5190'].filter(Boolean);
export function corsHeaders(origin) {
  const allow = ALLOWED.includes(origin) ? origin : (SITE_ORIGIN || '*');
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

export function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
  });
}

// A long, URL-safe secret for the private dashboard link.
export function genToken() {
  return crypto.randomBytes(24).toString('base64url');
}

// Student codes like 'EARTH-7K2PX'. Deliberately avoids look-alike
// characters (no O/0, I/1, L) so kids type them correctly. 5 chars over a
// 31-char alphabet = ~28.6 million combos, so the pool stays sparse even
// with hundreds of thousands of codes (collisions stay negligible).
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += ALPHA[crypto.randomInt(ALPHA.length)];
  return 'EARTH-' + s;
}
// 150 codes unique within the batch. The DB also enforces global
// uniqueness (code is the primary key); the webhook retries on the rare
// cross-owner collision.
export function genCodes(n) {
  const set = new Set();
  while (set.size < n) set.add(makeCode());
  return [...set];
}

// The PRIVATE Storage bucket holding the protected assets (game,
// leaderboard, guide). Files are never public — access is only ever a
// short-lived signed URL handed out after a valid code/token.
export const EQ_BUCKET = 'earthquest';
export async function signAsset(db, path, seconds) {
  const { data, error } = await db.storage.from(EQ_BUCKET).createSignedUrl(path, seconds);
  if (error || !data) return null;   // file missing / not uploaded yet
  return data.signedUrl;
}

// ---- Email (Resend). No-op until RESEND_API_KEY is set, so nothing
// breaks before it's configured. ----
export async function sendEmail({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return false;
  const from = process.env.RESEND_FROM || 'Earth Quest <onboarding@resend.dev>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html })
    });
    return r.ok;
  } catch (e) { return false; }
}

export function dashboardLink(token) {
  return (SITE_ORIGIN || '') + '/dashboard.html?key=' + encodeURIComponent(token);
}

// The "here's your link" email, shared by the purchase webhook and the
// "email me my link" recovery endpoint.
export function questEmailHtml(token) {
  const dash = dashboardLink(token);
  const play = (SITE_ORIGIN || '') + '/play.html';
  return '<div style="font-family:Georgia,serif;max-width:540px;margin:auto;color:#2a2520;line-height:1.6">' +
    '<h1 style="color:#5a7d3c">Your Earth Quest is ready &#127757;</h1>' +
    '<p>Your Earth Quest access is ready. Below is your <b>private teacher dashboard</b> — bookmark it; it\'s how you manage your 150 student codes.</p>' +
    '<p><a href="' + dash + '" style="display:inline-block;background:#6fa84f;color:#142008;font-weight:bold;padding:12px 22px;border-radius:6px;text-decoration:none">Open my dashboard</a></p>' +
    '<p style="font-size:13px;color:#666;word-break:break-all">Or paste this link into your browser:<br>' + dash + '</p>' +
    '<hr style="border:none;border-top:1px solid #ddd;margin:18px 0">' +
    '<p style="margin:0 0 6px"><b>Getting started</b></p>' +
    '<ol style="margin:0;padding-left:20px">' +
      '<li>Open your dashboard and paste your class roster to auto-fill the codes, then print.</li>' +
      '<li>Give each student their code plus the play link: <a href="' + play + '">' + play + '</a></li>' +
      '<li>Track everyone on the Hall of Champions, and reset free each year — no second purchase.</li>' +
    '</ol>' +
    '<p style="font-size:13px;color:#666;margin-top:16px">Keep this email — anyone with your dashboard link can manage your codes.</p>' +
  '</div>';
}

// Create an owner (purchase OR free district) + their 150 codes + welcome
// email. Shared by the Stripe webhook and the district-free flow so both
// paths behave identically.
export async function provisionOwner(db, { email, source = 'purchase', stripe_customer = null, stripe_payment_intent = null }) {
  const token = genToken();
  const { data: owner, error } = await db.from('eq_owners')
    .insert({ access_token: token, email: email || null, source, stripe_customer, stripe_payment_intent })
    .select('id').single();
  if (error) throw error;

  // 150 codes, collision-proof top-up.
  for (let attempt = 0; attempt < 50; attempt++) {
    const { count } = await db.from('eq_codes')
      .select('code', { count: 'exact', head: true }).eq('owner', owner.id);
    const have = count || 0;
    if (have >= 150) break;
    const rows = genCodes(150 - have).map(code => ({ code, owner: owner.id }));
    const { error: e2 } = await db.from('eq_codes').upsert(rows, { onConflict: 'code', ignoreDuplicates: true });
    if (e2) throw e2;
  }

  if (email) {
    try { await sendEmail({ to: email, subject: 'Your Earth Quest dashboard + 150 codes', html: questEmailHtml(token) }); } catch (e) {}
  }
  return token;
}

// Signed, expiring token for district email verification — no DB row
// needed. HMAC keyed by the service-role secret (server-only).
function _districtKey() { return process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback-key'; }
export function signDistrictToken(email) {
  const payload = Buffer.from(JSON.stringify({ e: String(email).toLowerCase(), x: Date.now() + 1000 * 60 * 60 * 24 })).toString('base64url');
  const sig = crypto.createHmac('sha256', _districtKey()).update(payload).digest('base64url');
  return payload + '.' + sig;
}
export function verifyDistrictToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expect = crypto.createHmac('sha256', _districtKey()).update(payload).digest('base64url');
  if (sig.length !== expect.length) return null;
  try { if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null; } catch (e) { return null; }
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch (e) { return null; }
  if (!data || !data.e || !data.x || Date.now() > data.x) return null;
  return data.e;
}

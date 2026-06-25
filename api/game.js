// =====================================================================
// GET /api/game?code=EARTH-XXXXX
// Serves the protected game to a valid code, always with the correct HTML
// content-type (so it runs as a page, not shown as text). The code is the
// credential; the file is streamed from the private bucket and never
// exposed as a public URL.
//
// Earth Quest difference vs Science Quest: the game references many
// external assets (Cutscenes/, Images/, Soundtrack/, three.min.r128.js,
// eq_icon.png, …) by RELATIVE path. Since the page is served from
// /api/game, those would resolve under /api/ and break. So we inject a
// <base href="{ASSETS_BASE}/"> right after <head> — the asset tree is
// served publicly from the repo at ASSETS_BASE (defaults to SITE_ORIGIN).
// =====================================================================
import { adminDb, EQ_BUCKET, ASSETS_BASE } from './_shared.js';

function toPlay() {
  return new Response(null, { status: 302, headers: { Location: '/play.html' } });
}
function note(message) {
  return new Response(
    '<!doctype html><meta charset="utf-8"><body style="font-family:Georgia,serif;background:#1d2415;color:#e8f0d8;text-align:center;padding:60px 24px">' +
    message + '</body>',
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

// Put a <base href> just after the first <head ...> tag so relative asset
// URLs resolve to the public asset origin. Idempotent-ish: if the game
// already has a <base>, we still add ours first (browsers honour the first).
function injectBase(html, base) {
  if (!base) return html;
  const tag = '<base href="' + base.replace(/\/+$/, '') + '/">';
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, m => m + tag);
  }
  // No <head> (very unlikely) — prepend so it's still the first base.
  return tag + html;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const code = (url.searchParams.get('code') || '').trim().toUpperCase();
    if (!code) return toPlay();

    const db = adminDb();
    const { data: row, error } = await db.from('eq_codes')
      .select('code, activated_at').eq('code', code).maybeSingle();
    if (error) throw error;
    if (!row) return toPlay();

    // Claim the seat if they came straight here (idempotent).
    if (!row.activated_at) {
      await db.from('eq_codes').update({ activated_at: new Date().toISOString() }).eq('code', code);
    }

    const { data: file, error: dErr } = await db.storage.from(EQ_BUCKET).download('game.html');
    if (dErr || !file) return note('The game is being set up — please check back shortly.');

    const html = injectBase(await file.text(), ASSETS_BASE);
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Cache per-code so reloads are instant and cheap; short enough that
        // a game update reaches students within the hour.
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (e) {
    return note('Something went wrong loading the game. Please try again.');
  }
}

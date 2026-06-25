// =====================================================================
// /api/district   — Cherokee County free-access flow (one function so we
// stay under Vercel Hobby's 12-function limit).
//   POST { email }            -> email a signed activation link
//   GET  ?token=...           -> verify the link, grant free access,
//                                redirect to the teacher dashboard
// =====================================================================
import { adminDb, provisionOwner, sendEmail, signDistrictToken, verifyDistrictToken, SITE_ORIGIN, corsHeaders, json } from './_shared.js';

const DISTRICT_DOMAIN = '@cherokeek12.net';

function note(message) {
  return new Response(
    '<!doctype html><meta charset="utf-8"><body style="font-family:Georgia,serif;background:#1d2415;color:#e8f0d8;text-align:center;padding:60px 24px">' +
    message + '</body>',
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}

// Teacher asks for a free activation link.
export async function POST(request) {
  const origin = request.headers.get('origin');
  try {
    let { email } = await request.json();
    email = String(email || '').trim().toLowerCase();
    if (!email.endsWith(DISTRICT_DOMAIN)) {
      return json({ error: 'Please use your @cherokeek12.net school email.' }, 400, origin);
    }
    const link = (SITE_ORIGIN || '') + '/api/district?token=' + encodeURIComponent(signDistrictToken(email));
    const html = '<div style="font-family:Georgia,serif;max-width:520px;margin:auto;color:#2a2520;line-height:1.6">' +
      '<h1 style="color:#5a7d3c">Activate your free Earth Quest &#127757;</h1>' +
      '<p>Cherokee County teachers get Earth Quest free. Click below to activate your access and generate your 150 student codes:</p>' +
      '<p><a href="' + link + '" style="display:inline-block;background:#6fa84f;color:#142008;font-weight:bold;padding:12px 22px;border-radius:6px;text-decoration:none">Activate my free access</a></p>' +
      '<p style="font-size:13px;color:#666">This link expires in 24 hours. If you didn\'t request this, you can ignore it.</p>' +
    '</div>';
    await sendEmail({ to: email, subject: 'Activate your free Earth Quest access', html });
    return json({ ok: true }, 200, origin);
  } catch (e) {
    return json({ ok: true }, 200, origin);
  }
}

// Teacher clicks the activation link from the email.
export async function GET(request) {
  try {
    const token = new URL(request.url).searchParams.get('token') || '';
    const email = verifyDistrictToken(token);
    if (!email || !email.endsWith(DISTRICT_DOMAIN)) {
      return note('This activation link is invalid or has expired. Please request a new one.');
    }
    const db = adminDb();
    const { data: existing } = await db.from('eq_owners')
      .select('access_token').ilike('email', email).limit(1).maybeSingle();
    const accessToken = existing
      ? existing.access_token
      : await provisionOwner(db, { email, source: 'district' });
    return new Response(null, {
      status: 302,
      headers: { Location: '/dashboard.html?key=' + encodeURIComponent(accessToken) }
    });
  } catch (e) {
    return note('Something went wrong activating your access. Please try again in a moment.');
  }
}

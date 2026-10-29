// Email signup for everyversepainted.com.
//
// POST /api/subscribe  {email, token, website}
//   website is a honeypot (must be empty); token is the Turnstile response.
//   Verifies Turnstile, then emails a signed confirmation link via Resend.
//   Nothing is stored until the person confirms (double opt-in).
// GET  /api/confirm?t=<signed token>
//   Verifies the signature and expiry, adds the contact to the Resend audience,
//   then redirects to the site's /confirmed.html.
//
// Lesson from the dopamine app: an unprotected signup form attracted bots that
// triggered hundreds of emails a day and a spam complaint. Turnstile, the
// honeypot and double opt-in are all mandatory here.

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

export function normalizeEmail(raw) {
  const email = String(raw || "").trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(str) {
  const s = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** A self-contained confirmation token: base64url(email|expiry).base64url(hmac). */
export async function signToken(email, expiresAtMs, secret) {
  const payload = b64url(new TextEncoder().encode(`${email}|${expiresAtMs}`));
  const sig = b64url(await hmac(secret, payload));
  return `${payload}.${sig}`;
}

/** Returns the email if the token is authentic and unexpired, else null. */
export async function verifyToken(token, secret, nowMs = Date.now()) {
  const [payload, sig] = String(token || "").split(".");
  if (!payload || !sig) return null;
  let expected, given, decoded;
  try {
    expected = await hmac(secret, payload);
    given = fromB64url(sig);
    decoded = new TextDecoder().decode(fromB64url(payload));
  } catch {
    return null;
  }
  if (!timingSafeEqual(expected, given)) return null;
  const [email, exp] = decoded.split("|");
  if (!normalizeEmail(email) || !(Number(exp) > nowMs)) return null;
  return email;
}

function cors(env) {
  return {
    "Access-Control-Allow-Origin": env.SITE_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function json(body, status, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(env) },
  });
}

async function turnstileOk(token, ip, env) {
  if (!token) return false;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  const data = await r.json().catch(() => ({}));
  // Cloudflare's reason codes (e.g. invalid-input-secret, timeout-or-duplicate) name the
  // problem without exposing any key.
  if (data.success !== true) console.warn("turnstile rejected", JSON.stringify(data["error-codes"] || []));
  return data.success === true;
}

function confirmEmail(link) {
  const text = [
    "Thank you for following Every Verse Painted.",
    "",
    "Please confirm your email address to receive new chapters as they are released:",
    link,
    "",
    "If you did not sign up, simply ignore this email and you will not hear from us again.",
    "",
    "Every Verse Painted - the King James Bible, painted and narrated",
    "https://everyversepainted.com",
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#14110f;padding:32px 16px;font-family:Georgia,'Palatino Linotype',serif;color:#ede4d3">
<div style="max-width:520px;margin:0 auto;text-align:center">
<p style="letter-spacing:.3em;text-transform:uppercase;font-size:12px;color:#f0c97c;margin:0 0 12px">Every Verse Painted</p>
<h1 style="font-weight:600;font-size:28px;margin:0 0 16px">Please confirm your email</h1>
<p style="font-size:17px;line-height:1.6;color:#d8cdbd">Thank you for following along. Confirm your address to receive new chapters as they are released.</p>
<p style="margin:28px 0"><a href="${link}" style="background:#d4a55c;color:#14110f;text-decoration:none;padding:14px 28px;border-radius:999px;font-size:17px">Confirm my subscription</a></p>
<p style="font-size:14px;color:#9c9184;line-height:1.6">If you did not sign up, simply ignore this email and you will not hear from us again.</p>
<p style="font-size:14px;color:#9c9184;font-style:italic;margin-top:28px">&ldquo;Thy word is a lamp unto my feet, and a light unto my path.&rdquo; Psalm 119:105</p>
</div></body></html>`;
  return { text, html };
}

async function subscribe(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "bad_request" }, 400, env);
  }
  // Honeypot: real people never fill the hidden "website" field. Pretend success.
  if (body.website) return json({ ok: true }, 200, env);

  const email = normalizeEmail(body.email);
  if (!email) return json({ ok: false, error: "invalid_email" }, 400, env);

  const ip = request.headers.get("CF-Connecting-IP");
  if (!(await turnstileOk(body.token, ip, env))) {
    return json({ ok: false, error: "verification_failed" }, 403, env);
  }

  const ttlMs = Number(env.CONFIRM_TTL_HOURS || 48) * 3600 * 1000;
  const token = await signToken(email, Date.now() + ttlMs, env.SIGNING_SECRET);
  // The email links to the site (not the workers.dev host); confirm.html forwards the token here.
  const link = `${env.SITE_ORIGIN}/confirm.html?t=${encodeURIComponent(token)}`;
  const { text, html } = confirmEmail(link);

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to: [email],
      subject: "Please confirm your subscription to Every Verse Painted",
      text,
      html,
    }),
  });
  if (!r.ok) {
    console.error("resend send failed", r.status, await r.text());
    return json({ ok: false, error: "send_failed" }, 502, env);
  }
  return json({ ok: true }, 200, env);
}

async function confirm(request, env) {
  const url = new URL(request.url);
  const email = await verifyToken(url.searchParams.get("t"), env.SIGNING_SECRET);
  if (!email) return Response.redirect(`${env.SITE_ORIGIN}/confirmed.html?status=expired`, 302);

  // Resend keeps one contact list per account, grouped into segments (the dopamine app's
  // waitlist is another segment). Create the contact inside our segment; if the address is
  // already a contact, add it to our segment instead.
  const auth = { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" };
  const created = await fetch("https://api.resend.com/contacts", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ email, unsubscribed: false, segments: [{ id: env.RESEND_SEGMENT_ID }] }),
  });
  let ok = created.ok;
  if (!ok && (created.status === 409 || created.status === 422)) {
    const seg = await fetch(
      `https://api.resend.com/contacts/${encodeURIComponent(email)}/segments/${env.RESEND_SEGMENT_ID}`,
      { method: "POST", headers: auth },
    );
    // Already in the segment also counts as success for the person clicking.
    ok = seg.ok || seg.status === 409 || seg.status === 422;
    if (!ok) console.error("resend segment add failed", seg.status, await seg.text());
  } else if (!ok) {
    console.error("resend contact create failed", created.status, await created.text());
  }
  return Response.redirect(`${env.SITE_ORIGIN}/confirmed.html?status=${ok ? "ok" : "error"}`, 302);
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env) });
    if (pathname === "/api/subscribe" && request.method === "POST") return subscribe(request, env);
    if (pathname === "/api/confirm" && request.method === "GET") return confirm(request, env);
    return new Response("Not found", { status: 404 });
  },
};

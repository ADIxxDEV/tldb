// Anti-abuse: disposable email blocklist + Cloudflare Turnstile verification
'use strict';

// Common disposable / temp-mail domains (curated list — extend as needed)
const TEMP_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', 'grr.la',
  '10minutemail.com', '10minutemail.net', '20minutemail.com', 'tempmail.com', 'temp-mail.org',
  'tempmail.net', 'tempmailo.com', 'yopmail.com', 'yopmail.net', 'cool.fr.nf', 'jetable.fr.nf',
  'throwawaymail.com', 'dispostable.com', 'fakeinbox.com', 'getnada.com', 'nada.email',
  'trashmail.com', 'trashmail.de', 'trash-mail.com', 'wegwerfmail.de', 'sogetthis.com',
  'maildrop.cc', 'dropmail.me', 'emailondeck.com', 'moakt.com', 'mohmal.com', 'email-temp.com',
  'temp-mail.io', 'tmpmail.org', 'tmpmail.net', 'tmpeml.com', 'tmail.ws', 'tmails.net',
  '1secmail.com', '1secmail.net', '1secmail.org', 'esiix.com', 'wwjmp.com', 'xojxe.com',
  'burnermail.io', 'burnermail.com', 'anonaddy.me', 'anonaddy.com', '33mail.com', 'spam4.me',
  'harakirimail.com', 'mytemp.email', 'mailnesia.com', 'mintemail.com', 'mvrht.net', 'my10minutemail.com',
  'spamgourmet.com', 'spambog.com', 'spamherelots.com', 'discard.email', 'discardmail.com',
  'gmal.com', 'gmaill.com', 'gmailm.com', 'yandex-mail.com', 'mailtemp.uk', 'tempmailo.dev',
]);

// heuristic catches: domain contains these markers → treat as disposable
const TEMP_MARKERS = ['tempmail', 'temp-mail', '10minute', 'throwaway', 'trashmail', 'fakebox', 'burnermail'];

export function isTempEmail(email) {
  const domain = String(email || '').toLowerCase().split('@').pop().trim();
  if (!domain || !domain.includes('.')) return true;
  if (TEMP_DOMAINS.has(domain)) return true;
  return TEMP_MARKERS.some(m => domain.includes(m));
}

// Cloudflare Turnstile — server-side verification.
// Uses official TEST keys unless configured: site 1x...AA always passes, 2x...BA always blocks.
export function turnstileConfig(env) {
  const siteKey = env?.TURNSTILE_SITE_KEY || '1x00000000000000000000AA'; // test: always passes
  const secret = env?.TURNSTILE_SECRET || '1x0000000000000000000000000000000AA'; // test: always passes
  const enabled = Boolean(env?.TURNSTILE_SITE_KEY && env?.TURNSTILE_SECRET);
  return { siteKey, secret, enabled };
}

export async function verifyTurnstile(token, ip, cfg) {
  if (!cfg.enabled) return true; // test keys / local dev — skip remote check
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret: cfg.secret, response: token });
    if (ip) body.set('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body,
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch {
    return false; // fail closed if the check itself is unreachable
  }
}

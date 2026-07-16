export const ADMIN_COOKIE_NAME = 'aemori_admin_session';
export const ADMIN_SESSION_SECONDS = 60 * 60 * 8;

function toBase64Url(bytes: ArrayBuffer) {
  const chars = Array.from(new Uint8Array(bytes), (byte) => String.fromCharCode(byte)).join('');
  return btoa(chars).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toBase64Url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}

export async function createAdminSession(secret: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + ADMIN_SESSION_SECONDS;
  return `${expiresAt}.${await sign(String(expiresAt), secret)}`;
}

export async function verifyAdminSession(token: string | undefined, secret: string) {
  if (!token || !secret) return false;
  const [expiresAtText, providedSignature] = token.split('.');
  const expiresAt = Number(expiresAtText);
  if (!expiresAt || expiresAt <= Math.floor(Date.now() / 1000) || !providedSignature) return false;
  const expectedSignature = await sign(expiresAtText, secret);
  if (expectedSignature.length !== providedSignature.length) return false;
  let difference = 0;
  for (let index = 0; index < expectedSignature.length; index += 1) {
    difference |= expectedSignature.charCodeAt(index) ^ providedSignature.charCodeAt(index);
  }
  return difference === 0;
}

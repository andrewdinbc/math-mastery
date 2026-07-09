'use client';

// lib/roster-crypto.js — client-side E2E encryption for student names.
// The key NEVER leaves this browser / gets sent to Supabase. Supabase only
// ever stores ciphertext. Generated once, downloaded as a keyfile that must
// be reloaded each session (kept in memory only, never persisted to
// localStorage/cookies, so a compromised server or DB leak reveals nothing).

export async function generateKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function exportKeyToFile(key) {
  const raw = await crypto.subtle.exportKey('raw', key);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(raw)));
  const blob = new Blob(
    [
      `MASTERY STUDIO ROSTER ENCRYPTION KEY\n` +
        `Generated: ${new Date().toISOString()}\n` +
        `\n` +
        `KEEP THIS FILE SAFE. If lost, encrypted student names in Supabase\n` +
        `become permanently unrecoverable - there is no reset. Back it up\n` +
        `to at least one other location (USB drive, personal cloud storage).\n` +
        `\n` +
        `KEY: ${base64}\n`,
    ],
    { type: 'text/plain' }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mastery-studio-roster-key-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importKeyFromFileText(text) {
  const match = text.match(/KEY:\s*([A-Za-z0-9+/=]+)/);
  const base64 = match ? match[1].trim() : text.trim();
  const raw = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

export async function encryptName(key, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return 'enc:' + btoa(String.fromCharCode(...combined));
}

export async function decryptName(key, stored) {
  if (!stored || !stored.startsWith('enc:')) return stored; // not encrypted (legacy/unencrypted row)
  const combined = Uint8Array.from(atob(stored.slice(4)), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  try {
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch {
    return '⚠️ Cannot decrypt (wrong key?)';
  }
}

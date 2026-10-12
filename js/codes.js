// Códigos tipo "localizador de vuelo": 6 letras, sin I, L ni O para evitar confusiones.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 6;

export function defaultRng() {
  if (globalThis.crypto && globalThis.crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0] / 4294967296;
  }
  return Math.random();
}

export function generateCode(rng = defaultRng, existing = new Set()) {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) {
      code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
    }
    if (!existing.has(code)) return code;
  }
  throw new Error('No se pudo generar un código único');
}

// Las mayúsculas y minúsculas valen igual; siempre se muestra en mayúsculas.
export function normalizeCode(input) {
  return String(input || '').replace(/[\s-]/g, '').toUpperCase();
}

export function isValidCode(code) {
  const c = normalizeCode(code);
  if (c.length !== CODE_LENGTH) return false;
  for (const ch of c) {
    if (!CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}

export async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

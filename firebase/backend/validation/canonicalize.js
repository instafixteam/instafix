// validation/canonicalize.js
// Canonicalization helpers (OWASP): NFC normalization, collapse spaces, trim.
export const canonicalize = (s) => (s ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
export const canonicalizeEmail = (e) => (e ?? "").trim().toLowerCase();

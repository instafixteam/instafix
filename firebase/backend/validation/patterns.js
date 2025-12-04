// validation/patterns.js
// Unicode-safe allowlists for user text fields.
export const namePattern = /^(?=.*\p{L})[\p{L}\p{M}'’.\- ]+$/u; // at least one letter
export const addressPattern = /^[\p{L}\p{M}\d\s,.'()#\/\-]+$/u; // broader set for addresses

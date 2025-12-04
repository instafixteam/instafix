// utils/mask.js
export function maskData(value) {
  if (!value || typeof value !== 'string') return null;
  
  const len = value.length;
  if (len <= 2) return '*'.repeat(len);
  
  // Show first 3 characters, mask the rest
  const visible = Math.min(3, len);
  return value.slice(0, visible) + '*'.repeat(len - visible);
}
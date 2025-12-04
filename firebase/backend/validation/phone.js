// validation/phone.js
// Phone normalization using libphonenumber-js (Egypt fallback; supports international + prefix)
import { parsePhoneNumberFromString } from 'libphonenumber-js';

export const validatePhone = (val, helpers) => {
  if (val == null || val === '') return val; // optional
  const pn = parsePhoneNumberFromString(val, 'EG');
  if (!pn || !pn.isValid()) return helpers.error('any.invalid');
  return pn.number; // canonical E.164
};

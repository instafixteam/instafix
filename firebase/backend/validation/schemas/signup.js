// validation/schemas/signup.js
import Joi from 'joi';
import { namePattern, addressPattern } from '../patterns.js';
import { validatePhone } from '../phone.js';

export const signupSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).pattern(namePattern).required()
    .label('Full name')
    .messages({
      'string.min': 'Full name must be at least 2 characters long',
      'string.pattern.base': 'Full name may include letters, spaces, apostrophes, periods, and hyphens only',
    }),
  address: Joi.string().trim().min(5).max(500).pattern(addressPattern).required()
    .label('Address')
    .messages({
      'string.min': 'Address must be at least 5 characters long',
      'string.pattern.base': 'Address may include letters, numbers, spaces, commas, periods, apostrophes, hyphens, slashes, parentheses and # only',
    }),
  phoneNumber: Joi.string().allow('', null).custom(validatePhone)
    .label('Phone Number')
    .messages({ 'any.invalid': 'Phone Number is invalid' }),
  desiredRole: Joi.string().valid('customer', 'technician').default('customer'),
  isVerified: Joi.boolean().optional(),
}).prefs({ errors: { wrap: { label: false } } });

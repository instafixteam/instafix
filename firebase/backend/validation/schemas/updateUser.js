// validation/schemas/updateUser.js
import Joi from 'joi';
import { namePattern, addressPattern } from '../patterns.js';
import { validatePhone } from '../phone.js';

export const updateUserSchema = Joi.object({
  displayname: Joi.string().trim().min(2).max(100).pattern(namePattern)
    .label('Display Name')
    .messages({
      'string.min': 'Display Name must be at least 2 characters long',
      'string.pattern.base': 'Display Name may include letters, spaces, apostrophes, periods, and hyphens only',
    }),
  address: Joi.string().trim().min(5).max(500).pattern(addressPattern)
    .label('Address')
    .messages({
      'string.min': 'Address must be at least 5 characters long',
      'string.pattern.base': 'Address may include letters, numbers, spaces, commas, periods, apostrophes, hyphens, slashes, parentheses and # only',
    }),
  phoneNumber: Joi.string().allow('', null).custom(validatePhone)
    .label('Phone Number')
    .messages({ 'any.invalid': 'Phone Number is invalid' }),
}).min(1).prefs({ errors: { wrap: { label: false } } });

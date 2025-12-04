// validation/schemas/serviceRequest.js
import Joi from 'joi';
import { addressPattern } from '../patterns.js';

export const serviceRequestSchema = Joi.object({
  customer_uid: Joi.string().trim().min(6).max(128).required().label('Customer UID'),
  technician_uid: Joi.string().trim().min(6).max(128).allow('', null).label('Technician UID'),
  service_name: Joi.string().trim().min(2).max(120).pattern(addressPattern)
    .label('Service name')
    .messages({
      'string.min': 'Service name must be at least 2 characters long',
      'string.pattern.base': 'Service name may include letters, numbers, spaces, commas, periods, apostrophes, hyphens, slashes, parentheses and # only'
    }),
  service_category: Joi.string().trim().min(2).max(120).pattern(addressPattern)
    .label('Service category')
    .messages({
      'string.min': 'Service category must be at least 2 characters long',
      'string.pattern.base': 'Service category may include letters, numbers, spaces, commas, periods, apostrophes, hyphens, slashes, parentheses and # only'
    }),
  scheduled_date: Joi.date().iso().required().label('Scheduled date'),
  total_price: Joi.number().min(0).max(1000000).required().label('Total price'),
}).prefs({ errors: { wrap: { label: false } } });

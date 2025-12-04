// validation/schemas/serviceCatalog.js
import Joi from 'joi';

export const createServiceSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required().label('Service name'),
  category: Joi.string().trim().min(2).max(120).required().label('Category'),
  description: Joi.string().trim().max(2000).allow('', null).label('Description'),
  base_price: Joi.number().min(0).max(100000).required().label('Base price'),
  estimated_time: Joi.number().integer().min(1).max(100000).required().label('Estimated time (minutes)')
}).prefs({ errors: { wrap: { label: false } } });

export const updateServiceSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).label('Service name'),
  category: Joi.string().trim().min(2).max(120).label('Category'),
  description: Joi.string().trim().max(2000).allow('', null).label('Description'),
  base_price: Joi.number().min(0).max(100000).label('Base price'),
  estimated_time: Joi.number().integer().min(1).max(100000).label('Estimated time (minutes)')
}).min(1).prefs({ errors: { wrap: { label: false } } });

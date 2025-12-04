import Joi from "joi";

// Joi validation schema for technician signup
export const techSignupSchema = Joi.object({
    name: Joi.string().min(2).max(120).required().messages({
        'string.min': 'Name must be at least 2 characters',
        'string.max': 'Name must not exceed 120 characters',
        'any.required': 'Full name is required'
    }),
    phoneNumber: Joi.string().pattern(/^\+?[0-9]{7,15}$/).required().messages({
        'string.pattern.base': 'Phone number must be 7-15 digits (optional + prefix)',
        'any.required': 'Phone number is required'
    }),
    email: Joi.string().email({ tlds: { allow: false } }).required().messages({
        'string.email': 'Please enter a valid email address',
        'any.required': 'Email is required'
    }),
    password: Joi.string()
        .min(8)
        .pattern(/[a-z]/, 'lowercase')
        .pattern(/[A-Z]/, 'uppercase')
        .pattern(/[^a-zA-Z0-9]/, 'special')
        .required()
        .messages({
            'string.min': 'Password must contain at least 8 characters',
            'string.pattern.name': 'Password must contain {{#name}} character',
            'string.pattern.base': 'Password must contain a lowercase letter, uppercase letter, and special character',
            'any.required': 'Password is required'
        }),

    // ⬇️ updated: no SPECIALTY_OPTIONS, just non-empty strings
    specialisation: Joi.string().min(1).required().messages({
        'any.required': 'Select at least one specialty',
        'array.min': 'Pick at least one specialty'
    })
});

export const techSignupApiSchema = Joi.object({
    name: Joi.string().min(2).max(120).required(),
    phoneNumber: Joi.string().pattern(/^\+?[0-9]{7,15}$/).required(),
    specialisation: Joi.string().min(1).required(),
    desiredRole: Joi.string().valid("technician_pending").optional()
}).unknown(false);




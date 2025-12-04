// validation/middleware/validateBody.js
// Generic Joi body validator middleware.
export const validateBody = (schema) => async (req, res, next) => {
  try {
    const value = await schema.validateAsync(req.body ?? {}, { abortEarly: false });
    req.body = value; // replace with canonical validated object
    return next();
  } catch (err) {
    const details = (err.details || []).map(d => ({
      field: d.path?.[0] || 'field',
      message: String(d.message || '').trim(),
    }));
    return res.status(400).json({ error: 'VALIDATION_ERROR', details });
  }
};

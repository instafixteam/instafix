// src/validations/technician.validation.js

// Minimal shim so the frontend builds and runs without crashing.
// You can later replace this with a real Zod/Yup schema if you want.

export const techSignupSchema = {
  // For Zod-style usage: techSignupSchema.safeParse(values)
  safeParse(data) {
    return { success: true, data, error: null };
  },

  // For Yup-style usage: await techSignupSchema.validate(values)
  async validate(data) {
    return data;
  },
};

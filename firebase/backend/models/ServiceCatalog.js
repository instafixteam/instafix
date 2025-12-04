// backend/models/ServiceCatalog.js
import mongoose from "mongoose";

const ALLOWED_CATEGORIES = [
  "plumbing",
  "electrical",
  "hvac",
  "appliance",
  "general"
];

const nameRegex = /^[A-Za-z0-9 \-_'&()]{2,80}$/; // enforce charset + length

const serviceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 80,
    validate: {
      validator: (v) => nameRegex.test(v),
      message: "Name contains invalid characters"
    }
  },
  category: {
    type: String,
    required: true,
    enum: ALLOWED_CATEGORIES,
    trim: true
  },
  description: {
    type: String,
    required: false,
    trim: true,
    maxlength: 2000,
    default: "",
    validate: {
      validator: (v) => !/[<>]/.test(v), // reject angle brackets to avoid raw HTML unless sanitized
      message: "HTML tags are not allowed in description"
    }
  },
  base_price: {
    type: Number,
    required: true,
    min: 0.01,
    max: 100000,
    validate: {
      validator: (v) => Number.isFinite(v),
      message: "base_price must be a valid number"
    }
  },
  estimated_time: {
    type: Number, // minutes
    required: true,
    min: 1,
    max: 480 // 8 hours
  },
  created_at: { type: Date, default: Date.now }
}, { collection: 'servicecatalog' });

// Prevent duplicate (name, category)
serviceSchema.index({ name: 1, category: 1 }, { unique: true });

const ServiceCatalog = mongoose.model("ServiceCatalog", serviceSchema);
export default ServiceCatalog;
export { ALLOWED_CATEGORIES };
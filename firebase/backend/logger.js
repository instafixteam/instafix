// logger.js
import pino from "pino";
import crypto from "crypto";
import fs from "fs";
import path from "path";

// ─────────────────────────────────────────────
// PII masking helper
// ─────────────────────────────────────────────
function maskPII(value) {
  if (!value) return value;
  const str = String(value);

  // Hash the value with a daily rotating salt for same-day correlation
  const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const salt = `${date}-${process.env.LOG_SALT || "default-salt"}`;
  const hash = crypto.createHash("sha256").update(salt + str).digest("hex");

  return hash.substring(0, 16); // First 16 chars for readability
}

// ─────────────────────────────────────────────
// Custom serializers (PII-safe)
// ─────────────────────────────────────────────
const serializers = {
  req: (req) => ({
    id: req.id,
    method: req.method,
    url: req.url,
    // Mask sensitive headers
    headers: {
      ...req.headers,
      authorization: req.headers?.authorization ? "[REDACTED]" : undefined,
      cookie: req.headers?.cookie ? "[REDACTED]" : undefined,
    },
    remoteAddress:
      req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress,
    // Hash user ID if present
    userId: req.user?.uid ? maskPII(req.user.uid) : undefined,
  }),

  res: (res) => ({
    statusCode: res.statusCode,
  }),

  user: (user) => ({
    uid_hash: user?.uid ? maskPII(user.uid) : undefined,
    email_hash: user?.email ? maskPII(user.email) : undefined,
    // Never log actual PII
    phoneNumber: undefined,
    address: undefined,
    name: undefined,
  }),

  err: pino.stdSerializers.err,
};

// ─────────────────────────────────────────────
// Base logger configuration
// ─────────────────────────────────────────────
const baseOptions = {
  level: process.env.LOG_LEVEL || "info",
  serializers,
  // Belt & suspenders: redact sensitive fields even if accidentally passed
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "user.phoneNumber",
      "user.address",
      "user.email",
      "user.name",
      "password",
      "token",
      "secret",
      "apiKey",
      "*.password",
      "*.token",
      "*.secret",
    ],
    remove: true,
  },
  base: {
    env: process.env.NODE_ENV || "development",
  },
}; 

// ─────────────────────────────────────────────
// Main logger (console / stdout)
// ─────────────────────────────────────────────
export const logger = pino({
  ...baseOptions,
  // Pretty print in development
  transport:
    process.env.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        }
      : undefined,
});

// ─────────────────────────────────────────────
// Category loggers → separate files
// ─────────────────────────────────────────────
const LOG_DIR = process.env.LOG_DIR || "logs";
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function makeCategoryLogger(category) {
  const filePath = path.join(LOG_DIR, `${category.toLowerCase()}.log`);
  const dest = pino.destination({
    dest: filePath,
    mkdir: true,
    sync: false,
  });

  return pino(
    {
      ...baseOptions,
      // Tag category at base level for each line
      base: {
        ...baseOptions.base,
        category,
      },
    },
    dest
  );
}

const authnLogger = makeCategoryLogger("AUTHN");
const authzLogger = makeCategoryLogger("AUTHZ");
const adminLogger = makeCategoryLogger("ADMIN_ACTION");
const paymentsLogger = makeCategoryLogger("PAYMENTS");
const abuseLogger = makeCategoryLogger("ABUSE");
const dataAccessLogger = makeCategoryLogger("DATA_ACCESS");

// Optional: high-level “audit” view (goes to main logger/console)
export const auditLogger = logger.child({ audit: true });

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

// Attach a per-request child logger with correlation IDs
export function createRequestLogger(req) {
  const correlationId =
    req.headers["x-correlation-id"] ||
    req.headers["x-request-id"] ||
    req.id ||
    crypto.randomUUID();

  return logger.child({
    correlationId,
    requestId: req.id || correlationId,
  });
}

// Category-specific helpers (you can also call these directly)
export function logAuthn(action, details = {}) {
  authnLogger.info(
    {
      category: "AUTHN",
      action,
      ...details,
    },
    details.msg || `AUTHN ${action}`
  );
}

export function logAuthz(action, details = {}) {
  authzLogger.warn(
    {
      category: "AUTHZ",
      action,
      ...details,
    },
    details.msg || `AUTHZ ${action}`
  );
}

export function logAdminAction(action, details = {}) {
  adminLogger.info(
    {
      category: "ADMIN_ACTION",
      action,
      ...details,
    },
    details.msg || `ADMIN_ACTION ${action}`
  );
}

export function logPayment(action, details = {}) {
  paymentsLogger.info(
    {
      category: "PAYMENTS",
      action,
      ...details,
    },
    details.msg || `PAYMENTS ${action}`
  );
}

export function logAbuse(action, details = {}) {
  abuseLogger.warn(
    {
      category: "ABUSE",
      action,
      ...details,
    },
    details.msg || `ABUSE ${action}`
  );
}

export function logDataAccess(action, details = {}) {
  dataAccessLogger.info(
    {
      category: "DATA_ACCESS",
      action,
      ...details,
    },
    details.msg || `DATA_ACCESS ${action}`
  );
}

// Backwards-compatible generic security event helper
export function logSecurityEvent(event, details = {}) {
  const payload = {
    event,
    timestamp: new Date().toISOString(),
    ...details,
  };

  // Always go to the generic audit stream (console/stdout)
  auditLogger.warn(payload, `Security Event: ${event}`);

  // Route to a category file if type is provided
  const type = details.type;
  switch (type) {
    case "AUTHN":
      authnLogger.warn({ category: "AUTHN", event, ...details }, `Security Event: ${event}`);
      break;
    case "AUTHZ":
      authzLogger.warn({ category: "AUTHZ", event, ...details }, `Security Event: ${event}`);
      break;
    case "ADMIN_ACTION":
      adminLogger.warn(
        { category: "ADMIN_ACTION", event, ...details },
        `Security Event: ${event}`
      );
      break;
    case "PAYMENTS":
      paymentsLogger.warn(
        { category: "PAYMENTS", event, ...details },
        `Security Event: ${event}`
      );
      break;
    case "ABUSE":
      abuseLogger.warn({ category: "ABUSE", event, ...details }, `Security Event: ${event}`);
      break;
    case "DATA_ACCESS":
      dataAccessLogger.warn(
        { category: "DATA_ACCESS", event, ...details },
        `Security Event: ${event}`
      );
      break;
    default:
      // No category → only audit/main logger
      break;
  }
}

export default logger;

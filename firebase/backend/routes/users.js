// server.js (ESM)

import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import session from "express-session";
import { createClient } from "redis";
import RedisStore from "connect-redis";
import bodyParser from "body-parser";
import fs from "fs";

import pool from "./db.js";
import admin from "firebase-admin";
import serviceAccount from "./serviceAccountKey.json" with { type: "json" };
import { authorizePermission } from "./middleware/AuthorizePermission.js";
import { authorizeOwnership } from "./middleware/AuthorizeOwnership.js";
import { requireSelf } from "./middleware/requireSelf.js";
import { getApps } from "firebase-admin/app";

import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import Joi from "joi";

import mongoose from "mongoose";
import ServiceCatalog from "./models/ServiceCatalog.js";
import Stripe from "stripe";
import { getStripeCustomerId, upsertStripeCustomerId } from "./models/stripeCustomer.js";

// Import masking utilities
import { maskData } from "./utils/mask.js";

dotenv.config();
const app = express();

/* ─────────────────────────────────────────────────────────────
   1) CORS FIRST
   ───────────────────────────────────────────────────────────── */
const ALLOWED = new Set([
  process.env.FRONTEND_URL,
  process.env.FRONTEND_ORIGIN,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
].filter(Boolean));

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (
      ALLOWED.has(origin) ||
      /^http:\/\/localhost:\d{2,5}$/.test(origin) ||
      /^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(origin)
    ) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
app.use((req, res, next) => { res.header("Vary", "Origin"); next(); });

/* ─────────────────────────────────────────────────────────────
   2) Stripe init + Webhook BEFORE express.json()
   ───────────────────────────────────────────────────────────── */
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

/** ────────────────────────────────────────────────────────────
 *  🛍️ Order Fulfillment Logic (safe, idempotent)
 *  - Finds the Order linked to this PaymentIntent (by metadata.order_id
 *    or by payment_intent_id).
 *  - Verifies metadata.user_uid belongs to a real user.
 *  - Marks the order as 'paid' iff it is still 'pending'.
 *  - No-ops if already paid/failed (idempotent).
 *  - Extend here to send email, provision service, etc.
 *  ─────────────────────────────────────────────────────────── */


async function fulfillOrder(paymentIntent) {
  const { id: piId, amount: piAmount, currency: piCurrency, metadata } = paymentIntent || {};
  const orderIdMeta = metadata?.order_id ? Number(metadata.order_id) : null;
  const userUidMeta = metadata?.user_uid || metadata?.firebase_uid || null;

  //console.log(`[FULFILLMENT] start`, { piId, orderIdMeta, userUidMeta });

  // Basic metadata presence
  if (!orderIdMeta || !userUidMeta) {
    console.error(`[FULFILLMENT] PI ${piId} missing order_id or user_uid metadata; refusing to fulfill.`);
    return;
  }

  // 1) Load order WITH the fields we need to validate
  const ordRes = await pool.query(
    `SELECT id, user_uid, status, payment_intent_id, amount_cents, currency
       FROM "Order"
      WHERE id = $1`,
    [orderIdMeta]
  );
  const order = ordRes.rows[0];
  if (!order) {
    console.error(`[FULFILLMENT] No Order ${orderIdMeta} found for PI ${piId}; skipping.`);
    return;
  }

  // 2) Ownership check
  if (order.user_uid !== userUidMeta) {
    console.error(`[FULFILLMENT] User mismatch: order.user=${order.user_uid} vs pi.user=${userUidMeta}; refusing.`);
    return;
  }

  // 3) PI attached? (If not yet, allow attaching by PI id fallback; optional)
  if (order.payment_intent_id && order.payment_intent_id !== piId) {
    console.error(`[FULFILLMENT] PI mismatch: order.PI=${order.payment_intent_id} vs webhook.PI=${piId}; refusing.`);
    return;
  }

  // 4) Amount & currency checks (normalize currency comparison)
  const orderCurrencyNorm = String(order.currency).toLowerCase();
  const piCurrencyNorm = String(piCurrency).toLowerCase();

  const mismatches = [];
  if (order.amount_cents !== Number(piAmount)) mismatches.push(`amount (${order.amount_cents} != ${piAmount})`);
  if (orderCurrencyNorm !== piCurrencyNorm) mismatches.push(`currency (${orderCurrencyNorm} != ${piCurrencyNorm})`);

  if (mismatches.length > 0) {
    console.error(`[FULFILLMENT] Refusing: ${mismatches.join(", ")} for order ${order.id}, PI ${piId}`);
    // Optional: mark failed for visibility (only if still pending)
    await pool.query(
      `UPDATE "Order" SET status='failed', updated_at=NOW() WHERE id=$1 AND status='pending'`,
      [order.id]
    );
    return;
  }

  // 5) If all checks pass, mark paid (idempotent: only from pending)
  const upd = await pool.query(
    `UPDATE "Order"
        SET status='paid', payment_intent_id = COALESCE(payment_intent_id, $2), updated_at=NOW()
      WHERE id=$1 AND status='pending'`,
    [order.id, piId]
  );

  //console.log(`[FULFILLMENT] rowCount=${upd.rowCount} (id=${order.id}, pi=${piId})`);
  if (upd.rowCount === 0) {
    const cur = await pool.query(`SELECT id, status, payment_intent_id FROM "Order" WHERE id=$1`, [order.id]);
    console.warn(`[FULFILLMENT] No rows updated; current=`, cur.rows[0]);
  } else {
    console.log(`✅ Fulfilled Order ${order.id} for ${userUidMeta} — ${piAmount / 100} ${piCurrencyNorm.toUpperCase()}`);
  }
}



// Webhook
app.post("/api/stripe-webhook", bodyParser.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  if (!sig) return res.status(400).send("Missing Stripe signature");

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook verify failed:", err?.message);
    return res.status(400).send(`Webhook Error: ${err?.message}`);
  }

  //console.log(`[WEBHOOK] event ${event.id} type=${event.type}`);

  try {
    await pool.query(
      `INSERT INTO "StripeEvent"(event_id, event_type, received_at)
       VALUES ($1,$2,NOW())
       ON CONFLICT (event_id) DO NOTHING`,
      [event.id, event.type]
    );
  } catch {}

  try {
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object;
      //console.log(`[WEBHOOK] PI ${pi.id} succeeded; metadata=`, pi.metadata);
      await fulfillOrder(pi);
    } else if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object;
      const upd = await pool.query(
        `UPDATE "Order"
            SET status = 'failed', updated_at = NOW()
          WHERE payment_intent_id = $1`,
        [pi.id]
      );
      //console.log(`[WEBHOOK] marked failed rowCount=${upd.rowCount}`);
    }
  } catch (err) {
    console.error("Webhook handler failed:", err);
  }

  return res.sendStatus(200);
});

/* ─────────────────────────────────────────────────────────────
   3) Normal parsers AFTER webhook
   ───────────────────────────────────────────────────────────── */
app.use(express.json());
app.set("trust proxy", 1);

/* ─────────────────────────────────────────────────────────────
   4) Firebase Admin init
   ───────────────────────────────────────────────────────────── */
if (!getApps().length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID || "instafix-860fe",
  });
  console.log("✅ Firebase Admin initialized");
} else {
  console.log("♻️ Reusing existing Firebase Admin app");
  admin.app();
}

// ─────────────────────────────────────────────────────────────
// MongoDB (single connect; removed duplicate block)
// ─────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

/* ─────────────────────────────────────────────────────────────
   5) Redis session
   ───────────────────────────────────────────────────────────── */
const redisClient = createClient();
redisClient.connect().catch(console.error);
const redisStore = new RedisStore({ client: redisClient, prefix: "Instafix:" });
app.use(session({
  store: redisStore,
  name: "sid",
  resave: false,
  saveUninitialized: false,
  secret: process.env.SESSION_SECRET || "keyboard cat",
  cookie: { secure: false, httpOnly: true, sameSite: "lax", maxAge: 1000 * 60 * 60 * 24 },
}));

/* ─────────────────────────────────────────────────────────────
   6) Auth middleware
   ───────────────────────────────────────────────────────────── */
const verifyFirebaseToken = async (req, res, next) => {
  try {
    const hdr = req.headers.authorization || "";
    const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    const decoded = await admin.auth().verifyIdToken(token, true);
    req.user = decoded;
    return next();
  } catch (err) {
    console.error("Token verification failed:", err?.message || err);
    return res.status(401).json({ error: "Unauthorized" });
  }
};

/* ─────────────────────────────────────────────────────────────
   7) Stripe customer helper
   ───────────────────────────────────────────────────────────── */
async function getOrCreateStripeCustomer(user) {
  const { uid, email, displayName, name } = user || {};
  let customerId = await getStripeCustomerId(uid);
  if (customerId) return customerId;

  const customer = await stripe.customers.create({
    email: email || undefined,
    name: (displayName || name) || undefined,
    metadata: { firebase_uid: uid },
  });

  await upsertStripeCustomerId(uid, customer.id);
  return customer.id;
}

/* ─────────────────────────────────────────────────────────────
   8) Orders
   ───────────────────────────────────────────────────────────── */
app.post("/api/orders/create-and-pay", verifyFirebaseToken, async (req, res) => {
  try {
    const schema = Joi.object({
      request_id: Joi.string().guid({ version: ["uuidv4", "uuidv5"] }).required(),
      title: Joi.string().min(1).max(120).default("InstaFix Service"),
      amount: Joi.number().precision(2).min(0.5).max(999999).required(), // dollars
      currency: Joi.string().valid("usd", "eur", "gbp").default("usd"),
    });

    const { value, error } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json({ error: "Invalid request", details: error.details.map(d => d.message) });
    }

    const { request_id, title, amount } = value;
    const currencyNorm = String(value.currency).toLowerCase();
    const amount_cents = Math.round(Number(amount) * 100);
    if (amount_cents < 50) return res.status(400).json({ error: "Minimum amount is 50 cents" });

    // Upsert one row per logical checkout (save normalized currency)
    const upsertSql = `
      INSERT INTO "Order"(user_uid, title, amount_cents, currency, request_id, status, updated_at)
      VALUES ($1,$2,$3,$4,$5,'pending', NOW())
      ON CONFLICT (request_id) DO UPDATE
        SET title = EXCLUDED.title,
            amount_cents = EXCLUDED.amount_cents,
            currency = EXCLUDED.currency,
            updated_at = NOW()
      RETURNING id, payment_intent_id, currency, amount_cents
    `;
    const { rows } = await pool.query(upsertSql, [req.user.uid, title, amount_cents, currencyNorm, request_id]);
    const order = rows[0];

    // Reuse existing PI if safe
    if (order.payment_intent_id) {
      try {
        const pi = await stripe.paymentIntents.retrieve(order.payment_intent_id);
        const reusable = !["succeeded", "canceled", "requires_capture"].includes(pi.status);
        const sameAmount = pi.amount === amount_cents;
        const sameCurrency = pi.currency === currencyNorm;
        if (reusable && sameAmount && sameCurrency) {
          return res.json({ orderId: order.id, clientSecret: pi.client_secret, pi_id: pi.id });
        }
        // Not reusable → best-effort cancel
        try { await stripe.paymentIntents.cancel(order.payment_intent_id); } catch {}
      } catch {
        // If retrieve fails, proceed to create a fresh PI
      }
    }

    // Ensure Stripe customer
    const customerId = await getOrCreateStripeCustomer(req.user);

    // Stable idempotency per logical checkout
    const idemKey = `pay-${request_id}`;

    // Optional 3DS enforcement via env
    const require3DS = process.env.STRIPE_REQUIRE_3DS === "true";
    const paymentIntentParams = {
      amount: amount_cents,
      currency: currencyNorm,
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      metadata: { order_id: String(order.id), user_uid: req.user.uid, request_id },
      ...(require3DS ? { payment_method_options: { card: { request_three_d_secure: "any" } } } : {}),
    };

    // ✅ You were missing this call:
    const pi = await stripe.paymentIntents.create(paymentIntentParams, { idempotencyKey: idemKey });

    // Save PI + idem key (keep currency normalized)
    await pool.query(
      `UPDATE "Order"
          SET payment_intent_id = $1,
              stripe_idem_key   = $2,
              currency          = $3,
              updated_at        = NOW()
        WHERE id = $4`,
      [pi.id, idemKey, currencyNorm, order.id]
    );

    return res.json({ orderId: order.id, clientSecret: pi.client_secret, pi_id: pi.id });
  } catch (e) {
    console.error("[create-and-pay] error:", e);
    return res.status(500).json({ error: "Internal error" });
  }
});

/* ─────────────────────────────────────────────────────────────
   9) Misc routes
   ───────────────────────────────────────────────────────────── */
const products = [
  { id: 1, name: "T-Shirt", price: 25 },
  { id: 2, name: "Shoes", price: 80 },
  { id: 3, name: "Cap", price: 15 },
];
const servicesSample = [
  { id: 1, name: "Plumbing", price: 50 },
  { id: 2, name: "Electrical", price: 70 },
  { id: 3, name: "AC Repair", price: 100 },
];

const apiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 200,
  message: { error: "Too many attempts, try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
});
const userLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: (req) => {
    const sensitivePrefixes = ["/api/users", "/api/tasks", "/api/offers"];
    const sensitiveMethods = ["POST", "PUT", "DELETE"];
    if (sensitiveMethods.includes(req.method) && sensitivePrefixes.some(p => req.path.startsWith(p))) return 5;
    return 50;
  },
  message: { error: "Too many attempts, try again later" },
  keyGenerator: (req) => req.user?.uid || ipKeyGenerator(req),
  skip: (req) => !req.user,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/products", apiLimiter);
app.get("/api/products", (req, res) => res.json(products));
app.get("/api/me", (req, res) => { res.json({ user: req.session?.user ?? null }); });

/* ─────────────────────────────────────────────────────────────
   Auth login/logout
   ───────────────────────────────────────────────────────────── */
app.post("/api/login", apiLimiter, async (req, res, next) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: "idToken is required" });

    const decoded = await admin.auth().verifyIdToken(idToken, true);
    const uid = decoded.uid;
    const email = decoded.email ?? null;

    const found = await pool.query(
      `SELECT uid, email, role, "displayname", "photourl", address FROM "User" WHERE uid = $1`,
      [uid]
    );

    let roleFromDb;
    if (found.rows.length === 0) {
      const inserted = await pool.query(
        `INSERT INTO "User"(uid, email, created_at, updated_at)
         VALUES ($1,$2,NOW(),NOW())
         ON CONFLICT (uid) DO NOTHING
         RETURNING uid, email, role`,
        [uid, email]
      );
      const reread =
        inserted.rows[0] ??
        (await pool.query(`SELECT uid, email, role FROM "User" WHERE uid=$1`, [uid])).rows[0];
      roleFromDb = reread.role;
    } else {
      roleFromDb = found.rows[0].role;
    }

    await pool.query(
      `UPDATE "User"
          SET email = COALESCE($2, email),
              "displayname" = COALESCE($3, "displayname"),
              "photourl" = COALESCE($4, "photourl"),
              address = COALESCE($5, address),
              "emailverified" = COALESCE($6, "emailverified"),
              "phonenumber" = COALESCE($7, "phonenumber"),
              updated_at = NOW()
        WHERE uid = $1`,
      [
        uid,
        email,
        decoded.name ?? null,
        decoded.picture ?? null,
        null,
        decoded.email_verified ?? null,
        decoded.phone_number ?? null,
      ]
    );

    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.user = {
        id: uid,
        email,
        phoneNumber: decoded.phone_number,
        role: roleFromDb,
        name: decoded.name ?? null,
        photoURL: decoded.picture ?? null,
      };
      req.session.save((err2) => {
        if (err2) return next(err2);
        return res.json({ message: "Logged in successfully", user: req.session.user });
      });
    });
  } catch (e) {
    next(e);
  }
});
app.post("/api/logout", (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie("sid");
    res.json({ message: "Logged out" });
  });
});

// ======================= USERS ROUTES =======================
async function ensureCustomerClaim(uid) {
  const user = await admin.auth().getUser(uid);
  const current = user.customClaims || {};
  if (current.role === "customer") return;
  await admin.auth().setCustomUserClaims(uid, { ...current, role: "customer" });
}

const createUserSchema = Joi.object({
  providerID: Joi.string().max(120).allow(null, ""),
  displayName: Joi.string().min(1).max(120).allow(null, ""),
  address: Joi.string().max(512).allow(null, ""),
});
const updateUserSchema = Joi.object({
  displayname: Joi.string().min(1).max(120).allow(null, ""),
  displayName: Joi.string().min(1).max(120).allow(null, ""),
  address: Joi.string().max(512).allow(null, ""),
});

// Helper function to apply masking to user data
function maskUserData(user) {
  if (!user) return user;
  
  return {
    ...user,
    email: user.email ? maskData(user.email) : null,
    address: user.address ? maskData(user.address) : null,
  };
}

app.post("/api/users", verifyFirebaseToken, userLimiter, async (req, res) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ error: "No UID" });
  const { value, error } = createUserSchema.validate(req.body ?? {}, { stripUnknown: true });
  if (error) return res.status(400).json({ error: "Invalid payload", details: error.details.map(d => d.message) });

  const token = req.user;
  const email = token.email ?? null;
  const emailVerified = !!token.email_verified;
  const phoneNumber = token.phone_number ?? null;
  const photoURL = token.picture ?? null;
  const providerID = value.providerID ?? token.firebase?.sign_in_provider ?? null;
  const displayName = value.displayName ?? token.name ?? null;
  const address = value.address ?? null;
  try {
    await ensureCustomerClaim(uid);
    const result = await pool.query(
      `INSERT INTO "User"(uid, "providerid", "displayname", email, "emailverified", "phonenumber", role, "photourl", address, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
       ON CONFLICT (uid) DO UPDATE SET
         "providerid"=EXCLUDED."providerid",
         "displayname"=EXCLUDED."displayname",
         email=EXCLUDED.email,
         "emailverified"=EXCLUDED."emailverified",
         "phonenumber"=EXCLUDED."phonenumber",
         role=EXCLUDED.role,
         "photourl"=EXCLUDED."photourl",
         address=EXCLUDED.address,
         updated_at=NOW()
       RETURNING *;`,
      [uid, providerID, displayName, email, emailVerified, phoneNumber, "customer", photoURL, address]
    );
    
    // Apply masking only to email and address fields before sending response
    const maskedUser = maskUserData(result.rows[0]);
    res.json({ user: maskedUser });
  } catch (err) {
    console.error("❌ /api/users error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/users/:uid", verifyFirebaseToken, requireSelf("uid"), authorizePermission("profile_self", "read"), async (req, res) => {
  const { uid } = req.params;
  try {
    const result = await pool.query('SELECT * FROM "User" WHERE uid = $1', [uid]);
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
    
    // Apply masking only to email and address fields before sending response
    const maskedUser = maskUserData(result.rows[0]);
    res.json({ user: maskedUser });
  } catch (err) {
    console.error("❌ /api/users/:uid error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

app.put("/api/users/:uid", verifyFirebaseToken, requireSelf("uid"), authorizePermission("profile_self", "update"), async (req, res) => {
  const { value, error } = updateUserSchema.validate(req.body ?? {}, { stripUnknown: true });
  if (error) return res.status(400).json({ error: "Invalid payload", details: error.details.map(d => d.message) });
  const { uid } = req.params;
  const newDisplay = value.displayname ?? value.displayName ?? null;
  const address = value.address ?? null;
  try {
    const result = await pool.query(
      `UPDATE "User" SET "displayname"=COALESCE($1, "displayname"), address=COALESCE($2, address), updated_at=NOW() WHERE uid=$3 RETURNING *;`,
      [newDisplay, address, uid]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
    
    // Apply masking only to email and address fields before sending response
    const maskedUser = maskUserData(result.rows[0]);
    res.status(200).json({ user: maskedUser });
  } catch (err) {
    console.error("❌ PUT /api/users/:uid error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

app.delete("/api/users/:uid", verifyFirebaseToken, authorizeOwnership, async (req, res) => {
  const { uid } = req.params;
  try {
    const result = await pool.query('DELETE FROM "User" WHERE uid=$1 RETURNING *', [uid]);
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
    if (process.env.DELETE_FIREBASE_USER === "true") {
      try { await admin.auth().deleteUser(uid); } catch (e) { console.warn("⚠️ Firebase delete skipped:", e?.message || e); }
    }
    
    // Apply masking only to email and address fields before sending response
    const maskedUser = maskUserData(result.rows[0]);
    res.json({ message: "User deleted", user: maskedUser });
  } catch (err) {
    console.error("❌ DELETE /api/users/:uid error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

const signupSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  address: Joi.string().trim().min(1).max(500).required(),
  phoneNumber: Joi.string().pattern(/^(\+?[0-9]{7,15})$/).optional().allow(null, ''),
  desiredRole: Joi.string().valid('customer', 'technician').default('customer'),
  isVerified: Joi.boolean().optional(),
});

app.post("/api/signup", verifyFirebaseToken, async (req, res) => {
  try {
    const { uid, email, email_verified, name: tokenName } = req.user || {};
    if (!uid || !email) return res.status(401).json({ error: "No uid/email on verified token" });
    const incoming = {
      ...req.body,
      name: (req.body?.name ?? tokenName ?? '').trim(),
      address: (req.body?.address ?? '').trim(),
      phoneNumber: (req.body?.phoneNumber ?? '').trim(),
    };
    const { error, value } = signupSchema.validate(incoming, { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        details: error.details.map(d => ({ field: d.path[0], message: d.message })),
      });
    }
    const { name, address, phoneNumber, desiredRole, isVerified } = value;
    const role = desiredRole === 'technician' ? 'technician' : 'customer';
    const upsertSql = `
      INSERT INTO "User"(uid, email, "displayname", address, "phonenumber", role, "emailverified", created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
      ON CONFLICT (uid) DO UPDATE SET
        email=EXCLUDED.email,
        "displayname"=EXCLUDED."displayname",
        address=EXCLUDED.address,
        "phonenumber"=EXCLUDED."phonenumber",
        role=EXCLUDED.role,
        "emailverified"=EXCLUDED."emailverified",
        updated_at=NOW()
      RETURNING uid, email, "displayname" AS displayname, address, "phonenumber" AS phonenumber, role, "emailverified" AS emailverified, created_at, updated_at;`;
    const params = [uid, email, name, address, phoneNumber || null, role, email_verified || !!isVerified];
    const { rows } = await pool.query(upsertSql, params);
    try {
      const u = await admin.auth().getUser(uid);
      const claims = u.customClaims || {};
      if (claims.role !== role) await admin.auth().setCustomUserClaims(uid, { ...claims, role });
    } catch (e) { console.warn("⚠️ setCustomUserClaims skipped:", e?.message || e); }
    
    // Apply masking only to email and address fields before sending response
    const maskedUser = maskUserData(rows[0]);
    res.json({ ok: true, user: maskedUser });
  } catch (e) {
    console.error("[/api/signup] error:", e?.stack || e);
    res.status(500).json({ error: "SIGNUP_FAILED" });
  }
});

app.post("/api/me/mfa/totp-enabled", verifyFirebaseToken, async (req, res) => {
  try {
    await pool.query('UPDATE "User" SET totp_enabled = TRUE, updated_at = NOW() WHERE uid = $1', [req.user.uid]);
    res.json({ ok: true });
  } catch (e) {
    console.error("❌ /api/me/mfa/totp-enabled error:", e);
    res.status(500).json({ error: "db_update_failed" });
  }
});

app.post("/api/admin/users/:uid/role", authorizePermission("user_management", "update"), async (req, res, next) => {
  try {
    const { uid } = req.params;
    const { role } = req.body;
    const { rowCount } = await pool.query(`UPDATE "User" SET role = $2 WHERE uid = $1`, [uid, role]);
    if (rowCount === 0) return res.status(404).json({ error: "User not found" });
    if (req.session?.user?.id === uid) {
      req.session.user.role = role;
      return req.session.save(err => err ? next(err) : res.json({ ok: true }));
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.get("/api/admin/users", verifyFirebaseToken, authorizePermission("user_management", "read"), async (req, res) => {
  const result = await pool.query('SELECT * FROM "User"');
  
  // Apply masking only to email and address fields for all users in admin view
  const maskedUsers = result.rows.map(user => maskUserData(user));
  res.json(maskedUsers);
});

/* Error handler */
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err?.status || 500).json({ error: err?.message || "Server error" });
});

// Service Catalog Routes
const serviceCreateSchema = Joi.object({
  name: Joi.string().trim().min(2).max(80).pattern(/^[A-Za-z0-9 \-_'&()]+$/).required(),
  category: Joi.string().valid('plumbing','electrical','hvac','appliance','general').required(),
  description: Joi.string().trim().max(2000).allow('', null).custom((v, h) => {
    if (/[<>]/.test(v || '')) return h.error('any.invalid');
    return v;
  }, 'no angle brackets').messages({ 'any.invalid': 'Description must not contain angle brackets' }),
  base_price: Joi.number().min(0.01).max(100000).required(),
  estimated_time: Joi.number().integer().min(1).max(480).required(), // minutes
}).prefs({ stripUnknown: true });


const serviceRequestSchema = Joi.object({
  customer_uid: Joi.string().required(),
  service_name: Joi.string().trim().min(1).max(100).required(),
  service_category: Joi.string().valid('plumbing','electrical','hvac','appliance','general').required(),
  scheduled_date: Joi.date().iso().min('now').required(),
  total_price: Joi.number().precision(2).min(0.01).max(100000).required(),
  notes: Joi.string().trim().max(1000).allow('', null),
  technician_uid: Joi.string().optional().allow(null) //keeping technician_uid optional until assigned
}).prefs({ stripUnknown: true }); // ✅ Security: ignore extra fields

const serviceUpdateSchema = serviceCreateSchema.fork(
  ['name','category','description','base_price','estimated_time'],
  (schema) => schema.optional()
).min(1); // require at least one field

// Layered rate limiting (IP + authenticated user) for service endpoints
// Rationale: mitigate scraping/enumeration (read) and abuse/spam (write) per OWASP & secure design
const serviceReadLimiterIP = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 min
  max: 150, // per IP
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  message: { error: 'Too many service list requests from this IP. Try again later.' }
});
const serviceReadLimiterUser = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: (req) => req.user ? 100 : 0, // only applies if user present
  skip: (req) => !req.user, // skip if unauthenticated
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid,
  message: { error: 'Too many service list requests for this account. Slow down.' }
});
const serviceWriteLimiterIP = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 30, // broad IP cap
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  message: { error: 'Too many service modifications from this IP. Try later.' }
});
const serviceWriteLimiterUser = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: (req) => req.user ? 10 : 0, // tighter per authenticated user
  skip: (req) => !req.user,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid,
  message: { error: 'Too many service modifications. Please slow down.' }
});

// Add query validation for listing services
const serviceQuerySchema = Joi.object({
  category: Joi.string().valid('plumbing','electrical','hvac','appliance','general'),
  search: Joi.string().trim().min(1).max(80),
  limit: Joi.number().integer().min(1).max(100).default(50),
  skip: Joi.number().integer().min(0).default(0)
}).prefs({ stripUnknown: true });

// GET services (with optional filters and pagination)
app.get('/api/services', serviceReadLimiterIP, serviceReadLimiterUser, async (req, res) => {
  const { value, error } = serviceQuerySchema.validate(req.query);
  if (error) return res.status(400).json({ error: 'Invalid query', details: error.details.map(d => d.message) });
  const { category, search, limit, skip } = value;
  const filter = {};
  if (category) filter.category = category;
  if (search) {
    filter.name = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, r => '\\' + r), $options: 'i' };
  }
  try {
    const docs = await ServiceCatalog.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean();
    res.json(docs);
  } catch (e) {
    console.error('❌ Error fetching services:', e);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

app.post('/api/services', verifyFirebaseToken, serviceWriteLimiterIP, serviceWriteLimiterUser, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required to manage services' });
  }
  const { value, error } = serviceCreateSchema.validate(req.body);
  if (error) return res.status(400).json({ error: 'Invalid service', details: error.details.map(d => d.message) });
  try {
    const svc = new ServiceCatalog(value);
    const saved = await svc.save();
    return res.status(201).json(saved);
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'Service name/category already exists' });
    console.error('❌ Error adding service:', e);
    return res.status(400).json({ error: e.message });
  }
});

app.put('/api/services/:id', verifyFirebaseToken, serviceWriteLimiterIP, serviceWriteLimiterUser, async (req, res) => {

   if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required to manage services' });
  }
  
  const { value, error } = serviceUpdateSchema.validate(req.body);
  if (error) return res.status(400).json({ error: 'Invalid update', details: error.details.map(d => d.message) });
  try {
    const updated = await ServiceCatalog.findByIdAndUpdate(req.params.id, { $set: value }, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ error: 'Service not found' });
    return res.json(updated);
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'Duplicate name/category' });
    console.error('❌ Error updating service:', e);
    return res.status(400).json({ error: e.message });
  }
});

app.post('/api/requests', verifyFirebaseToken,async (req, res) => {
  const { value, error } = serviceRequestSchema.validate(req.body);
  if (error) return res.status(400).json({ error: 'Invalid request', details: error.details.map(d => d.message) });
    if (req.user.uid !== value.customer_uid) {
    return res.status(403).json({ error: 'Can only create service bookings for yourself' });
  }
  try {
    // Optional: verify service exists and matches category
    const svc = await ServiceCatalog.findOne({ name: value.service_name, category: value.service_category });
    if (!svc) return res.status(400).json({ error: 'Service name/category mismatch or not found' });

    // Insert (assumes ServiceRequest table exists with matching columns)
    const result = await pool.query(
      `INSERT INTO "ServiceRequest"(customer_uid, technician_uid, service_name, service_category, scheduled_date, total_price, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING *`,
      [ 
        value.customer_uid, 
        null, // technician_uid is NULL until assigned
        value.service_name, 
        value.service_category, 
        value.scheduled_date, 
        value.total_price, 
        value.notes || null
      ]
    );
    return res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error('❌ Error creating request:', e);
    return res.status(500).json({ error: 'Failed to create service request' });
  }
});

/* Start */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => { console.log(`✅ Backend running at http://localhost:${PORT}`); });
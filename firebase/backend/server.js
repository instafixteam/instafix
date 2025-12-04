// server.js (ESM)
// test-pr--
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import session from "express-session";
import { createClient } from "redis";
import RedisStore from "connect-redis";
import bodyParser from "body-parser";
import fs from "fs";

import pool from "./db.js";
import admin from "firebase-admin";
import { authorizePermission } from "./middleware/AuthorizePermission.js";
import { authorizeOwnership } from "./middleware/AuthorizeOwnership.js";
import { requireSelf } from "./middleware/requireSelf.js";
import { getApps } from "firebase-admin/app";

import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import Joi from "joi";
import mongoose from "mongoose";
import ServiceCatalog from "./models/ServiceCatalog.js";
import sumsubRoutes from "./server/routes/kycRoutes.js";
import adminTechnicianRoutes from "./server/routes/technicians.js";
import Stripe from "stripe";
import { getStripeCustomerId, upsertStripeCustomerId } from "./models/stripeCustomer.js";
import cartRouter from "./routes/cart.js";
// Import encryption utilities
import { encryptText, decryptText, maskPhoneNumber, maskAddress } from "./utils/userEncryption.js";

import technicianRouter from "./routes/technician.routes.js";
import specialityRouter from "./routes/speciality.routes.js";
import { verifyFirebaseToken } from "./middleware/verifyFirebaseToken.js";
import { sendOrderConfirmationEmail } from "./utils/emailService.js";
import emailRoutes from "./routes/emailroutes.js";
import crypto from "crypto";

import pinoHttp from "pino-http";
import logger, { createRequestLogger } from "./logger.js";
import {
  logAuthn,
  logAuthz,
  logAdminAction,
  logPayment,
  logAbuse,
  logDataAccess,
  logSecurityEvent,
} from "./logger.js";
import orderRouter from "./routes/orders.routes.js";


dotenv.config();
const app = express();

/* ─────────────────────────────────────────────────────────────
   1) CORS FIRST
   ───────────────────────────────────────────────────────────── */
const ALLOWED = new Set(
  [
    process.env.FRONTEND_URL,
    process.env.FRONTEND_ORIGIN,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ].filter(Boolean)
);

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (
      ALLOWED.has(origin) ||
      /^http:\/\/localhost:\d{2,5}$/.test(origin) ||
      /^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(origin)
    )
      return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
app.use((req, res, next) => {
  res.header("Vary", "Origin");
  next();
});
app.use("/api/email", emailRoutes);

// Attach Pino HTTP logging + correlation IDs
app.use(
  pinoHttp({
    logger,
    genReqId: (req, res) =>
      req.headers["x-request-id"] ||
      req.headers["x-correlation-id"] ||
      crypto.randomUUID(),
  })
);

// Attach a child logger with correlation ID + requestId to req.log
app.use((req, res, next) => {
  req.log = createRequestLogger(req);
  next();
});

// Temporary email test route
app.get("/api/email/test", (req, res) => {
  res.json({ message: "Email route is working!" });
});

/* ─────────────────────────────────────────────────────────────
   2) Stripe init + Webhook BEFORE express.json()
   ───────────────────────────────────────────────────────────── */
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

async function fulfillOrder(paymentIntent) {
  const { id: piId, amount: piAmount, currency: piCurrency, metadata } =
    paymentIntent || {};
  const orderIdMeta = metadata?.order_id ? Number(metadata.order_id) : null;
  const userUidMeta = metadata?.user_uid || metadata?.firebase_uid || null;

  logPayment("FULFILL_START", {
    stripe_pi_id: piId,
    order_id: orderIdMeta,
    user: userUidMeta ? { uid: userUidMeta } : undefined,
  });

  if (!orderIdMeta || !userUidMeta) {
    console.error(
      `[FULFILLMENT] PI ${piId} missing order_id or user_uid metadata; refusing to fulfill.`
    );
    logPayment("FULFILL_REFUSED_MISSING_METADATA", {
      stripe_pi_id: piId,
      has_order_id: !!orderIdMeta,
      has_user_uid: !!userUidMeta,
    });
    return;
  }

  const ordRes = await pool.query(
    `SELECT id, user_uid, status, payment_intent_id, total_amount, currency
       FROM "Order"
      WHERE id = $1`,
    [orderIdMeta]
  );
  const order = ordRes.rows[0];
  if (!order) {
    console.error(
      `[FULFILLMENT] No Order ${orderIdMeta} found for PI ${piId}; skipping.`
    );
    logPayment("FULFILL_ORDER_NOT_FOUND", {
      stripe_pi_id: piId,
      order_id: orderIdMeta,
    });
    return;
  }

  if (order.user_uid !== userUidMeta) {
    console.error(
      `[FULFILLMENT] User mismatch: order.user=${order.user_uid} vs pi.user=${userUidMeta}; refusing.`
    );
    logPayment("FULFILL_USER_MISMATCH", {
      stripe_pi_id: piId,
      order_id: order.id,
    });
    return;
  }

  if (order.payment_intent_id && order.payment_intent_id !== piId) {
    console.error(
      `[FULFILLMENT] PI mismatch: order.PI=${order.payment_intent_id} vs webhook.PI=${piId}; refusing.`
    );
    logPayment("FULFILL_PI_MISMATCH", {
      stripe_pi_id: piId,
      order_id: order.id,
      order_pi: order.payment_intent_id,
    });
    return;
  }

  const orderCurrencyNorm = String(order.currency).toLowerCase();
  const piCurrencyNorm = String(piCurrency).toLowerCase();

  const mismatches = [];
  const orderAmountCents = Math.round(Number(order.total_amount) * 100);
  if (orderAmountCents !== Number(piAmount))
    mismatches.push(`amount (${orderAmountCents} != ${piAmount})`);
  if (orderCurrencyNorm !== piCurrencyNorm)
    mismatches.push(`currency (${orderCurrencyNorm} != ${piCurrencyNorm})`);

  if (mismatches.length > 0) {
    console.error(
      `[FULFILLMENT] Refusing: ${mismatches.join(
        ", "
      )} for order ${order.id}, PI ${piId}`
    );
    logPayment("AMOUNT_CURRENCY_MISMATCH", {
      order_id: order.id,
      stripe_pi_id: piId,
      mismatches,
    });
    await pool.query(
      `UPDATE "Order" SET status='failed', updated_at=NOW() WHERE id=$1 AND status='pending'`,
      [order.id]
    );
    return;
  }

  const upd = await pool.query(
    `UPDATE "Order"
        SET status='paid', payment_intent_id = COALESCE(payment_intent_id, $2), updated_at=NOW()
      WHERE id=$1 AND status='pending'`,
    [order.id, piId]
  );

  // console.log(
  // `[FULFILLMENT] rowCount=${upd.rowCount} (id=${order.id}, pi=${piId})`
  // );
  if (upd.rowCount === 0) {
    const cur = await pool.query(
      `SELECT id, status, payment_intent_id FROM "Order" WHERE id=$1`,
      [order.id]
    );
    console.warn(`[FULFILLMENT] No rows updated; current=`, cur.rows[0]);
  } else {
    /*console.log(
      `✅ Fulfilled Order ${order.id} for ${userUidMeta} — ${piAmount / 100
      } ${piCurrencyNorm.toUpperCase()}`
    );*/
    logPayment("FULFILL_SUCCESS", {
      order_id: order.id,
      stripe_pi_id: piId,
      amount_cents: piAmount,
      currency: piCurrencyNorm,
    });
  }
}

// Webhook
app.post(
  "/api/stripe-webhook",
  bodyParser.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    if (!sig) {
      logPayment("WEBHOOK_MISSING_SIGNATURE", {
        route: "/api/stripe-webhook",
        ip: req.ip,
      });
      return res.status(400).send("Missing Stripe signature");
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Webhook verify failed:", err?.message);
      logPayment("WEBHOOK_VERIFY_FAILED", {
        error: err.message,
      });
      return res.status(400).send(`Webhook Error: ${err?.message}`);
    }

    // console.log(`[WEBHOOK] event ${event.id} type=${event.type}`);
    logPayment("WEBHOOK_RECEIVED", {
      event_id: event.id,
      event_type: event.type,
    });

    try {
      await pool.query(
        `INSERT INTO "StripeEvent"(event_id, event_type, received_at)
         VALUES ($1,$2,NOW())
         ON CONFLICT (event_id) DO NOTHING`,
        [event.id, event.type]
      );
    } catch { }

    try {
      if (event.type === "payment_intent.succeeded") {
        const pi = event.data.object;
        // console.log(
        //   `[WEBHOOK] PI ${pi.id} succeeded; metadata=`,
        //   pi.metadata
        // );
        logPayment("PI_SUCCEEDED_WEBHOOK", {
          stripe_pi_id: pi.id,
          order_id: pi.metadata?.order_id,
        });
        await fulfillOrder(pi);
      } else if (event.type === "payment_intent.payment_failed") {
        const pi = event.data.object;
        const upd = await pool.query(
          `UPDATE "Order"
              SET status = 'failed', updated_at = NOW()
            WHERE payment_intent_id = $1`,
          [pi.id]
        );
        // console.log(`[WEBHOOK] marked failed rowCount=${upd.rowCount}`);
        logPayment("PI_FAILED_WEBHOOK", {
          stripe_pi_id: pi.id,
          updated_rows: upd.rowCount,
        });
      }
    } catch (err) {
      console.error("Webhook handler failed:", err);
      logPayment("WEBHOOK_HANDLER_FAILED", {
        error: err.message,
        event_id: event.id,
        event_type: event.type,
      });
    }

    return res.sendStatus(200);
  }
);

/* ─────────────────────────────────────────────────────────────
   3) Normal parsers AFTER webhook
   ───────────────────────────────────────────────────────────── */
app.use(express.json());
app.use(cookieParser());
app.set("trust proxy", 1);

/* ─────────────────────────────────────────────────────────────
   4) Firebase Admin init
   ───────────────────────────────────────────────────────────── */
if (!getApps().length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      type: process.env.FIREBASE_TYPE,
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
    })
  });
  console.log("✅ Firebase Admin initialized");
} else {
  console.log("♻️ Reusing existing Firebase Admin app");
  admin.app();
}

// ─────────────────────────────────────────────────────────────
// MongoDB connection
// ─────────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

/* ─────────────────────────────────────────────────────────────
   5) Redis session
   ───────────────────────────────────────────────────────────── */
const redisClient = createClient();
redisClient.connect().catch(console.error);
const redisStore = new RedisStore({ client: redisClient, prefix: "Instafix:" });
app.use(
  session({
    store: redisStore,
    name: "sid",
    resave: false,
    saveUninitialized: false,
    secret: process.env.SESSION_SECRET || "keyboard cat",
    cookie: {
      secure: false,
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

// Update the verifyFirebaseToken middleware or add debugging
app.use(
  "/api/cart",
  (req, res, next) => {
    //console.log("Cart route - Headers:", req.headers);
    next();
  },
  verifyFirebaseToken,
  cartRouter
);

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
   8) Consolidated Checkout Route
   ───────────────────────────────────────────────────────────── */

import { getUserCart, clearUserCart } from "./utils/cartStorage.js";

// Helper to get cart items and total
async function getCartItemsAndTotal(uid) {
  const raw = getUserCart(uid);
  const ids = Object.keys(raw);
  if (ids.length === 0) return { items: [], total_amount: 0 };

  const svcDocs = await ServiceCatalog.find({
    _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
  });
  const byId = Object.fromEntries(svcDocs.map((d) => [String(d._id), d]));

  const items = ids
    .filter((id) => byId[id])
    .map((id) => {
      const svc = byId[id];
      const unit_price = Number(svc.base_price);
      return {
        service_id: id,
        name: svc.name,
        quantity: raw[id],
        unit_price,
      };
    });

  const total_amount = items.reduce(
    (sum, item) => sum + item.unit_price * item.quantity,
    0
  );
  return { items, total_amount };
}

// Consolidated checkout route - handles both cart and direct payments
app.post("/api/checkout", verifyFirebaseToken, async (req, res) => {
  try {
    const schema = Joi.object({
      // For direct payments
      amount: Joi.number().precision(2).min(0.5).max(999999).optional(),
      title: Joi.string().min(1).max(120).optional(),
      currency: Joi.string().valid("usd", "eur", "gbp", "egp").default("usd"),
      // For cart checkout
      cart_checkout: Joi.boolean().default(false),
    });

    const { value, error } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      logAbuse("VALIDATION_REJECT", {
        route: "/api/checkout",
        reason: "INVALID_BODY",
        details: error.details.map((d) => d.message),
      });
      return res
        .status(400)
        .json({ error: "Invalid request", details: error.details.map((d) => d.message) });
    }

    const { amount, title, currency, cart_checkout } = value;
    const uid = req.user.uid;

    let final_amount,
      final_title,
      order_items = [];

    if (cart_checkout) {
      // Cart checkout flow
      const cartData = await getCartItemsAndTotal(uid);
      req.log?.debug?.(
        { cart_item_count: cartData.items.length },
        "Cart data for checkout"
      );

      if (cartData.items.length === 0) {
        return res.status(400).json({ error: "Cart is empty" });
      }

      final_amount = cartData.total_amount;
      final_title = `Cart: ${cartData.items
        .map((item) => `${item.name} (x${item.quantity})`)
        .join(", ")}`;
      order_items = cartData.items;
    } else {
      // Direct payment flow
      if (!amount || !title) {
        return res
          .status(400)
          .json({ error: "Amount and title are required for direct payments" });
      }
      final_amount = amount;
      final_title = title;
    }

    const currencyNorm = String(currency).toLowerCase();
    const request_id = `checkout-${uid}-${Date.now()}`;

    // Create order with total amount (not cents)
    const upsertSql = `
      INSERT INTO "Order"(user_uid, title, total_amount, currency, request_id, status, items, updated_at)
      VALUES ($1, $2, $3, $4, $5, 'pending', $6, NOW())
      RETURNING id, payment_intent_id, currency, total_amount
    `;

    const { rows } = await pool.query(upsertSql, [
      uid,
      final_title,
      final_amount,
      currencyNorm,
      request_id,
      JSON.stringify(order_items),
    ]);
    const order = rows[0];

    logPayment("ORDER_CREATED", {
      order_id: order.id,
      user: { uid },
      amount: final_amount,
      currency: currencyNorm,
      source: cart_checkout ? "cart" : "direct",
      request_id,
    });

    req.log.info(
      {
        type: "PAYMENTS",
        action: "ORDER_CREATED",
        order_id: order.id,
        user: { uid },
        amount: final_amount,
        currency: currencyNorm,
        source: cart_checkout ? "cart" : "direct",
      },
      "Order created before PaymentIntent"
    );

    // Reuse existing payment intent if possible
    if (order.payment_intent_id) {
      try {
        const pi = await stripe.paymentIntents.retrieve(
          order.payment_intent_id
        );
        const reusable = !["succeeded", "canceled", "requires_capture"].includes(
          pi.status
        );
        const sameAmount = pi.amount === Math.round(final_amount * 100);
        const sameCurrency = pi.currency === currencyNorm;

        if (reusable && sameAmount && sameCurrency) {
          logPayment("PI_REUSED", {
            order_id: order.id,
            stripe_pi_id: pi.id,
            amount: final_amount,
            currency: currencyNorm,
          });
          return res.json({
            orderId: order.id,
            clientSecret: pi.client_secret,
            pi_id: pi.id,
            amount: final_amount,
            currency: currencyNorm,
          });
        }
        try {
          await stripe.paymentIntents.cancel(order.payment_intent_id);
        } catch { }
      } catch { }
    }

    // Get or create Stripe customer
    const customerId = await getOrCreateStripeCustomer(req.user);
    const amount_cents = Math.round(final_amount * 100);

    if (amount_cents < 50) {
      return res.status(400).json({ error: "Minimum amount is 50 cents" });
    }

    const idemKey = `pay-${request_id}`;
    const require3DS = process.env.STRIPE_REQUIRE_3DS === "true";

    const paymentIntentParams = {
      amount: amount_cents,
      currency: currencyNorm,
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      metadata: {
        order_id: String(order.id),
        user_uid: uid,
        request_id,
        source: cart_checkout ? "cart" : "direct",
      },
      ...(require3DS
        ? {
          payment_method_options: {
            card: { request_three_d_secure: "any" },
          },
        }
        : {}),
    };

    const pi = await stripe.paymentIntents.create(paymentIntentParams, {
      idempotencyKey: idemKey,
    });

    logPayment("PI_CREATED", {
      order_id: order.id,
      stripe_pi_id: pi.id,
      amount: final_amount,
      currency: currencyNorm,
      require3DS,
      request_id,
    });

    // Update order with payment intent
    await pool.query(
      `UPDATE "Order"
          SET payment_intent_id = $1,
              stripe_idem_key   = $2,
              updated_at        = NOW()
        WHERE id = $3`,
      [pi.id, idemKey, order.id]
    );

    // Clear cart if this was a cart checkout
    if (cart_checkout) {
      clearUserCart(uid);
    }

    return res.json({
      orderId: order.id,
      clientSecret: pi.client_secret,
      pi_id: pi.id,
      amount: final_amount,
      currency: currencyNorm,
    });
  } catch (e) {
    //console.error("[checkout] error:", e);
    logPayment("CHECKOUT_FAILED", {
      user: req.user ? { uid: req.user.uid } : undefined,
      error: e.message,
      route: "/api/checkout",
    });
    return res.status(500).json({ error: "Checkout failed" });
  }
});



// // Get user's orders
// app.get("/api/orders", verifyFirebaseToken, async (req, res) => {

//   try {
//     const uid = req.user.uid;
//     const result = await pool.query(
//       `SELECT id, title, total_amount, currency, status, created_at
//        FROM "Order" 
//        WHERE user_uid = $1 
//        ORDER BY created_at DESC
//        LIMIT 50`,
//       [uid]
//     );

//     logDataAccess("ORDER_LIST_READ", {
//       actor: { uid },
//       resource_type: "ORDER",
//       result_count: result.rows.length,
//     });

//     res.json({ orders: result.rows });
//   } catch (e) {
//     console.error("[get-orders] error:", e);
//     res.status(500).json({ error: "Failed to fetch orders" });
//   }
// });

/* ─────────────────────────────────────────────────────────────
   9) Rate limiting
   ───────────────────────────────────────────────────────────── */

const apiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 200,
  message: { error: "Too many attempts, try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  handler: (req, res, next, options) => {
    logAbuse("RATE_LIMIT_HIT", {
      route: req.originalUrl,
      method: req.method,
      key: ipKeyGenerator(req),
      scope: "api",
    });
    res.status(options.statusCode || 429).json(options.message);
  },
});

const userLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: (req) => {
    const sensitivePrefixes = ["/api/users", "/api/tasks", "/api/offers"];
    const sensitiveMethods = ["POST", "PUT", "DELETE"];
    if (
      sensitiveMethods.includes(req.method) &&
      sensitivePrefixes.some((p) => req.path.startsWith(p))
    )
      return 5;
    return 50;
  },
  message: { error: "Too many attempts, try again later" },
  keyGenerator: (req) => req.user?.uid || ipKeyGenerator(req),
  skip: (req) => !req.user,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logAbuse("RATE_LIMIT_HIT", {
      route: req.originalUrl,
      method: req.method,
      key: req.user?.uid || ipKeyGenerator(req),
      scope: "user",
    });
    res.status(options.statusCode || 429).json(options.message);
  },
});

app.use("/api/products", apiLimiter);
app.get("/api/products", (req, res) => res.json(products));
app.get("/api/me", (req, res) => {
  res.json({ user: req.session?.user ?? null });
});

/* ─────────────────────────────────────────────────────────────
   Auth login/logout
   ───────────────────────────────────────────────────────────── */
app.post("/api/login", apiLimiter, async (req, res, next) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      logAbuse("VALIDATION_REJECT", {
        route: "/api/login",
        reason: "MISSING_IDTOKEN",
      });
      return res.status(400).json({ error: "idToken is required" });
    }

    const decoded = await admin.auth().verifyIdToken(idToken, true);
    const uid = decoded.uid;
    const email = decoded.email ?? null;

    // AUTHN: login success
    logAuthn("LOGIN_SUCCESS", {
      user: { uid, email },
      auth_provider: decoded.firebase?.sign_in_provider || "password",
    });

    req.log.info(
      {
        type: "AUTHN",
        action: "LOGIN_SUCCESS",
        user: { uid, email },
        auth_provider: decoded.firebase?.sign_in_provider || "password",
      },
      "User login succeeded"
    );

    // Create a Firebase session cookie (~5 days)
    const expiresIn = 5 * 24 * 60 * 60 * 1000;
    const fbSessionCookie = await admin
      .auth()
      .createSessionCookie(idToken, { expiresIn });
    res.cookie("__session", fbSessionCookie, {
      httpOnly: true,
      secure: false, // set true behind HTTPS/proxy in prod
      sameSite: "lax",
      maxAge: expiresIn,
      path: "/",
    });

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
        (
          await pool.query(
            `SELECT uid, email, role FROM "User" WHERE uid=$1`,
            [uid]
          )
        ).rows[0];
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
        return res.json({
          message: "Logged in successfully",
          user: req.session.user,
        });
      });
    });
  } catch (e) {
    //AUTHN: login failure
    logAuthn("LOGIN_FAILURE", {
      reason: e.code || e.message,
      route: "/api/login",
    });

    req.log.warn(
      {
        type: "AUTHN",
        action: "LOGIN_FAILURE",
        reason: e.code || e.message,
      },
      "User login failed"
    );
    next(e);
  }
});

app.post("/api/logout", (req, res, next) => {
  const user = req.session?.user;
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie("sid");

    logAuthn("LOGOUT", {
      user: user ? { uid: user.id, email: user.email } : undefined,
    });

    req.log.info(
      {
        type: "AUTHN",
        action: "LOGOUT",
        user: user ? { uid: user.id, email: user.email } : undefined,
      },
      "User logged out"
    );

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

// Validation Schemas (from last commit)
const namePattern = /^[\p{L}\p{M}][\p{L}\p{M}\s.'-]{1,99}$/u;
const addressPattern = /^[\p{L}\p{M}\p{N}\s.,'#()\-/]{5,500}$/u;

const createUserSchema = Joi.object({
  providerID: Joi.string().max(120).allow(null, ""),
  displayName: Joi.string()
    .min(2)
    .max(100)
    .pattern(namePattern)
    .allow(null, ""),
  address: Joi.string()
    .min(5)
    .max(500)
    .pattern(addressPattern)
    .allow(null, ""),
  phoneNumber: Joi.string().pattern(/^\+?[0-9]{7,15}$/).allow(null, ""),
});

const updateUserSchema = Joi.object({
  displayname: Joi.string()
    .min(2)
    .max(100)
    .pattern(namePattern)
    .allow(null, ""),
  displayName: Joi.string()
    .min(2)
    .max(100)
    .pattern(namePattern)
    .allow(null, ""),
  address: Joi.string()
    .min(5)
    .max(500)
    .pattern(addressPattern)
    .allow(null, ""),
  phoneNumber: Joi.string().pattern(/^\+?[0-9]{7,15}$/).allow(null, ""),
});

const signupSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(100)
    .pattern(namePattern)
    .required()
    .label("Full name")
    .messages({
      "string.min": "Full name must be at least 2 characters long",
      "string.pattern.base":
        "Full name may include letters, spaces, apostrophes, periods, and hyphens only",
    }),
  address: Joi.string()
    .min(5)
    .max(500)
    .pattern(addressPattern)
    .required()
    .label("Address")
    .messages({
      "string.min": "Address must be at least 5 characters long",
      "string.pattern.base":
        "Address may include letters, numbers, spaces, commas, periods, apostrophes, hyphens, slashes, parentheses and # only",
    }),
  phoneNumber: Joi.string()
    .pattern(/^\+?[0-9]{7,15}$/)
    .optional()
    .allow("")
    .label("Phone number")
    .messages({
      "string.pattern.base":
        "Phone number must be 7-15 digits. Use only numbers 0-9, optionally starting with +",
    }),
  desiredRole: Joi.string()
    .valid("customer", "technician")
    .default("customer"),
  isVerified: Joi.boolean().optional(),
}).prefs({ errors: { wrap: { label: false } } });

// Helper function to prepare user response
function prepareUserResponse(user, isOwnProfile = false) {
  const response = { ...user };

  // Always mask phone and address for security
  response.phonenumber = maskPhoneNumber(user.phonenumber);
  response.address = maskAddress(user.address);

  // Only show actual data if user is viewing their own profile
  if (isOwnProfile) {
    const decryptedPhone = decryptText(user.phonenumber);
    const decryptedAddress = decryptText(user.address);
    if (decryptedPhone) response.phonenumber = decryptedPhone;
    if (decryptedAddress) response.address = decryptedAddress;
  }

  return response;
}

app.post("/api/users", verifyFirebaseToken, userLimiter, async (req, res) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ error: "No UID" });
  const { value, error } = createUserSchema.validate(req.body ?? {}, {
    stripUnknown: true,
  });
  if (error)
    return res
      .status(400)
      .json({
        error: "Invalid payload",
        details: error.details.map((d) => d.message),
      });

  const token = req.user;
  const email = token.email ?? null;
  const emailVerified = !!token.email_verified;
  const phoneNumber = value.phoneNumber || token.phone_number || null;
  const photoURL = token.picture ?? null;
  const providerID =
    value.providerID ?? token.firebase?.sign_in_provider ?? null;
  const displayName = value.displayName ?? token.name ?? null;
  const address = value.address ?? null;
  try {
    await ensureCustomerClaim(uid);
    // Encrypt phone and address before storing
    const encryptedPhone = phoneNumber ? encryptText(phoneNumber) : null;
    const encryptedAddress = address ? encryptText(address) : null;
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
      [
        uid,
        providerID,
        displayName,
        email,
        emailVerified,
        encryptedPhone,
        "customer",
        photoURL,
        encryptedAddress,
      ]
    );
    const user = result.rows[0];
    const response = { ...user };
    response.phonenumber = maskPhoneNumber(user.phonenumber);
    response.address = maskAddress(user.address);
    res.json({ user: response });
  } catch (err) {
    console.error("❌ /api/users error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

app.get(
  "/api/users/:uid",
  verifyFirebaseToken,
  requireSelf("uid"),
  authorizePermission("profile_self", "read"),
  async (req, res) => {
    const { uid } = req.params;
    try {
      const result = await pool.query('SELECT * FROM "User" WHERE uid = $1', [
        uid,
      ]);
      if (result.rows.length === 0)
        return res.status(404).json({ error: "User not found" });
      const user = result.rows[0];
      const response = { ...user };
      response.phonenumber = maskPhoneNumber(user.phonenumber);
      response.address = maskAddress(user.address);
      if (req.user?.uid === uid) {
        const decryptedPhone = decryptText(user.phonenumber);
        const decryptedAddress = decryptText(user.address);
        if (decryptedPhone) response.phonenumber = decryptedPhone;
        if (decryptedAddress) response.address = decryptedAddress;
      }

      logDataAccess("USER_PROFILE_READ", {
        actor: { uid: req.user.uid },
        resource_type: "USER_PROFILE",
        resource_id: uid,
        self_access: req.user?.uid === uid,
      });

      req.log.info(
        {
          type: "DATA_ACCESS",
          action: "READ",
          resource_type: "USER_PROFILE",
          resource_id: uid,
          self_access: req.user?.uid === uid,
        },
        "User profile read"
      );

      res.json({ user: response });
    } catch (err) {
      console.error("❌ /api/users/:uid error:", err);
      res.status(500).json({ error: "Database error" });
    }
  }
);

app.put(
  "/api/users/:uid",
  verifyFirebaseToken,
  requireSelf("uid"),
  authorizePermission("profile_self", "update"),
  async (req, res) => {
    const { value, error } = updateUserSchema.validate(req.body ?? {}, {
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        error: "Invalid payload",
        details: error.details.map((d) => d.message),
      });
    }

    const { uid } = req.params;
    const newDisplay = value.displayname ?? value.displayName ?? null;
    const address = value.address ?? null;
    const phoneNumber = value.phoneNumber ?? null;

    try {
      const encryptedPhone = phoneNumber ? encryptText(phoneNumber) : null;
      const encryptedAddress = address ? encryptText(address) : null;

      const result = await pool.query(
        `
        UPDATE "User"
        SET
          "displayname" = COALESCE($1, "displayname"),
          address        = COALESCE($2, address),
          "phonenumber"  = COALESCE($3, "phonenumber"),
          updated_at     = NOW()
        WHERE uid = $4
        RETURNING *;
        `,
        [newDisplay, encryptedAddress, encryptedPhone, uid]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const user = result.rows[0];
      const response = { ...user };

      // Mask by default
      response.phonenumber = maskPhoneNumber(user.phonenumber);
      response.address = maskAddress(user.address);

      // If user is updating their own profile, return decrypted values
      if (req.user?.uid === uid) {
        const decryptedPhone = decryptText(user.phonenumber);
        const decryptedAddress = decryptText(user.address);
        if (decryptedPhone) response.phonenumber = decryptedPhone;
        if (decryptedAddress) response.address = decryptedAddress;
      }

      logDataAccess("USER_PROFILE_UPDATE", {
        actor: { uid: req.user.uid },
        resource_type: "USER_PROFILE",
        resource_id: uid,
        self_access: req.user?.uid === uid,
      });

      req.log.info(
        {
          type: "DATA_ACCESS",
          action: "UPDATE",
          resource_type: "USER_PROFILE",
          resource_id: uid,
          self_access: req.user?.uid === uid,
        },
        "User profile updated"
      );

      return res.status(200).json({ user: response });
    } catch (err) {
      console.error("❌ PUT /api/users/:uid error:", err);
      return res.status(500).json({ error: "Database error" });
    }
  }
);


app.delete(
  "/api/users/:uid",
  verifyFirebaseToken,
  authorizePermission("user_management", "delete"),
  async (req, res) => {
    const { uid } = req.params;
    try {
      const result = await pool.query(
        'DELETE FROM "User" WHERE uid=$1 RETURNING *',
        [uid]
      );
      if (result.rows.length === 0)
        return res.status(404).json({ error: "User not found" });
      if (process.env.DELETE_FIREBASE_USER === "true") {
        try {
          await admin.auth().deleteUser(uid);
        } catch (e) {
          console.warn("⚠️ Firebase delete skipped:", e?.message || e);
        }
      }

      logDataAccess("USER_PROFILE_DELETE", {
        actor: { uid: req.user?.uid },
        resource_type: "USER_PROFILE",
        resource_id: uid,
      });

      res.json({ message: "User deleted", user: result.rows[0] });
    } catch (err) {
      console.error("❌ DELETE /api/users/:uid error:", err);
      res.status(500).json({ error: "Database error" });
    }
  }
);

app.post("/api/signup", verifyFirebaseToken, async (req, res) => {
  try {
    const { uid, email, email_verified, name: tokenName } = req.user || {};
    if (!uid || !email)
      return res.status(401).json({ error: "No uid/email on verified token" });
    const incoming = {
      ...req.body,
      name: (req.body?.name ?? tokenName ?? "").trim(),
      address: (req.body?.address ?? "").trim(),
      phoneNumber: (req.body?.phoneNumber ?? "").trim(),
    };
    const { error, value } = signupSchema.validate(incoming, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        details: error.details.map((d) => ({
          field: d.path[0],
          message: d.message,
        })),
      });
    }
    const { name, address, phoneNumber, desiredRole, isVerified } = value;
    const role = desiredRole === "technician" ? "technician" : "customer";

    const encryptedPhone = phoneNumber ? encryptText(phoneNumber) : null;
    const encryptedAddress = address ? encryptText(address) : null;

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
    const params = [
      uid,
      email,
      name,
      encryptedAddress,
      encryptedPhone,
      role,
      email_verified || !!isVerified,
    ];
    const { rows } = await pool.query(upsertSql, params);

    try {
      const u = await admin.auth().getUser(uid);
      const claims = u.customClaims || {};
      if (claims.role !== role)
        await admin.auth().setCustomUserClaims(uid, { ...claims, role });
    } catch (e) {
      console.warn("⚠️ setCustomUserClaims skipped:", e?.message || e);
    }

    const responseUser = prepareUserResponse(rows[0], true);

    logAuthn("SIGNUP_COMPLETE", {
      user: { uid, email },
      role,
    });

    res.json({ ok: true, user: responseUser });
  } catch (e) {
    console.error("[/api/signup] error:", e?.stack || e);
    res.status(500).json({ error: "SIGNUP_FAILED" });
  }
});

app.post(
  "/api/me/mfa/totp-enabled",
  verifyFirebaseToken,
  async (req, res) => {
    try {
      await pool.query(
        'UPDATE "User" SET totp_enabled = TRUE, updated_at = NOW() WHERE uid = $1',
        [req.user.uid]
      );

      logAuthn("MFA_TOTP_ENABLED", {
        user: { uid: req.user.uid, email: req.user.email },
      });

      res.json({ ok: true });
    } catch (e) {
      console.error("❌ /api/me/mfa/totp-enabled error:", e);
      res.status(500).json({ error: "db_update_failed" });
    }
  }
);

app.post(
  "/api/admin/users/:uid/role",
  authorizePermission("user_management", "update"),
  async (req, res, next) => {
    try {
      const { uid } = req.params;
      const { role } = req.body;
      const { rowCount } = await pool.query(
        `UPDATE "User" SET role = $2 WHERE uid = $1`,
        [uid, role]
      );
      if (rowCount === 0)
        return res.status(404).json({ error: "User not found" });

      logAdminAction("USER_ROLE_CHANGE", {
        actor: req.user
          ? { uid: req.user.uid, role: req.user.role }
          : undefined,
        target_uid: uid,
        new_role: role,
      });

      req.log.info(
        {
          type: "ADMIN_ACTION",
          action: "USER_ROLE_CHANGE",
          target_uid: uid,
          new_role: role,
        },
        "Admin changed user role"
      );

      if (req.session?.user?.id === uid) {
        req.session.user.role = role;
        return req.session.save((err) =>
          err ? next(err) : res.json({ ok: true })
        );
      }
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  }
);

app.get(
  "/api/admin/users",
  verifyFirebaseToken,
  authorizePermission("user_management", "read"),
  async (req, res) => {
    const result = await pool.query('SELECT * FROM "User"');
    const users = result.rows.map((user) =>
      prepareUserResponse(user, false)
    );

    logDataAccess("ADMIN_USERS_LIST_READ", {
      actor: { uid: req.user.uid, role: req.user.role },
      resource_type: "USER_LIST",
      result_count: result.rows.length,
    });

    res.json(users);
  }
);

// ======================= SERVICE CATALOG & REQUEST ROUTES =======================

// Joi schemas
const serviceCreateSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(80)
    .pattern(/^[A-Za-z0-9 \-_'&()]+$/)
    .required(),
  category: Joi.string()
    .valid("plumbing", "electrical", "hvac", "appliance", "general")
    .required(),
  description: Joi.string()
    .trim()
    .max(2000)
    .allow("", null)
    .custom((v, h) => {
      if (/[<>]/.test(v || "")) return h.error("any.invalid");
      return v;
    }, "no angle brackets")
    .messages({ "any.invalid": "Description must not contain angle brackets" }),
  base_price: Joi.number().min(0.01).max(100000).required(),
  estimated_time: Joi.number().integer().min(1).max(480).required(), // minutes
}).prefs({ stripUnknown: true });

const serviceUpdateSchema = serviceCreateSchema
  .fork(
    ["name", "category", "description", "base_price", "estimated_time"],
    (schema) => schema.optional()
  )
  .min(1);

const serviceRequestSchema = Joi.object({
  customer_uid: Joi.string().required(),
  service_name: Joi.string().trim().min(1).max(100).required(),
  service_category: Joi.string()
    .valid("plumbing", "electrical", "hvac", "appliance", "general")
    .required(),
  scheduled_date: Joi.date().iso().min("now").required(),
  total_price: Joi.number().precision(2).min(0.01).max(100000).required(),
  notes: Joi.string().trim().max(1000).allow("", null),
  technician_uid: Joi.string().optional().allow(null),
}).prefs({ stripUnknown: true });

// Rate limiters (services) with ABUSE logging
const serviceReadLimiterIP = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  message: {
    error: "Too many service list requests from this IP. Try again later.",
  },
  handler: (req, res, next, options) => {
    logAbuse("RATE_LIMIT_HIT", {
      route: req.originalUrl,
      method: req.method,
      key: ipKeyGenerator(req),
      scope: "services_read_ip",
    });
    res.status(options.statusCode || 429).json(options.message);
  },
});

const serviceReadLimiterUser = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: (req) => (req.user ? 100 : 0),
  skip: (req) => !req.user,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid,
  message: {
    error: "Too many service list requests for this account. Slow down.",
  },
  handler: (req, res, next, options) => {
    logAbuse("RATE_LIMIT_HIT", {
      route: req.originalUrl,
      method: req.method,
      key: req.user?.uid,
      scope: "services_read_user",
    });
    res.status(options.statusCode || 429).json(options.message);
  },
});

const serviceWriteLimiterIP = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  message: {
    error: "Too many service modifications from this IP. Try later.",
  },
  handler: (req, res, next, options) => {
    logAbuse("RATE_LIMIT_HIT", {
      route: req.originalUrl,
      method: req.method,
      key: ipKeyGenerator(req),
      scope: "services_write_ip",
    });
    res.status(options.statusCode || 429).json(options.message);
  },
});

const serviceWriteLimiterUser = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: (req) => (req.user ? 10 : 0),
  skip: (req) => !req.user,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid,
  message: {
    error: "Too many service modifications. Please slow down.",
  },
  handler: (req, res, next, options) => {
    logAbuse("RATE_LIMIT_HIT", {
      route: req.originalUrl,
      method: req.method,
      key: req.user?.uid,
      scope: "services_write_user",
    });
    res.status(options.statusCode || 429).json(options.message);
  },
});

const serviceQuerySchema = Joi.object({
  category: Joi.string().valid(
    "plumbing",
    "electrical",
    "hvac",
    "appliance",
    "general"
  ),
  search: Joi.string().trim().min(1).max(80),
  limit: Joi.number().integer().min(1).max(100).default(50),
  skip: Joi.number().integer().min(0).default(0),
}).prefs({ stripUnknown: true });

// GET /api/services (with filters/pagination)
app.get(
  "/api/services",
  serviceReadLimiterIP,
  serviceReadLimiterUser,
  async (req, res) => {
    const { value, error } = serviceQuerySchema.validate(req.query);
    if (error)
      return res
        .status(400)
        .json({
          error: "Invalid query",
          details: error.details.map((d) => d.message),
        });
    const { category, search, limit, skip } = value;
    const filter = {};
    if (category) filter.category = category;
    if (search) {
      filter.name = {
        $regex: search.replace(/[.*+?^${}()|[\]\\]/g, (r) => "\\" + r),
        $options: "i",
      };
    }
    try {
      const docs = await ServiceCatalog.find(filter)
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(docs);
    } catch (e) {
      console.error("❌ Error fetching services:", e);
      res.status(500).json({ error: "Failed to fetch services" });
    }
  }
);

// POST /api/services (admin only)
app.post(
  "/api/services",
  verifyFirebaseToken,
  serviceWriteLimiterIP,
  serviceWriteLimiterUser,
  async (req, res) => {
    if (req.user.role !== "admin") {
      logAuthz("DENY", {
        policy: "admin_only",
        resource: "service_catalog",
        reason: "NON_ADMIN_BLOCKED",
        actor: { uid: req.user.uid, role: req.user.role },
      });
      return res
        .status(403)
        .json({ error: "Admin access required to manage services" });
    }
    const { value, error } = serviceCreateSchema.validate(req.body);
    if (error)
      return res
        .status(400)
        .json({
          error: "Invalid service",
          details: error.details.map((d) => d.message),
        });
    try {
      const svc = new ServiceCatalog(value);
      const saved = await svc.save();

      logAdminAction("SERVICE_CREATED", {
        actor: { uid: req.user.uid, role: req.user.role },
        service_id: String(saved._id),
        category: saved.category,
      });

      return res.status(201).json(saved);
    } catch (e) {
      if (e.code === 11000)
        return res
          .status(409)
          .json({ error: "Service name/category already exists" });
      console.error("❌ Error adding service:", e);
      return res.status(400).json({ error: e.message });
    }
  }
);

// PUT /api/services/:id (admin only)
app.put(
  "/api/services/:id",
  verifyFirebaseToken,
  serviceWriteLimiterIP,
  serviceWriteLimiterUser,
  async (req, res) => {
    if (req.user.role !== "admin") {
      logAuthz("DENY", {
        policy: "admin_only",
        resource: "service_catalog",
        reason: "NON_ADMIN_BLOCKED",
        actor: { uid: req.user.uid, role: req.user.role },
      });
      return res
        .status(403)
        .json({ error: "Admin access required to manage services" });
    }
    const { value, error } = serviceUpdateSchema.validate(req.body);
    if (error)
      return res
        .status(400)
        .json({
          error: "Invalid update",
          details: error.details.map((d) => d.message),
        });
    try {
      const updated = await ServiceCatalog.findByIdAndUpdate(
        req.params.id,
        { $set: value },
        { new: true, runValidators: true }
      );
      if (!updated)
        return res.status(404).json({ error: "Service not found" });

      logAdminAction("SERVICE_UPDATED", {
        actor: { uid: req.user.uid, role: req.user.role },
        service_id: req.params.id,
        updated_fields: Object.keys(value || {}),
      });

      return res.json(updated);
    } catch (e) {
      if (e.code === 11000)
        return res.status(409).json({ error: "Duplicate name/category" });
      console.error("❌ Error updating service:", e);
      return res.status(400).json({ error: e.message });
    }
  }
);

// POST /api/requests (customer only)
app.post('/api/requests', verifyFirebaseToken, authorizePermission('service_requests', 'write'), async (req, res) => {
  const { value, error } = serviceRequestSchema.validate(req.body);
  if (error)
    return res
      .status(400)
      .json({
        error: "Invalid request",
        details: error.details.map((d) => d.message),
      });
  if (req.user.uid !== value.customer_uid) {
    logAuthz("DENY", {
      policy: "self_only_request",
      resource: "ServiceRequest",
      reason: "CUSTOMER_UID_MISMATCH",
      actor: { uid: req.user.uid },
    });
    return res
      .status(403)
      .json({ error: "Can only create service bookings for yourself" });
  }
  try {
    const svc = await ServiceCatalog.findOne({
      name: value.service_name,
      category: value.service_category,
    });
    if (!svc)
      return res
        .status(400)
        .json({ error: "Service name/category mismatch or not found" });

    const result = await pool.query(
      `INSERT INTO "ServiceRequest"(customer_uid, technician_uid, service_name, service_category, scheduled_date, total_price, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING *`,
      [
        value.customer_uid,
        null,
        value.service_name,
        value.service_category,
        value.scheduled_date,
        value.total_price,
        value.notes || null,
      ]
    );

    logDataAccess("SERVICE_REQUEST_CREATED", {
      actor: { uid: req.user.uid },
      resource_type: "SERVICE_REQUEST",
      resource_id: result.rows[0].id,
    });

    return res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error("❌ Error creating request:", e);
    return res.status(500).json({ error: "Failed to create service request" });
  }
});

// ======================= MFA & USER ENSURE =======================

// Ensure user exists (for MFA setup)
app.get("/api/users/:uid/ensure", verifyFirebaseToken, async (req, res) => {
  const { uid } = req.params;
  try {
    console.log(`[MFA ENSURE] Checking for user uid=${uid}`);
    const pgResult = await pool.query('SELECT * FROM "User" WHERE uid = $1', [
      uid,
    ]);
    // console.log(`[MFA ENSURE] Query result:`, pgResult.rows);
    if (pgResult.rows.length > 0) {
      return res.status(200).json({ exists: true });
    }
    return res.status(404).json({ exists: false, message: "User not found" });
  } catch (err) {
    console.error("[MFA ENSURE] Error checking user existence:", err);
    res
      .status(500)
      .json({ error: "Internal server error", details: err.message });
  }
});

app.use("/api/kyc", sumsubRoutes);
app.use("/api/admin", adminTechnicianRoutes);
app.use("/api", technicianRouter);
app.use("/api", specialityRouter);
app.use("/api/orders", orderRouter);

app.get("/health", (req, res) => {
  res.json({ ok: true });
});



// ======================= LOGGING TEST ROUTE =======================
app.get("/api/_log-test", (req, res) => {
  const fakeUser = {
    uid: "test-user-123",
    email: "someone@example.com",
  };

  req.log.info(
    {
      type: "AUTHN",
      action: "LOGIN_SUCCESS",
      user: fakeUser,
      note: "This is a test AUTHN log",
    },
    "Test login success"
  );

  logSecurityEvent("AUTHZ_DENY", {
    type: "AUTHZ",
    route: req.originalUrl,
    method: req.method,
    required_role: "admin",
    actor: fakeUser,
    reason: "TEST_ONLY",
  });

  res.json({ ok: true, message: "Logged test events" });
});

// =======================
// 🚀 Start Server
// =======================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`✅ Backend running at http://localhost:${PORT}`)
);
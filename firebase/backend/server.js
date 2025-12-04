// server.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import session from "express-session";
import { createClient } from "redis";
import { RedisStore } from "connect-redis";
import fs from "fs";
import bodyParser from "body-parser";
import pool from "./db.js";
import admin from "firebase-admin";
import rateLimit, { ipKeyGenerator } from "express-rate-limit"; //for db raaaaatee limitting
import Joi from "joi";  //for db input validation

dotenv.config();



// Initialize Firebase Admin
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

// Initialize Express
const app = express();
// === CORS setup (simple and robust) ===
const corsOptions = {
    origin: "http://localhost:5173",  // frontend URL
    credentials: true,                // allow cookies/session
    methods: ["GET","POST","PUT","DELETE","OPTIONS"],
    allowedHeaders: ["Content-Type","Authorization"],
  };
  
app.use(cors(corsOptions));

app.use(bodyParser.json());

// Initialize Redis client and store
const redisClient = createClient();
redisClient.connect().catch(console.error);

const redisStore = new RedisStore({ client: redisClient, prefix: "Instafix:" });

// Session middleware
app.use(session({
  store: redisStore,
  resave: false,
  saveUninitialized: false,
  secret: "keyboard cat", // replace with strong secret in production
  cookie: {
    secure: false,    // dev: false for HTTP
    httpOnly: true,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24, // 1 day
  },
}));

// In-memory services
const services = [
  { id: 1, name: "Plumbing", price: 50 },
  { id: 2, name: "Electrical", price: 70 },
  { id: 3, name: "AC Repair", price: 100 },
];

// === Initialize Firebase Admin ===
try {
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
  console.log("✅ Firebase Admin initialized successfully");
} catch (error) {
  console.error("❌ Firebase Admin initialization failed:", error);
  process.exit(1);
}

// === Middleware to verify Firebase ID Token ===
const verifyFirebaseToken = async (req, res, next) => {
  console.log("🔒 Verifying token for path:", req.path);
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: "No authorization header" });
  }

  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Invalid authorization format" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    console.log("✅ Token verified for user:", decodedToken.uid);
    req.user = { uid: decodedToken.uid };
    next();
  } catch (err) {
    console.error("❌ Firebase token verification failed:", err);
    res.status(401).json({ error: "Invalid token" });
  }
};

// === Rate Limiting (OWASP-aligned) ===
const apiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 200, // 200 requests per 10 minutes per IP
  message: { error: "Too many attempts, try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator, // recommended for IPv6 safety
});

// UID-based limiter for authenticated endpoints
const userLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: (req) => {
    // Sensitive endpoints: 5/10min, normal: 50/10min
    const sensitivePrefixes = [
      "/api/users",
      "/api/tasks",
      "/api/offers"
    ];
    const sensitiveMethods = ["POST", "PUT", "DELETE"];
    if (
      sensitiveMethods.includes(req.method) &&
      sensitivePrefixes.some(prefix => req.path.startsWith(prefix))
    ) {
      return 5;
    }
    return 50;
  },
  message: { error: "Too many attempts, try again later" },
  keyGenerator: (req) => req.user?.uid || ipKeyGenerator(req), // recommended for IPv6 safety
  skip: (req) => !req.user, // Only apply to authenticated requests
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply IP-based limiter to public endpoints
app.use("/api/products", apiLimiter);
app.post("/api/signup", apiLimiter, async (req, res) => { /* signup logic */ });
app.post("/api/login", apiLimiter, async (req, res) => { 
const { idToken } = req.body;

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.session.user = { uid: decodedToken.uid, email: decodedToken.email };
    res.json({ message: "Logged in successfully" });
  } catch (err) {
    console.error(err);
    res.status(401).json({ error: "Invalid token" });
  }

});
app.post("/api/password-reset", apiLimiter, async (req, res) => { /* reset logic */ });
// Logout route
app.post("/api/logout", (req, res) => {
  req.session.destroy();
  res.json({ message: "Logged out" });
});

// Protected services route
app.get("/api/services", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  res.json(services);
});

// === User input validation schemas ===
const userSchema = Joi.object({
  displayName: Joi.string().min(2).max(100).allow(null, "").optional(),
  email: Joi.string().email().allow(null, "").optional(),
  address: Joi.string().allow(null, "").optional(),
  role: Joi.string().valid("customer", "technician").empty(null).empty("").default("customer").optional(), // treat null/empty as missing, default to 'customer'
  providerID: Joi.string().allow(null, "").optional(),
  emailVerified: Joi.boolean().allow(null).optional(),
  phoneNumber: Joi.string().allow(null, "").optional(),
  photoURL: Joi.string().uri().allow(null, "").optional(),
});

const userUpdateSchema = Joi.object({
  displayName: Joi.string().min(2).max(100).optional(), // change me l8r (randa)
  email: Joi.string().email().optional(), // change me l8r (randa)
  address: Joi.string().allow(null, "").optional(), // change me l8r (randa)
  role: Joi.string().valid("customer", "technician").optional(), // changed from 'user' to 'customer'
  providerID: Joi.string().optional(), // change me l8r (randa)
  emailVerified: Joi.boolean().optional(), // change me l8r (randa)
  phoneNumber: Joi.string().allow(null, "").optional(), // change me l8r (randa)
  photoURL: Joi.string().uri().allow(null, "").optional(), // change me l8r (randa)
});

// === Users Routes ===

// Create or update user
app.post(
  "/api/users",
  verifyFirebaseToken,
  userLimiter,
  async (req, res) => {
    const uid = req.user?.uid;
    // Validate input
    const { error, value } = userSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    const {
      providerID,
      displayName,
      email,
      emailVerified,
      phoneNumber,
      role: incomingRole,
      photoURL,
      address,
    } = value;

    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    // Always default to 'customer' unless explicitly 'technician'
    let role = "customer";
    if (incomingRole === "technician") {
      role = "technician";
    }

    try {
      const result = await pool.query(
        `INSERT INTO "User" 
          (uid, providerID, displayName, email, emailVerified, phoneNumber, role, photoURL, address, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
         ON CONFLICT (uid) DO UPDATE SET
           providerID=EXCLUDED.providerID,
           displayName=EXCLUDED.displayName,
           email=EXCLUDED.email,
           emailVerified=EXCLUDED.emailVerified,
           phoneNumber=EXCLUDED.phoneNumber,
           photoURL=EXCLUDED.photoURL,
           address=EXCLUDED.address,
           updated_at=NOW()
         RETURNING *;`,
        [
          uid,
          providerID,
          displayName,
          email,
          emailVerified,
          phoneNumber,
          role,
          photoURL,
          address,
        ]
      );
      res.json({ user: result.rows[0] });
    } catch (err) {
      console.error("Database error:", err);
      res.status(500).json({ error: "An internal error occurred" });
    }
  }
);

// === Centralized IDOR protection for user routes ===
const userRouter = express.Router();
userRouter.use(verifyFirebaseToken, userLimiter, (req, res, next) => {
  if (req.user.uid !== req.params.uid) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
});

userRouter.get('/:uid', async (req, res) => {
  const { uid } = req.params;
  try {
    const result = await pool.query('SELECT * FROM "User" WHERE uid=$1', [uid]);
    if (result.rows.length === 0)
      return res.status(404).json({ error: "User not found" });
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

userRouter.put('/:uid', async (req, res) => {
  const { error, value } = userUpdateSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }
  const {
    providerID,
    displayName,
    email,
    emailVerified,
    phoneNumber,
    role,
    photoURL,
    address,
  } = value;

  try {
    const result = await pool.query(
      `UPDATE "User" SET
         providerID=$1,
         displayName=$2,
         email=$3,
         emailVerified=$4,
         phoneNumber=$5,
         role=$6,
         photoURL=$7,
         address=$8,
         updated_at=NOW()
       WHERE uid=$9
       RETURNING *;`,
      [
        providerID,
        displayName,
        email,
        emailVerified,
        phoneNumber,
        role,
        photoURL,
        address,
        req.params.uid,
      ]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "User not found" });
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

userRouter.delete('/:uid', async (req, res) => {
  const { uid } = req.params;
  try {
    const result = await pool.query(
      'DELETE FROM "User" WHERE uid=$1 RETURNING *',
      [uid]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "User not found" });
    res.json({ message: "User deleted", user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.use('/api/users', userRouter);

// === Start Server ===
const PORT = process.env.PORT || 5050;
app.listen(PORT, () =>
  console.log(`✅ Backend running at http://localhost:${PORT}`)
);

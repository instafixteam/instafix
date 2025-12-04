// middleware/auth.js (ESM)
import admin from "firebase-admin";
import { getApps } from "firebase-admin/app";

// Initialize Firebase Admin once
if (!getApps().length) {
  // If you load from serviceAccountKey.json elsewhere, you can remove this block.
  // Otherwise, initialize here from env (recommended for prod).
  const svcB64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!svcB64) {
    // Fallback: if server.js already did admin.initializeApp(), that's fine.
    // We just avoid double-init.
  } else {
    const creds = JSON.parse(Buffer.from(svcB64, "base64").toString("utf8"));
    admin.initializeApp({ credential: admin.credential.cert(creds) });
  }
}

/**
 * Verifies Firebase ID token in Authorization: Bearer <token>
 * Attaches { uid, email } to req.user
 */
export async function authMiddleware(req, res, next) {
  try {
    const hdr = req.headers.authorization || "";
    const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing Bearer token" });

    const decoded = await admin.auth().verifyIdToken(token, true);
    // Optional: validate iss/aud/exp/nbf here too if you want
    req.user = { uid: decoded.uid, email: decoded.email || null };
    return next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

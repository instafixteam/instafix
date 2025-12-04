/* ─────────────────────────────────────────────────────────────
   6) Auth middleware
   ───────────────────────────────────────────────────────────── */
// middleware/verifyFirebaseToken.js (or inline above your mounts)
import admin from "firebase-admin";

export const verifyFirebaseToken = async (req, res, next) => {
    try {
        // 1) Allow CORS preflight requests through
        if (req.method === "OPTIONS") return next();

        // 2) Try Bearer ID token
        const hdr = req.headers.authorization || "";
        const bearer = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;

        // 3) Or Firebase session cookie (__session)
        //    (only if you're setting it after login; requires cookie-parser)
        const sessionCookie = req.cookies?.__session || null;

        let decoded;

        if (bearer) {
            decoded = await admin.auth().verifyIdToken(bearer, true);
        } else if (sessionCookie) {
            decoded = await admin.auth().verifySessionCookie(sessionCookie, true);
        } else {
            return res.status(401).json({ error: "missing_token" });
        }

        // attach minimal user shape your routes expect
        req.user = {
            uid: decoded.uid,
            email: decoded.email ?? null,
            // custom claims if you use them:
            role: decoded.role ?? decoded.customClaims?.role ?? null,
        };

        return next();
    } catch (err) {
        // Common causes: expired token, clock skew, wrong project / key, malformed header
        console.error("Token verification failed:", err?.message || err);
        return res.status(401).json({ error: "invalid_token" });
    }
}
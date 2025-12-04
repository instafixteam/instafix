// src/pages/MFASetup.jsx
import { useEffect, useState } from "react";
import { auth } from "../firebase";
import { multiFactor, TotpMultiFactorGenerator } from "firebase/auth";
import QRCode from "qrcode"; // static default import (avoids Vite/CJS interop error)

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "http://localhost:5000";

// Build a standard otpauth URI from a base32 secret
function buildOtpAuthUri({ base32, account, issuer }) {
  if (!base32) return "";
  const encIssuer = encodeURIComponent(issuer || "InstaFix");
  const encAccount = encodeURIComponent(account || "user@instafix");
  const encSecret = encodeURIComponent(String(base32).replace(/\s+/g, ""));
  return `otpauth://totp/${encIssuer}:${encAccount}?secret=${encSecret}&issuer=${encIssuer}&algorithm=SHA1&digits=6&period=30`;
}

// Try all plausible field names that different SDK builds may use
function extractBase32Secret(secret) {
  if (!secret) return "";
  const s =
    secret.secretKey ||
    secret.sharedSecretKey ||
    secret.secret ||
    secret.key ||
    secret.base32 ||
    secret.totpSecret ||
    (secret.challenge &&
      (secret.challenge.secretKey ||
       secret.challenge.sharedSecretKey ||
       secret.challenge.base32)) ||
    "";
  return typeof s === "string" ? s.trim() : "";
}

export default function MFASetup() {
  const [qrPng, setQrPng] = useState("");
  const [otpauth, setOtpauth] = useState("");
  const [secretObj, setSecretObj] = useState(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [diag, setDiag] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setError("");

        // Diagnostics
        try {
          const appMod = await import("firebase/app");
          const app = appMod.getApp();
          const sdk = appMod.SDK_VERSION || "unknown";
          const projectId = app?.options?.projectId || "n/a";
          const emulator = !!auth?.config?.emulator;
          /*setDiag(
            `SDK ${sdk} | user=${!!auth.currentUser} | emailVerified=${!!auth.currentUser?.emailVerified} | projectId=${projectId} | emulator=${emulator}`
          ); */
        } catch {}

        const user = auth.currentUser;
        if (!user) return setError("You're signed out. Please sign in again.");
        
        // Ensure user exists in Neon database before proceeding with MFA
        console.log("🔍 Ensuring user exists in database before MFA setup...");
        const idToken = await user.getIdToken();
        const ensureResponse = await fetch(`${API_BASE}/api/users/${user.uid}/ensure`, {
          headers: { Authorization: `Bearer ${idToken}` },
          credentials: "include",
        });
        
        if (!ensureResponse.ok) {
          throw new Error("Failed to ensure user exists in database");
        }
        
        const ensureData = await ensureResponse.json();
        console.log("✅ User ensured in database:", ensureData.created ? "created" : "already exists");

        if (!user.emailVerified) return setError("Verify your email first, then reload this page.");

        // May throw auth/requires-recent-login → caught below
        const session = await multiFactor(user).getSession();

        // Ask Web SDK for the TOTP secret
        const secret = await TotpMultiFactorGenerator.generateSecret(session);
        setSecretObj(secret);

        const account = user.email || "user@instafix";
        const issuer = "InstaFix";

        // 1) Prefer official helpers
        let uri = "";
        try {
          if (typeof secret?.generateSecretKeyUri === "function") {
            uri = await secret.generateSecretKeyUri(account, issuer);
          }
        } catch (e) {
          console.warn("generateSecretKeyUri failed:", e);
        }
        if (!uri) {
          uri =
            secret?.otpauthUrl ||
            secret?.otpAuthUrl ||
            secret?.uri ||
            secret?.totpUri ||
            "";
        }

        // 2) If still no URI, synthesize from a raw base32 key
        if (!uri) {
          const base32 = extractBase32Secret(secret);
          if (base32) uri = buildOtpAuthUri({ base32, account, issuer });
        }

        setOtpauth(uri);

        // 3) PNG: helper if present, else local render from the URI
        let png = "";
        try {
          if (typeof secret?.generateQrCodeUrl === "function") {
            const maybe = await secret.generateQrCodeUrl(account, issuer);
            if (maybe?.startsWith("data:image/png")) png = maybe;
          }
        } catch (e) {
          console.warn("generateQrCodeUrl failed:", e);
        }
        if (!png && uri) {
          png = await QRCode.toDataURL(uri, { margin: 1, errorCorrectionLevel: "M" });
        }

        if (!png && !uri) {
          // Log shape for debugging if absolutely nothing was provided
          try {
            console.log("[TotpSecret keys]", Object.keys(secret || {}));
            const safe = JSON.parse(JSON.stringify(secret, (_k, v) => (typeof v === "function" ? undefined : v)));
            console.log("[TotpSecret raw]", safe);
          } catch {}
          throw new Error(
            "TOTP secret returned without URI or secret key. Ensure you're not using the Auth Emulator and there are no firebase/compat imports."
          );
        }

        setQrPng(png);
      } catch (e) {
        console.error("TOTP init failed:", e);
        if (e?.code === "auth/requires-recent-login") {
          setError("For security, please sign in again, then return to enroll the authenticator.");
        } else {
          setError(e?.message || "Could not start TOTP enrollment.");
        }
      }
    })();
  }, []);

  const enroll = async (e) => {
    e?.preventDefault?.();
    setBusy(true);
    setError("");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("You're signed out. Please sign in again.");
      if (!secretObj) throw new Error("TOTP secret unavailable. Reload this page.");

      // Validate 6–8 digits (some apps show 6; be tolerant)
      const raw = code.trim();
      if (!/^\d{6,8}$/.test(raw)) {
        throw new Error("Enter the 6-digit code from your app.");
      }

      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secretObj, raw);
      await multiFactor(user).enroll(assertion, "Authenticator");
      await user.reload(); // make the new factor visible immediately

      // Optional: record server-side
      try {
        const idToken = await user.getIdToken();
        await fetch(`${API_BASE}/api/me/mfa/totp-enabled`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          credentials: "include",
        });
      } catch {}

      setDone(true);
      setTimeout(() => (window.location.href = "/services"), 800);
    } catch (e) {
      console.error("Enroll failed:", e);
      if (e?.code === "auth/invalid-verification-code") {
        setError("Invalid code. Check the app's code and your device time.");
      } else if (e?.code === "auth/requires-recent-login") {
        setError("Please sign in again, then return to enroll the authenticator.");
      } else {
        setError(e?.message || "Could not enroll TOTP.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md p-6 pt-30">
      <h1 className="text-2xl font-semibold mb-2 text-center">Set up your authenticator</h1>
      <p className="text-sm text-gray-600 mb-4 text-center">
        Scan the QR with Google Authenticator, 1Password, or any TOTP app. Then enter the 6-digit code.
      </p>

      {diag && <p className="text-xs text-gray-400 text-center mb-2">{diag}</p>}
      {error && <div className="mb-3 text-sm text-red-600 text-center">{error}</div>}
      {done && <div className="mb-3 text-sm text-green-700 text-center">Authenticator added!</div>}

      <div className="flex justify-center mb-4 min-h-[164px] items-center">
        {qrPng ? <img src={qrPng} alt="TOTP QR" className="border rounded" /> : <p className="text-sm text-gray-500">Generating QR…</p>}
      </div>

      {otpauth && (
        <details className="mb-4">
          <summary className="cursor-pointer text-sm text-blue-700">Can't scan? Show otpauth URI</summary>
          <code className="text-xs break-all">{otpauth}</code>
        </details>
      )}

      <form onSubmit={enroll} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-center">Code from app</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={8}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mt-1 block w-full rounded-lg h-10 border border-gray-300 px-3 text-center"
            required
          />
        </div>
        <button disabled={busy || !secretObj} className="w-full h-10 rounded-lg signUpButton text-white disabled:opacity-60">
          {busy ? "Adding…" : "Add authenticator"}
        </button>
      </form>
    </div>
  );
}
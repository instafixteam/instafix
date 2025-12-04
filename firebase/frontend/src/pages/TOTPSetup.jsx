// src/pages/TOTPSetup.jsx
import { useEffect, useState } from "react";
import { auth } from "../firebase";
import {
  getMultiFactor,
  TotpMultiFactorGenerator
} from "firebase/auth";

export default function TOTPSetup() {
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [verificationId, setVerificationId] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          setStatus("You’re signed out. Please log in again.");
          return;
        }
        const mfaUser = getMultiFactor(user);
        // 1) Generate a secret for this user
        const { otpauthUrl, verificationId } =
          await TotpMultiFactorGenerator.generateSecret(mfaUser);

        setOtpauthUrl(otpauthUrl);
        setVerificationId(verificationId);
        setStatus("Scan the QR with your authenticator, then enter the 6-digit code.");
      } catch (e) {
        console.error(e);
        setStatus(e?.message || "Could not start TOTP setup.");
      }
    })();
  }, []);

  async function handleEnroll(e) {
    e.preventDefault();
    try {
      if (!verificationId || !code) return;

      // 2) Build an assertion with the OTP code from the authenticator app
      const assertion =
        TotpMultiFactorGenerator.assertionForEnrollment(verificationId, code.trim());

      // 3) Enroll the TOTP factor
      const mfaUser = getMultiFactor(auth.currentUser);
      await mfaUser.enroll(assertion, "Authenticator");

      // 4) Tell backend “totp_enabled = true” (optional but nice to have)
      fetch("/api/me/mfa/totp-enabled", {
        method: "POST",
        headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken(true)}` }
      }).catch(() => { });

      setStatus("✅ TOTP enabled. You can sign out and sign back in to test.");
    } catch (e) {
      console.error(e);
      setStatus(e?.message || "Enrollment failed. Check the code and try again.");
    }
  }

  return (
    <div className="max-w-md mx-auto p-6 mt-20">
      <h1 className="text-xl font-semibold mb-3">Set up Authenticator (TOTP)</h1>
      <p className="text-sm text-gray-700 mb-4">{status}</p>

      {otpauthUrl && (
        <>
          {/* Simple QR without extra deps — use the otpauth URL in an <img> via Google Charts */}
          <img
            className="border rounded mb-4"
            alt="Scan this QR with your authenticator app"
            src={`https://chart.googleapis.com/chart?cht=qr&chs=240x240&chl=${encodeURIComponent(otpauthUrl)}`}
          />
          <div className="text-xs text-gray-500 break-all mb-3">
            If you can’t scan, add account manually using: <br />
            <code>{otpauthUrl}</code>
          </div>

          <form onSubmit={handleEnroll} className="space-y-3">
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-300 px-3"
              required
            />
            <button className="w-full h-10 rounded-lg bg-bluebrand text-white font-semibold">
              Enable TOTP
            </button>
          </form>
        </>
      )}
    </div>
  );
}

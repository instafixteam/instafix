// src/pages/MfaSettings.jsx
import { useEffect, useState } from "react";
import {
    EmailAuthProvider,
    reauthenticateWithCredential,
    multiFactor,
    PhoneMultiFactorGenerator,
    sendEmailVerification,
} from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import useAuthState from "../hooks/useAuthState";
import {
    startPhoneMfaEnrollment,
    finishPhoneMfaEnrollment,
    resetRecaptcha,
} from "../../firebase-mfa";

import { useAuthContext } from "../Context/AuthContext";

const API_BASE =
    (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
    "http://localhost:5000";

export default function MfaSettings() {
    const navigate = useNavigate();
    const user = useAuthState(); // your hook that mirrors auth.currentUser

    const { setUserRole } = useAuthContext();

    // ---- All hooks declared unconditionally (always in the same order) ----
    const [phone, setPhone] = useState("");
    const [verificationId, setVerificationId] = useState("");
    const [smsCode, setSmsCode] = useState("");
    const [needsEmailVerify, setNeedsEmailVerify] = useState(false);
    const [info, setInfo] = useState("");

    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    const [step, setStep] = useState("idle"); // idle → codeSent → enrolled

    const [needReauth, setNeedReauth] = useState(false);
    const [reauthPw, setReauthPw] = useState("");

    const [factors, setFactors] = useState([]);

    const isSignedIn = !!user;
    const isVerified = !!user?.emailVerified;

    useEffect(() => {
        let stop = false;

        async function tick() {
            if (!auth.currentUser) return;
            try {
                await auth.currentUser.reload();
                await auth.currentUser.getIdToken(true);
            } catch { }

            if (stop) return;

            setFactors(multiFactor(auth.currentUser).enrolledFactors || []);
            setStatus(auth.currentUser.emailVerified ? "" : "Please verify your email before enabling MFA.");
        }

        // initial + short polling until verified is observed
        tick();
        const id = setInterval(() => {
            if (!stop && !auth.currentUser?.emailVerified) tick();
        }, 2000);

        return () => {
            stop = true;
            clearInterval(id);
        };
    }, [step]);

    async function handleSend(e) {
        e.preventDefault();
        setError("");
        setStatus("");

        if (!auth.currentUser) { setError("You must be signed in."); return; }
        if (!auth.currentUser.emailVerified) { setError("Verify your email first."); return; }

        try {
            const verId = await startPhoneMfaEnrollment(auth.currentUser, phone);
            setVerificationId(verId);
            setStep("codeSent");
            setStatus("Code sent. Check your phone and enter it below.");
        } catch (err) {
            console.error("[MFA sendCode]", err?.code, err?.message, err);
            if (err?.code === "auth/requires-recent-login") {
                setNeedReauth(true);
                setStatus("For security, please re-enter your password.");
                return;
            }
            setError(`(${err?.code || "unknown"}) ${err?.message || "no message"}`);
            try { resetRecaptcha?.(); } catch { }
        }
    }

    async function handleVerify(e) {
        e.preventDefault();
        setError("");
        setStatus("Verifying…");

        if (!auth.currentUser) { setError("You must be signed in."); return; }
        if (!verificationId) { setError("Please send the code first."); return; }

        try {
            await finishPhoneMfaEnrollment(auth.currentUser, verificationId, smsCode, "Personal phone");
            await auth.currentUser.reload();

            setStep("enrolled");
            setStatus("✅ Phone enrolled as a second factor.");
            setSmsCode("");
            setVerificationId("");

            // Issue server session and route by role
            await serverLoginAndRoute(auth.currentUser);
        } catch (err) {
            console.error(err);
            if (err?.code === "auth/requires-recent-login") {
                setNeedReauth(true);
                setStatus("For security, please re-enter your password.");
            } else if (err?.code === "auth/invalid-verification-code") {
                setError("Invalid code. Try again.");
            } else if (err?.code === "auth/code-expired") {
                setError("Code expired. Send a new code.");
                setStep("idle");
            } else {
                setError("Enrollment failed. Try again.");
            }
            try { resetRecaptcha?.(); } catch { }
        }
    }

    async function serverLoginAndRoute(firebaseUser) {
        await firebaseUser.reload();
        if (!firebaseUser.emailVerified) {
            navigate("/login?verifyEmail=1", { replace: true });
            return;
        }

        const idToken = await firebaseUser.getIdToken(true);
        const res = await fetch(`${API_BASE}/api/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ idToken }),
        });

        const text = await res.text();
        let payload = null; try { payload = JSON.parse(text); } catch { }

        if (!res.ok) {
            navigate("/login?session=failed", { replace: true });
            return;
        }

        const sessionUser = payload?.user || {};
        const role = (sessionUser.role || "customer").toLowerCase();
        const uid = sessionUser.id || firebaseUser.uid;

        // 🔑 make guards happy immediately
        try { setUserRole?.(role); } catch { }

        if (role === "technician") {
            navigate(`/technician-dashboard/${uid}`, { replace: true });
        } else if (role === "admin") {
            navigate(`/admin-dashboard/${uid}`, { replace: true });

        } else if (role === "pending_technician") {
            navigate(`/technician-onboarding/${uid}`, { replace: true });
        }
        else {
            navigate("/services", { replace: true });
        }
    }

    async function handleReauth(e) {
        e.preventDefault();
        try {
            const cred = EmailAuthProvider.credential(auth.currentUser.email, reauthPw);
            await reauthenticateWithCredential(auth.currentUser, cred);
            setNeedReauth(false);
            setReauthPw("");
            setStatus("Reauthenticated. Now send the code.");
        } catch {
            setError("Reauthentication failed. Check your password.");
        }
    }

    async function handleUnenroll(uid) {
        try {
            await multiFactor(auth.currentUser).unenroll(uid);
            setFactors(multiFactor(auth.currentUser).enrolledFactors || []);
            setStatus("Removed factor.");
        } catch (e) {
            console.error(e);
            setError("Could not remove factor. You may need to reauthenticate.");
        }
    }

    async function resendVerification() {
        setError("");
        try {
            await sendEmailVerification(auth.currentUser);
            setStatus("Verification email resent. Check your inbox.");
        } catch {
            setError("Could not resend verification email.");
        }
    }

    async function manualRefresh() {
        setError("");
        try {
            await auth.currentUser.reload();
            await auth.currentUser.getIdToken(true);
            setFactors(multiFactor(auth.currentUser).enrolledFactors || []);
            setStatus(auth.currentUser.emailVerified ? "" : "Please verify your email before enabling MFA.");
        } catch { }
    }

    // ---- Render (safe to conditionally return AFTER all hooks) ----
    if (!isSignedIn) {
        return (
            <div className="max-w-xl mx-auto p-6">
                <h1 className="text-xl font-semibold mb-2">SMS MFA</h1>
                <p className="text-sm text-gray-700">
                    Please sign in to enroll MFA.{" "}
                    <a className="text-blue-600 underline" href="/login">Go to login</a>
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <div className="w-full max-w-md bg-white rounded-xl shadow p-6">
                <h1 className="text-2xl font-semibold mb-2">SMS MFA</h1>
                <p className="text-sm text-gray-600 mb-4">Add a phone number as a second factor.</p>

                {status && <p className="text-sm mb-2">{status}</p>}
                {error && <p className="text-sm text-red-500 mb-2">{error}</p>}

                {!isVerified && (
                    <div className="mb-5 space-y-2">
                        <button onClick={resendVerification} className="h-10 px-3 rounded-lg border">Resend verification email</button>
                        <button onClick={manualRefresh} className="h-10 px-3 rounded-lg border">I’ve verified — refresh</button>
                    </div>
                )}

                {needReauth && (
                    <form onSubmit={handleReauth} className="space-y-3 mb-4">
                        <p className="text-sm">For security, please re-enter your password.</p>
                        <input
                            type="password"
                            placeholder="Password"
                            value={reauthPw}
                            onChange={(e) => setReauthPw(e.target.value)}
                            className="block w-full rounded-lg h-10 border border-gray-300 px-3"
                            required
                        />
                        <button className="w-full h-10 rounded-lg bg-bluebrand text-white">Reauthenticate</button>
                    </form>
                )}

                {step === "idle" && (
                    <form onSubmit={handleSend} className="space-y-3">
                        <input
                            type="tel"
                            placeholder="+15555550100"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="block w-full rounded-lg h-10 border border-gray-300 px-3"
                            required
                            disabled={!isVerified}
                        />
                        <button disabled={!isVerified} className="w-full h-10 rounded-lg signUpButton disabled:opacity-50">
                            Send code
                        </button>
                    </form>
                )}

                {step === "codeSent" && (
                    <form onSubmit={handleVerify} className="space-y-3">
                        <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="SMS code"
                            value={smsCode}
                            onChange={(e) => setSmsCode(e.target.value)}
                            className="block w-full rounded-lg h-10 border border-gray-300 px-3"
                            required
                        />
                        <div className="flex gap-2">
                            <button className="flex-1 h-10 rounded-lg signUpButton text-white">Verify & Enroll</button>
                            <button
                                type="button"
                                onClick={() => { setStep("idle"); setSmsCode(""); setVerificationId(""); setStatus("You can resend a new code."); }}
                                className="flex-1 h-10 rounded-lg border border-gray-300"
                            >
                                Resend
                            </button>
                        </div>
                    </form>
                )}

                {step === "enrolled" && (
                    <p className="mt-3 text-sm">MFA is active. Next sign-in will require an SMS code.</p>
                )}

                <div id="recaptcha-container" style={{ display: "none" }} />
                <div className="mt-6">
                    <h2 className="text-sm font-semibold mb-2">Enrolled factors</h2>
                    {(!factors || factors.length === 0) ? (
                        <p className="text-sm text-gray-600">No factors enrolled yet.</p>
                    ) : (
                        <ul className="space-y-2">
                            {factors.map(f => (
                                <li key={f.uid} className="flex items-center justify-between border rounded-lg px-3 py-2">
                                    <div className="text-sm">
                                        <div className="font-medium">{f.displayName || "Phone"}</div>
                                        <div className="text-gray-600">
                                            {f.factorId === PhoneMultiFactorGenerator.FACTOR_ID ? f.phoneNumber : f.factorId}
                                        </div>
                                    </div>
                                    <button onClick={() => handleUnenroll(f.uid)} className="text-sm border rounded px-3 py-1">
                                        Unenroll
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}

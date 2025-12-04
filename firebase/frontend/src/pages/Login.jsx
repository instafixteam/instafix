import { useState, useEffect, useRef } from "react";
import {
  signInWithEmailAndPassword,
  multiFactor,
  getMultiFactorResolver,
  TotpMultiFactorGenerator,
} from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import GoogleButton from "../components/GoogleButton";
import logo from "../assets/InstaFixLogo.png";
import { useAuthContext } from "../Context/AuthContext";
import { signOut } from "firebase/auth";
import { resolveMfaSignInFromError } from "../../firebase-mfa";

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "http://localhost:5000";

const RECAPTCHA_SITE_KEY = import.meta?.env?.RECAPTCHA_SITE_KEY

// ▸ Policy toggle: make customers TOTP-only (true) or allow SMS (false)
const TOTP_ONLY_FOR_CUSTOMERS = true;

const normalizeRole = (r) => (r || "customer").toString().trim().toLowerCase();

export default function Login() {
  const navigate = useNavigate();
  const { setUserRole } = useAuthContext?.() || { setUserRole: () => { } };

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // MFA state
  const [needMfa, setNeedMfa] = useState(false);
  const [pendingMfaError, setPendingMfaError] = useState(null);
  const [mfaRoleHint, setMfaRoleHint] = useState(null);
  const [mfaMode, setMfaMode] = useState(null); // 'totp' | 'sms'
  const [totpCode, setTotpCode] = useState("");
  const [smsCode, setSmsCode] = useState("");

  // brute-force limiter
  const [failedCount, setFailedCount] = useState(0);
  const captchaRequired = failedCount >= 3;

  // reCAPTCHA (v2)
  const [captchaReady, setCaptchaReady] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const captchaWidgetIdRef = useRef(null);
  const scriptLoadedRef = useRef(false);

  useEffect(() => {
    if (!captchaRequired || scriptLoadedRef.current) return;
    const script = document.createElement("script");
    script.src = "https://www.google.com/recaptcha/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      scriptLoadedRef.current = true;
      if (window.grecaptcha) {
        window.grecaptcha.ready(() => {
          const id = window.grecaptcha.render("login-recaptcha-container", {
            sitekey: RECAPTCHA_SITE_KEY,
            size: "normal",
            callback: (token) => setCaptchaToken(token),
            "expired-callback": () => setCaptchaToken(""),
            "error-callback": () => {
              setCaptchaToken("");
              setError("reCAPTCHA error, please try again.");
            },
          });
          captchaWidgetIdRef.current = id;
          setCaptchaReady(true);
        });
      }
    };
    document.body.appendChild(script);
  }, [captchaRequired]);

  // Helpers
  const fetchRoleByUid = async (uid) => {
    const token = await auth.currentUser.getIdToken();
    const res = await fetch(`${API_BASE}/api/users/${uid}`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return normalizeRole(data?.user?.role);
  };

  const fetchRoleByEmail = async (emailAddr) => {
    try {
      const res = await fetch(
        `${API_BASE}/api/public/user-role?email=${encodeURIComponent(emailAddr)}`
      );
      if (!res.ok) return null;
      const data = await res.json();
      return normalizeRole(data?.role);
    } catch {
      return null;
    }
  };

  const serverLoginAndRoute = async (user) => {
    await user.reload();
    if (!user.emailVerified) {
      setError("Please verify your email before signing in.");
      await signOut(auth).catch(() => { });
      return;
    }
    const idToken = await user.getIdToken(true);
    const res = await fetch(`${API_BASE}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ idToken }),
    });
    const payloadText = await res.text();
    let payload = null;
    try { payload = JSON.parse(payloadText); } catch { }
    if (!res.ok) {
      setError(payload?.error || payload?.message || `Login failed (${res.status})`);
      return;
    }
    const serverUser = payload?.user || {};
    const sessionRole = normalizeRole(serverUser.role);
    const sessionUid = serverUser.id || user.uid;
    try { setUserRole?.(sessionRole); } catch { }


    if (sessionRole === "technician") {

      navigate(`/technician-dashboard/${sessionUid}`, { replace: true });
      return;
    }

    if (sessionRole === "pending_technician") {
      navigate(`/technician-onboarding`, { replace: true })
      return;
    }

    if (sessionRole === "admin") {
      navigate(`/admin-dashboard/${sessionUid}`, { replace: true });
      return;
    }

    navigate("/services", { replace: true });
    return;

  };

  // MFA submits
  const handleTotpSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!pendingMfaError) {
      setError("MFA session not found. Please try signing in again.");
      setNeedMfa(false);
      return;
    }
    try {
      const resolver = getMultiFactorResolver(auth, pendingMfaError);
      const totpHint = resolver.hints.find(
        (h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID
      );
      if (!totpHint) {
        setError("No TOTP factor on this account. Use SMS or enroll TOTP.");
        return;
      }
      // ▸ Correct signature: enrollmentId + 6-digit code
      const assertion = TotpMultiFactorGenerator.assertionForSignIn(
        totpHint.uid,
        totpCode.trim()
      );
      await resolver.resolveSignIn(assertion);

      const user = auth.currentUser;
      if (!user) return setError("Sign-in failed. Please try again.");
      await serverLoginAndRoute(user);
    } catch (err) {
      console.error("[TOTP submit]", err?.code, err?.message);
      if (err?.code === "auth/invalid-verification-code") {
        setError("Invalid authenticator code. Try again.");
      } else if (err?.code === "auth/code-expired") {
        setError("Code expired. Start over.");
        setNeedMfa(false);
        setPendingMfaError(null);
        setTotpCode("");
      } else {
        setError("Could not complete verification. Please try again.");
      }
    }
  };

  const handleSmsSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!pendingMfaError) {
      setError("MFA session not found. Please try signing in again.");
      setNeedMfa(false);
      return;
    }
    try {
      await resolveMfaSignInFromError(pendingMfaError, smsCode);
      const user = auth.currentUser;
      if (!user) return setError("Sign-in failed. Please try again.");
      await serverLoginAndRoute(user);
    } catch (err) {
      console.error("[SMS submit]", err?.code, err?.message);
      if (err?.code === "auth/invalid-verification-code") {
        setError("Invalid SMS code. Try again.");
      } else if (err?.code === "auth/code-expired") {
        setError("Code expired. Start over.");
        setNeedMfa(false);
        setPendingMfaError(null);
        setSmsCode("");
      } else {
        setError("Could not complete verification. Please try again.");
      }
    }
  };

  // Main sign-in
  const submitSignIn = async () => {
    setError("");
    setNeedMfa(false);
    setPendingMfaError(null);
    setMfaMode(null);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Decide MFA policy from DB role
      let role = await fetchRoleByUid(user.uid);
      if (!role) role = await fetchRoleByEmail(user.email);
      role = normalizeRole(role) || "customer";

      // Enforce TOTP for customers if configured
      if (role === "customer" && TOTP_ONLY_FOR_CUSTOMERS) {
        await user.reload();
        const hasTotp = (multiFactor(user)?.enrolledFactors || [])
          .some(f => f.factorId === TotpMultiFactorGenerator.FACTOR_ID || f.factorId === "totp");
        if (!hasTotp) {
          navigate("/mfa-setup", { replace: true });
          return;
        }
      }

      // For admin/technician: require *some* MFA enrolled
      if (role === "technician" || role === "admin") {
        await user.reload();
        const enrolled = (multiFactor(user)?.enrolledFactors?.length || 0) > 0;
        if (!enrolled) {
          navigate("/settings/mfa", { replace: true });
          return;
        }
      }

      await serverLoginAndRoute(user);
      return;
    } catch (err) {
      if (err?.code === "auth/multi-factor-auth-required") {
        let role = await fetchRoleByEmail(email);
        role = normalizeRole(role) || "customer";
        setMfaRoleHint(role);

        const resolver = getMultiFactorResolver(auth, err);
        const hints = resolver?.hints || [];
        const hasTotp = hints.some((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
        const hasSms = hints.some((h) => h.factorId === "phone");

        if (role === "customer" && TOTP_ONLY_FOR_CUSTOMERS) {
          if (hasTotp) {
            setNeedMfa(true);
            setPendingMfaError(err);
            setMfaMode("totp");
            return;
          }
          setError("Authenticator app is required. Please enroll TOTP to continue.");
          setNeedMfa(false);
          navigate("/mfa-setup", { replace: true });
          return;
        }

        if (hasTotp) {
          setNeedMfa(true); setPendingMfaError(err); setMfaMode("totp"); return;
        }
        if (hasSms) {
          setNeedMfa(true); setPendingMfaError(err); setMfaMode("sms"); return;
        }

        setNeedMfa(false);
        navigate("/mfa-setup", { replace: true });
        return;
      }

      if (err?.code === "auth/too-many-requests") {
        setError("Too many attempts. Try again later.");
      } else {
        setFailedCount((c) => c + 1);
        setError("Invalid credentials. Please try again.");
        if (captchaWidgetIdRef.current != null) {
          try { window.grecaptcha.reset(captchaWidgetIdRef.current); } catch { }
          setCaptchaToken("");
        }
      }
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    if (captchaRequired) {
      if (!captchaReady) { setError("reCAPTCHA is loading… please try again."); return; }
      if (!captchaToken) { setError("Please complete the reCAPTCHA."); return; }
      await submitSignIn(); return;
    }
    await submitSignIn();
  };

  return (
    <div className="flex min-h-full flex-col justify-center pt-30 px-6 py-12 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm">
        <img src={logo} alt="InstaFix" className="mx-auto h-20 w-auto" />
        <h2 className="mt-10 text-center text-2xl font-bold tracking-tight text-gray-900">
          Sign in to your account
        </h2>
        {!needMfa && failedCount > 0 && (
          <p className="mt-2 text-center text-sm text-gray-600">
            Failed attempts: {failedCount}{captchaRequired && " — reCAPTCHA required"}
          </p>
        )}
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
        {!needMfa ? (
          <form onSubmit={handleLogin} className="space-y-6">
            {error && <p className="text-red-500 text-sm">{error}</p>}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-900">Email address</label>
              <div className="mt-2">
                <input id="email" type="email" name="email" required autoComplete="email"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-lg h-10 border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-indigo-600 focus:ring-0 sm:text-sm" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-medium text-gray-900">Password</label>
                <div className="text-sm">
                  <a href="/reset-password" className="font-semibold text-bluebrand hover:text-blue-500">Forgot password?</a>
                </div>
              </div>
              <div className="mt-2">
                <input id="password" type="password" name="password" required autoComplete="current-password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 h-10 placeholder:text-gray-400 focus:border-indigo-600 focus:ring-0 sm:text-sm" />
              </div>
            </div>

            {captchaRequired && (
              <div className="pt-1">
                <div id="login-recaptcha-container" />
                {!captchaReady && <p className="text-xs text-gray-500 mt-2">Loading reCAPTCHA…</p>}
              </div>
            )}

            <button type="submit"
              className="flex h-10 w-full signUpButton items-center justify-center rounded-lg bg-bluebrand px-3 text-medium text-white focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 transition border">
              Sign in
            </button>
          </form>
        ) : mfaMode === "totp" ? (
          <form onSubmit={handleTotpSubmit} className="space-y-6">
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <p className="text-sm text-gray-700 text-center">Enter the 6-digit code from your authenticator app.</p>
            <div>
              <label htmlFor="totpCode" className="block text-sm font-medium text-gray-900 text-center">Authenticator code</label>
              <div className="mt-2">
                <input id="totpCode" name="totpCode" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={8}
                  required value={totpCode} onChange={(e) => setTotpCode(e.target.value)}
                  className="block w-full rounded-lg h-10 border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-indigo-600 focus:ring-0 sm:text-sm text-center" />
              </div>
            </div>
            <button type="submit"
              className="flex h-10 w-full items-center justify-center rounded-lg signUpButton px-3 text-medium text-white focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 transition border">
              Verify & Sign in
            </button>
          </form>
        ) : (
          <form onSubmit={handleSmsSubmit} className="space-y-6">
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <p className="text-sm text-gray-700 text-center">Enter the SMS code to complete sign-in.</p>
            <div>
              <label htmlFor="smsCode" className="block text-sm font-medium text-gray-900 text-center">SMS code</label>
              <div className="mt-2">
                <input id="smsCode" name="smsCode" type="text" inputMode="numeric" pattern="[0-9]*" required
                  value={smsCode} onChange={(e) => setSmsCode(e.target.value)}
                  className="block w-full rounded-lg h-10 border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-indigo-600 focus:ring-0 sm:text-sm text-center" />
              </div>
            </div>
            <button type="submit"
              className="flex h-10 w-full items-center justify-center rounded-lg signUpButton px-3 text-medium text-white focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 transition border">
              Verify & Sign in
            </button>
          </form>
        )}

        <div id="recaptcha-container" style={{ display: "none" }} />

        <div className="mt-6">
          <GoogleButton />
        </div>

        <p className="mt-10 text-center text-sm text-gray-500">
          Not a member?
          <a href="/signup" className="font-semibold text-bluebrand hover:text-blue-500 pl-1">Sign up!</a>
        </p>
      </div>
    </div>
  );
}

// src/pages/TechnicianSignup.jsx
import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  signOut,
} from "firebase/auth";
import { auth } from "../firebase";
import logo from "../assets/InstaFixLogo.png";
import { techSignupSchema } from "../../../backend/validations/technician.validation";

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "http://localhost:5000";

const TECH_SIGNUP_PATH =
  (import.meta?.env?.VITE_TECH_SIGNUP_PATH &&
    String(import.meta.env.VITE_TECH_SIGNUP_PATH)) ||
  "/api/signup/technician";

const TECH_VERIFY_PATH = "/api/technician/verify-email";

const POLL_INTERVAL_MS = 5000;        // check every 5 seconds
const MAX_POLL_MINUTES = 20;         // total time we allow
const MAX_ATTEMPTS = (MAX_POLL_MINUTES * 60_000) / POLL_INTERVAL_MS;


function parseMaybeJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export default function TechnicianSignup() {
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [step, setStep] = useState("form"); // "form" | "verify" | "finalizing"
  const [info, setInfo] = useState("");
  const pollTimer = useRef(null);
  const navigate = useNavigate();

  const [specialities, setSpecialities] = useState([]);
  const [specialisation, setSpecialisation] = useState(""); // selected NAME

  useEffect(() => {
    async function loadSpecialities() {
      try {
        const res = await fetch(`${API_BASE}/api/specialities`);
        const data = await res.json();
        // [{ name, ... }, ...]
        setSpecialities(data);
      } catch (err) {
        console.error("Failed to load specialities:", err);
      }
    }

    loadSpecialities();
  }, []);

  useEffect(
    () => () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    },
    []
  );

  const startPollingForVerification = useMemo(
    () => async () => {
      if (pollTimer.current) clearInterval(pollTimer.current);

      let attempts = 0;

      pollTimer.current = setInterval(async () => {
        attempts += 1;

        try {
          if (!auth.currentUser) return;
          await auth.currentUser.reload();

          if (auth.currentUser.emailVerified) {
            clearInterval(pollTimer.current);
            pollTimer.current = null;
            finalizeSignupAfterVerification().catch(console.error);
            return;
          }
        } catch (err) {
          console.warn("[verify poll] reload failed", err);
        }

        if (attempts > MAX_ATTEMPTS) {
          console.log("[verify poll] max attempts reached, stopping");
          clearInterval(pollTimer.current);
          pollTimer.current = null;
          setInfo(
            'Still not verified. You can click "I’ve verified" after you finish verification, or resend the email.'
          );
        }
      }, POLL_INTERVAL_MS);
    },
    []
  );


  async function handleSignup(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      // 0) Client-side validation with Joi
      const { error: vErr } = techSignupSchema.validate(
        { name, phoneNumber, email, password, specialisation },
        { abortEarly: false }
      );
      if (vErr) {
        setError(vErr.details.map((d) => d.message).join(". "));
        setBusy(false);
        return;
      }

      // 1) Create Firebase user
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const user = cred.user;

      // 2) Get ID token to authenticate with backend
      const idToken = await auth.currentUser.getIdToken(true);

      // 3) Call backend to create User + Technician rows
      const resp = await fetch(`${API_BASE}${TECH_SIGNUP_PATH}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          name,
          phoneNumber,
          specialisation,
          desiredRole: "technician_pending",
        }),
      });

      const raw = await resp.text();
      const data = parseMaybeJSON(raw) || {};
      if (!resp.ok) {
        throw new Error(
          data.error || data.message || raw || "Could not complete technician signup."
        );
      }

      // 4) Set display name in Firebase
      if (name && user) {
        await updateProfile(user, { displayName: name });
      }

      // 5) Send verification email
      await sendEmailVerification(user);

      // 6) Move UI into verify step + start polling
      setStep("verify");
      setInfo(`We sent a verification link to ${email}. Please verify your email to continue.`);
      await startPollingForVerification();
    } catch (err) {
      console.error("Tech signup error:", err);
      let msg = "Signup failed. Please try again.";
      if (err?.code) {
        switch (err.code) {
          case "auth/email-already-in-use":
            msg = "The provided information is invalid. Please check your details and try again.";
            break;
          case "auth/invalid-email":
            msg = "Invalid email address.";
            break;
          case "auth/weak-password":
            msg = "Password too weak (min 6 characters).";
            break;
          case "auth/network-request-failed":
            msg = "Network error. Check your connection.";
            break;
          default:
            msg = err.message || msg;
        }
      } else if (err?.message) msg = err.message;
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function finalizeSignupAfterVerification() {
    try {
      setStep("finalizing");
      setInfo("Email verified! Finalizing your technician profile...");

      // 1) Call backend to mark emailVerified = true for this user
      const idToken = await auth.currentUser.getIdToken(true);

      await fetch(`${API_BASE}${TECH_VERIFY_PATH}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
      });

      // 2) Sign out and redirect
      setInfo("Technician profile created. Redirecting to login…");
      await signOut(auth);
      navigate("/login", { replace: true, state: { verifyComplete: true, email } });

    } catch (err) {
      console.error("Finalize tech failed:", err);
      setError(err?.message || "Could not finalize technician signup.");
      setStep("verify");
      setInfo("You’re verified, but we couldn’t finalize the account. Try again.");
    }
  }

  async function handleIveVerifiedClick() {
    try {
      if (!auth.currentUser)
        return setError("You’re signed out. Please sign in and try again.");
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) {
        if (pollTimer.current) clearInterval(pollTimer.current);
        pollTimer.current = null;
        await finalizeSignupAfterVerification();
      } else {
        setInfo(
          "We still don’t see verification. Make sure you clicked the link in your email, then try again."
        );
      }
    } catch {
      setInfo("Couldn’t refresh status. Try again in a moment.");
    }
  }

  async function handleResend() {
    try {
      if (!auth.currentUser)
        return setError("You’re signed out. Please sign in and try again.");
      await sendEmailVerification(auth.currentUser);
      setInfo(
        `Verification email resent to ${auth.currentUser.email}. Check your inbox.`
      );
    } catch {
      setInfo("Couldn’t resend. Please wait a moment and try again.");
    }
  }

  return (
    <div className="pt-30 flex min-h-full flex-col justify-center px-6 py-12 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm">
        <img src={logo} alt="InstaFix Logo" className="mx-auto h-15 w-auto" />
        <h2 className="mt-10 text-center text-2xl font-bold tracking-tight text-gray-900">
          Become a technician
        </h2>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
        {step === "form" && (
          <form onSubmit={handleSignup} className="space-y-6">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
                {error}
              </div>
            )}

            {/* Full Name */}
            <div>
              <label className="block text-sm font-medium text-gray-900">
                Full Name
              </label>
              <input
                type="text"
                required
                placeholder="John"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-2 block w-full rounded-lg h-10 border border-gray-300 px-3"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-900">
                Phone number
              </label>
              <input
                type="tel"
                required
                placeholder="+15555550100"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                pattern="^\+?[0-9]{7,15}$"
                title="7-15 digits, optional + prefix"
                className="mt-2 block w-full rounded-lg h-10 border border-gray-300 px-3"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-900">
                Email address
              </label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 block w-full rounded-lg h-10 border border-gray-300 px-3"
                placeholder="tech@example.com"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-900">
                Password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 block w-full rounded-lg h-10 border border-gray-300 px-3"
              />
            </div>

            {/* Specialisation */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-900">
                Specialization
              </label>

              <select
                value={specialisation}
                onChange={(e) => setSpecialisation(e.target.value)}
                className="mt-2 block w-full rounded-lg h-10 border border-gray-300 px-3"
                required
              >
                <option value="">Select a specialization</option>
                {specialities.map((sp) => (
                  <option key={sp.id ?? sp.name} value={sp.name}>
                    {sp.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full h-10 rounded-lg signUpButton text-white font-semibold disabled:opacity-60"
            >
              {busy ? "Creating..." : "Apply as Technician"}
            </button>
          </form>
        )}

        {step === "verify" && (
          <div className="space-y-4">
            {info && (
              <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-700 border border-blue-200">
                {info}
              </div>
            )}
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
                {error}
              </div>
            )}

            <p className="text-sm text-gray-700">
              Open your inbox and click the verification link. Once you’re
              verified, click the button below. We’re also checking automatically
              in the background.
            </p>

            <div className="flex gap-2">
              <button
                onClick={handleIveVerifiedClick}
                className="flex-1 h-10 rounded-lg signUpButton text-white"
              >
                I’ve verified
              </button>
              <button
                onClick={handleResend}
                className="flex-1 h-10 rounded-lg border border-gray-300"
              >
                Resend email
              </button>
            </div>

            <p className="text-center text-sm text-gray-500">
              Wrong email?{" "}
              <Link to="/technician-signup" className="text-bluebrand">
                Start over
              </Link>
            </p>
          </div>
        )}

        {step === "finalizing" && (
          <div className="space-y-4">
            <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-700 border border-blue-200">
              {info || "Finalizing your technician profile…"}
            </div>
          </div>
        )}

        {step === "form" && (
          <p className="mt-10 text-center text-sm text-gray-500">
            Already registered?{" "}
            <Link
              to="/login"
              className="font-semibold text-bluebrand hover:text-blue-500"
            >
              Sign in!
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

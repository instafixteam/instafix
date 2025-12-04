// src/pages/Signup.jsx
import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } from "firebase/auth";
import { auth } from "../firebase";
import logo from "../assets/InstaFixLogo.png";
import GoogleButton from "../components/GoogleButton";
import Joi from "joi";

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "http://localhost:5000";

const SIGNUP_PATH =
  (import.meta?.env?.VITE_SIGNUP_PATH && String(import.meta.env.VITE_SIGNUP_PATH)) ||
  "/api/signup";

function parseMaybeJSON(text) { try { return JSON.parse(text); } catch { return null; } }

const namePattern = /^[\p{L}\p{M}][\p{L}\p{M}\s.'-]*$/u;
const addressPattern = /^[\p{L}\p{M}\p{N}\s.,'#()\-/]+$/u;

const signupSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(100)
    .pattern(namePattern)
    .required()
    .label("Full name")
    .messages({
      "string.min": "Full name must be at least 2 characters long",
      "string.pattern.base": "Full name may include letters, spaces, apostrophes, periods, and hyphens only",
    }),
  address: Joi.string()
    .min(5)
    .max(500)
    .pattern(addressPattern)
    .required()
    .label("Address")
    .messages({
      "string.min": "Address must be at least 5 characters long",
      "string.pattern.base": "Address may include letters, numbers, spaces, commas, periods, apostrophes, hyphens, slashes, parentheses and # only",
    }),
  phoneNumber: Joi.string().pattern(/^\+?[0-9]{7,15}$/).optional().allow('').label("Phone number").messages({
    "string.pattern.base": "Phone number must be 7-15 digits. Use only numbers 0-9, optionally starting with +",
  }),
  email: Joi.string().email({ tlds: { allow: false } }).required().label("Email"),
  password: Joi.string()
    .min(8)
    .pattern(/[a-z]/, 'lowercase')
    .pattern(/[A-Z]/, 'uppercase')
    .pattern(/[^a-zA-Z0-9]/, 'special')
    .required()
}).prefs({ errors: { wrap: { label: false } } });

export default function Signup() {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [role, setRole] = useState("customer");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [allErrors, setAllErrors] = useState([]); // NEW: collect all errors
  const [busy, setBusy] = useState(false);

  const [step, setStep] = useState("form"); // "form" | "verify" | "finalizing"
  const [info, setInfo] = useState("");
  const pollTimer = useRef(null);

  const navigate = useNavigate();

  useEffect(() => () => { if (pollTimer.current) clearInterval(pollTimer.current); }, []);

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
          }
        } catch { }
        if (attempts > 100) {
          clearInterval(pollTimer.current);
          pollTimer.current = null;
          setInfo("Still not verified. Click \"I've verified\" after you finish verification, or resend the email.");
        }
      }, 3000);
    },
    []
  );

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});
    setAllErrors([]);
    setBusy(true);

    try {
      const { error: vErr } = signupSchema.validate(
        { name, address, phoneNumber, email, password },
        { abortEarly: false }
      );
      if (vErr) {
        const fe = {};
        let hadPasswordErr = false;
        const allErrs = [];
        for (const d of vErr.details) {
          const field = Array.isArray(d.path) && d.path.length ? d.path[0] : "form";
          // Only show password requirements, never the entered value
          if (field === "password") { hadPasswordErr = true; continue; }
          const msg = (d.message || "").replace(/"[^"]*"/g, "").trim();
          allErrs.push(msg);
          if (!fe[field]) fe[field] = msg;
        }
        if (hadPasswordErr) {
          const pwMsg = "Your password must meet all requirements: at least 8 characters, with uppercase letter (A-Z), lowercase letter (a-z), number (0-9), and special character (!@#$%^&*).";
          fe.password = pwMsg;
          allErrs.push(pwMsg);
        }
        setFieldErrors(fe);
        setAllErrors(allErrs);
        setError("Please correct the highlighted fields.");
        setBusy(false);
        return;
      }

      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const user = cred.user;

      if (name && user) await updateProfile(user, { displayName: name });

      // Save ALL form data to sessionStorage
      const signupDraft = {
        name: name.trim(),
        address: address.trim(),
        phoneNumber: (phoneNumber || "").trim(),
        role: role
      };
      sessionStorage.setItem("signupDraft", JSON.stringify(signupDraft));
      console.log('💾 Saved draft data:', signupDraft);

      await sendEmailVerification(user);

      setStep("verify");
      setInfo(`We sent a verification link to ${email}. Please verify your email to continue.`);
      await startPollingForVerification();
    } catch (err) {
      console.error("Signup error:", err);
      let msg = "Signup failed. Please try again.";
      if (err?.code) {
        switch (err.code) {
          case "auth/email-already-in-use": msg = "The provided information is invalid. Please check your details and try again."; break;
          case "auth/invalid-email": msg = "Invalid email address."; break;
          case "auth/weak-password": msg = "Password too weak."; break;
          case "auth/network-request-failed": msg = "Network error. Check your connection."; break;
          default: msg = err.message || msg;
        }
      } else if (err?.message) {
        msg = err.message;
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  // Helper: validate a single field
  const validateField = (field, value) => {
    let schema;
    switch (field) {
      case "name":
        schema = Joi.string().min(2).max(100).pattern(namePattern).required().label("Full name").messages({
          "string.min": "Full name must be at least 2 characters long",
          "string.pattern.base": "Full name may include letters, spaces, apostrophes, periods, and hyphens only",
        });
        break;
      case "address":
        schema = Joi.string().min(5).max(500).pattern(addressPattern).required().label("Address").messages({
          "string.min": "Address must be at least 5 characters long",
          "string.pattern.base": "Address may include letters, numbers, spaces, commas, periods, apostrophes, hyphens, slashes, parentheses and # only",
        });
        break;
      case "phoneNumber":
        schema = Joi.string().pattern(/^\+?[0-9]{7,15}$/).optional().allow('').label("Phone number").messages({
          "string.pattern.base": "Phone number must be 7-15 digits. Use only numbers 0-9, optionally starting with +",
        });
        break;
      case "email":
        schema = Joi.string().email({ tlds: { allow: false } }).required().label("Email");
        break;
      case "password":
        schema = Joi.string()
          .min(8)
          .pattern(/[a-z]/, 'lowercase')
          .pattern(/[A-Z]/, 'uppercase')
          .pattern(/[^a-zA-Z0-9]/, 'special')
          .required();
        break;
      default:
        return "";
    }
    const { error } = schema.validate(value);
    if (error) {
      if (field === "password") {
        return "Your password must meet all requirements: at least 8 characters, with uppercase letter (A-Z), lowercase letter (a-z), number (0-9), and special character (!@#$%^&*).";
      }
      return error.details[0].message.replace(/"[^"]*"/g, "").trim();
    }
    return "";
  };

  async function finalizeSignupAfterVerification() {
    try {
      setStep("finalizing");
      setInfo("Email verified! Finalizing your account...");

      const user = auth.currentUser;
      if (!user) throw new Error("You're signed out. Please sign in and try again.");

      const idToken = await user.getIdToken(true);

      // Get draft data from sessionStorage
      const draft = (() => {
        try {
          const draftData = JSON.parse(sessionStorage.getItem("signupDraft") || "{}");
          console.log('📝 Retrieved draft data:', draftData);
          return draftData;
        }
        catch (e) {
          console.log('❌ No draft data found:', e);
          return {};
        }
      })();

      console.log('📝 Available data for finalization:', {
        formData: { name, address, phoneNumber, role },
        draftData: draft,
        userData: { displayName: user.displayName, email: user.email }
      });

      // Use current form state OR draft data (form state might be cleared)
      const safeName = (name || draft.name || user.displayName || (user.email ? user.email.split("@")[0] : "") || "").trim();
      const safeAddress = (address || draft.address || "").trim();
      const safePhone = (phoneNumber || draft.phoneNumber || "").trim();
      const safeRole = (role || draft.role || "customer");

      console.log('📝 Finalizing with:', { safeName, safeAddress, safePhone, safeRole });

      if (!safeName || !safeAddress) {
        console.error('❌ Missing required fields after verification');
        setStep("verify");
        setError("We lost your name/address after verification. Please re-enter and try again.");
        return;
      }

      const signupData = {
        name: safeName,
        address: safeAddress,
        phoneNumber: safePhone,
        isVerified: true,
        desiredRole: safeRole,
      };

      console.log('📤 Sending to server:', signupData);

      const resp = await fetch(`${API_BASE}${SIGNUP_PATH}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify(signupData),
      });

      const raw = await resp.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch (parseError) {
        data = null;
      }

      if (!resp.ok) {
        // If backend returns details array, show all errors
        if (data && Array.isArray(data.details) && data.details.length > 0) {
          setAllErrors(data.details);
          setError(data.error || "Signup failed. Please correct the errors below.");
        } else {
          setError(data?.error || raw || "Signup failed. Please try again.");
        }
        setBusy(false);
        return;
      }

      // Success!
      console.log('✅ Signup finalized successfully:', data);
      sessionStorage.removeItem("signupDraft");
      setFieldErrors({});
      setError("");
      setInfo("Account finalized successfully! Let's secure your account with an authenticator.");

      setTimeout(() => {
        navigate("/mfa-setup", { replace: true });
      }, 1000);

    } catch (err) {
      console.error("❌ Finalize signup failed:", err);
      setError(err?.message || "Could not complete account setup after verification.");
      setStep("verify");
      setInfo("You're verified, but we couldn't finalize the account. Try again.");
    }
  }

  async function handleIveVerifiedClick() {
    try {
      if (!auth.currentUser) return setError("You're signed out. Please sign in and try again.");
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) {
        if (pollTimer.current) clearInterval(pollTimer.current);
        pollTimer.current = null;
        await finalizeSignupAfterVerification();
      } else {
        setInfo("We still don't see verification. Click the link in your email, then try again.");
      }
    } catch {
      setInfo("Couldn't refresh status. Try again in a moment.");
    }
  }

  async function handleResend() {
    try {
      if (!auth.currentUser) return setError("You're signed out. Please sign in and try again.");
      await sendEmailVerification(auth.currentUser);
      setInfo(`Verification email resent to ${auth.currentUser.email}. Check your inbox.`);
    } catch {
      setInfo("Couldn't resend. Please wait a moment and try again.");
    }
  }

  // Update field handlers to validate onChange
  const handleNameChange = (e) => {
    setName(e.target.value);
    setFieldErrors((prev) => ({ ...prev, name: validateField("name", e.target.value) }));
  };
  const handleAddressChange = (e) => {
    setAddress(e.target.value);
    setFieldErrors((prev) => ({ ...prev, address: validateField("address", e.target.value) }));
  };
  const handlePhoneChange = (e) => {
    setPhoneNumber(e.target.value);
    setFieldErrors((prev) => ({ ...prev, phoneNumber: validateField("phoneNumber", e.target.value) }));
  };
  const handleEmailChange = (e) => {
    setEmail(e.target.value);
    setFieldErrors((prev) => ({ ...prev, email: validateField("email", e.target.value) }));
  };
  const handlePasswordChange = (e) => {
    setPassword(e.target.value);
    setFieldErrors((prev) => ({ ...prev, password: validateField("password", e.target.value) }));
  };

  return (
    <div className="pt-30 flex min-h-full flex-col justify-center px-6 py-12 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm">
        <img src={logo} alt="InstaFix Logo" className="mx-auto h-15 w-auto" />
        <h2 className="mt-10 text-center text-2xl font-bold tracking-tight text-gray-900">
          Create your account
        </h2>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
        {step === "form" && (
          <form onSubmit={handleSignup} className="space-y-6">
            {/* Show all errors in a list above the form */}
            {allErrors.length > 0 && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200 mb-2">
                <div>Please correct the following:</div>
                <ul className="mt-2 list-disc list-inside text-red-700">
                  {allErrors.map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}
            {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">{error}</div>}

            <div>
              <label className="block text-sm font-medium text-gray-900">Full Name</label>
              <input type="text" required placeholder="John"
                value={name} onChange={handleNameChange}
                aria-invalid={!!fieldErrors.name}
                className="mt-2 block w-full rounded-lg h-10 border border-gray-300 px-3" />
              {fieldErrors.name && <p className="mt-1 text-sm text-red-600">{fieldErrors.name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900">Address</label>
              <input type="text" required value={address} onChange={handleAddressChange}
                aria-invalid={!!fieldErrors.address}
                className="mt-2 block w-full rounded-lg h-10 border border-gray-300 px-3" />
              {fieldErrors.address && <p className="mt-1 text-sm text-red-600">{fieldErrors.address}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900">Phone number (optional)</label>
              <input type="tel"
                value={phoneNumber} onChange={handlePhoneChange}
                pattern="^\+?[0-9]{7,15}$" title="7-15 digits, optional + prefix"
                aria-invalid={!!fieldErrors.phoneNumber}
                className="mt-2 block w-full rounded-lg h-10 border border-gray-300 px-3" />
              {fieldErrors.phoneNumber && <p className="mt-1 text-sm text-red-600">{fieldErrors.phoneNumber}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900">Email address</label>
              <input type="email" autoComplete="email" required
                value={email} onChange={handleEmailChange}
                aria-invalid={!!fieldErrors.email}
                className="mt-2 block w-full rounded-lg h-10 border border-gray-300 px-3"
                placeholder="john.doe@instafix.com" />
              {fieldErrors.email && <p className="mt-1 text-sm text-red-600">{fieldErrors.email}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900">Password</label>
              <input type="password" autoComplete="new-password" required
                value={password} onChange={handlePasswordChange}
                aria-invalid={!!fieldErrors.password}
                className="mt-2 block w-full rounded-lg h-10 border border-gray-300 px-3" />
              {fieldErrors.password && <p className="mt-1 text-sm text-red-600">{fieldErrors.password}</p>}
            </div>

            <button
              type="submit" disabled={busy}
              className="w-full h-10 rounded-lg signUpButton text-white font-semibold disabled:opacity-60"
            >
              {busy ? "Creating..." : "Sign up"}
            </button>
          </form>
        )}

        {step === "verify" && (
          <div className="space-y-4">
            {info && <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-700 border border-blue-200">{info}</div>}
            {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">{error}</div>}
            <p className="text-sm text-gray-700">Open your inbox and click the verification link. Once verified, click below.</p>
            <div className="flex gap-2">
              <button onClick={handleIveVerifiedClick} className="flex-1 h-10 rounded-lg signUpButton text-white">I've verified</button>
              <button onClick={handleResend} className="flex-1 h-10 rounded-lg border border-gray-300">Resend email</button>
            </div>
            <p className="text-center text-sm text-gray-500">Wrong email? <Link to="/signup" className="text-bluebrand">Start over</Link></p>
          </div>
        )}

        {step === "finalizing" && (
          <div className="space-y-4">
            <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-700 border border-blue-200">
              {info || "Finalizing your account…"}
            </div>
          </div>
        )}

        {step === "form" && (
          <>
            <div className="mt-6"><GoogleButton /></div>
            <p className="mt-10 text-center text-sm text-gray-500">
              Already have an account? <Link to="/login" className="font-semibold text-bluebrand hover:text-blue-500">Sign in!</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
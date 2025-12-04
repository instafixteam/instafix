import logo from '../assets/InstaFixLogo.png';
import { useEffect, useRef, useState } from 'react';
import { signInWithEmailAndPassword, multiFactor } from 'firebase/auth';
import { auth } from '../firebase';
import GoogleButton from '../components/GoogleButton';
import { resolveMfaSignInFromError } from '../firebase-mfa';
import { useNavigate } from 'react-router-dom';

const RECAPTCHA_SITE_KEY = "6LdlM_QrAAAAABb7aK95qDRIcEYeR9SnCaSu4kco"; // v2 Checkbox key

export default function Login() {
  const navigate = useNavigate();

  // form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // MFA
  const [needMfa, setNeedMfa] = useState(false);
  const [pendingMfaError, setPendingMfaError] = useState(null);
  const [smsCode, setSmsCode] = useState("");

  // brute-force limiter
  const [failedCount, setFailedCount] = useState(0);
  const captchaRequired = failedCount >= 3;

  // reCAPTCHA (v2 checkbox) state
  const [captchaReady, setCaptchaReady] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const captchaWidgetIdRef = useRef(null);
  const scriptLoadedRef = useRef(false);

  // lazy-load v2 script & render checkbox when needed
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

  const submitActualSignIn = async () => {
    setError("");
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const user = cred.user;

      // If user has no enrolled factors yet → push to MFA enrollment
      await user.reload();
      const enrolled = (multiFactor(user)?.enrolledFactors?.length || 0) > 0;

      if (!enrolled) {
        navigate("/settings/mfa", { replace: true });
        return;
      }

      // enrolled → proceed
      navigate("/", { replace: true });
      
    } catch (err) {
      if (err?.code === "auth/multi-factor-auth-required") {
        setNeedMfa(true);
        setPendingMfaError(err);
      } else {
        setFailedCount((c) => c + 1);
        setError("Invalid credentials. Please try again.");
        if (captchaWidgetIdRef.current != null) {
          try { window.grecaptcha.reset(captchaWidgetIdRef.current); } catch {}
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
      await submitActualSignIn();
      return;
    }
    await submitActualSignIn();
  };

  const handleMfaSubmit = async (e) => {
    e.preventDefault();
    try {
      await resolveMfaSignInFromError(pendingMfaError, smsCode);
      navigate("/");
    } catch {
      setError("Invalid SMS code. Try again.");
    }
  };

  return (
    <div className="flex min-h-full flex-col justify-center px-6 py-12 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm">
        <img src={logo} alt="Your Company" className="mx-auto h-20 w-auto" />
        <h2 className="mt-10 text-center text-2xl/9 font-bold tracking-tight text-gray-900">
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
              <label htmlFor="email" className="block text-sm/6 font-medium text-gray-900">Email address</label>
              <div className="mt-2">
                <input
                  id="email"
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-lg h-10 border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-indigo-600 focus:ring-0 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-sm/6 font-medium text-gray-900">Password</label>
                <div className="text-sm">
                  <a href="#" className="font-semibold text-bluebrand hover:text-blue-500">Forgot password?</a>
                </div>
              </div>
              <div className="mt-2">
                <input
                  id="password"
                  type="password"
                  name="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 h-10 placeholder:text-gray-400 focus:border-indigo-600 focus:ring-0 sm:text-sm"
                />
              </div>
            </div>

            {/* Visible reCAPTCHA appears only after 3 fails */}
            {captchaRequired && (
              <div className="pt-1">
                <div id="login-recaptcha-container" />
                {!captchaReady && (
                  <p className="text-xs text-gray-500 mt-2">Loading reCAPTCHA…</p>
                )}
              </div>
            )}

            <button
              type="submit"
              className="flex h-10 w-full items-center justify-center rounded-lg bg-bluebrand px-3 text-medium text-white focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 signUpButton transition border"
            >
              Sign in
            </button>
          </form>
        ) : (
          // MFA step 2
          <form onSubmit={handleMfaSubmit} className="space-y-6">
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <p className="text-sm text-gray-700">
              We sent an SMS code to your registered phone. Enter it to complete sign-in.
            </p>
            <div>
              <label htmlFor="smsCode" className="block text-sm/6 font-medium text-gray-900">SMS code</label>
              <div className="mt-2">
                <input
                  id="smsCode"
                  name="smsCode"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  value={smsCode}
                  onChange={(e) => setSmsCode(e.target.value)}
                  className="block w-full rounded-lg h-10 border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-indigo-600 focus:ring-0 sm:text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              className="flex h-10 w-full items-center justify-center rounded-lg bg-bluebrand px-3 text-medium text-white focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 transition border"
            >
              Verify & Sign in
            </button>
          </form>
        )}

        {/* Invisible reCAPTCHA used by PhoneAuthProvider.verifyPhoneNumber */}
        <div id="recaptcha-container" style={{ display: "none" }} />

        <div className="mt-6">
          <GoogleButton />
        </div>

        <p className="mt-10 text-center text-sm/6 text-gray-500">
          Not a member?
          <a href="/signup" className="font-semibold text-bluebrand hover:text-blue-500 pl-1">Sign up!</a>
        </p>
      </div>
    </div>
  );
}
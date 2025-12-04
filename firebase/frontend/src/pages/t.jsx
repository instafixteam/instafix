
import logo from '../assets/InstaFixLogo.png';
import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import GoogleButton from '../components/GoogleButton';
import { useNavigate, Link } from 'react-router-dom';


export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault(); // 🚨 Stop the browser from reloading
    setError("");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/"); // ✅ redirect after login (e.g., home page)
    } catch (err) {
      // ❗ Avoid exposing details like err.code to the user
      console.error("Firebase login error:", err.code, err.message);
      // Generic user message to prevent enumeration
      setError("Invalid credentials. Please try again.");
    }
  };

  return (
    <div className="flex min-h-full flex-col justify-center pt-20 px-6 py-12 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm">
        <img src={logo} alt="InstaFix" className="mx-auto h-20 w-auto" />
        <h2 className="mt-10 text-center text-2xl font-bold tracking-tight text-gray-900">
          Sign in to your account
        </h2>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-900">
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 block w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              autoComplete="email"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-900">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 block w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              autoComplete="current-password"
            />
          </div>

          {/* 🔴 Error message displayed inline */}
          {error && (
            <div className="text-red-600 text-sm font-medium text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full rounded-lg bg-bluebrand py-2 text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Sign in
          </button>
        </form>

        <div className="mt-6">
          <GoogleButton />
        </div>

        <p className="mt-10 text-center text-sm text-gray-500">
          Not a member?{" "}
          <Link to="/signup" className="text-bluebrand hover:text-blue-500">
            Sign up!
          </Link>
        </p>

        <p className="text-sm text-gray-600 mt-3 text-center">
          Forgot your password?{" "}
          <Link to="/reset-password" className="text-blue-500 hover:underline">
            Reset it here
          </Link>
        </p>
      </div>
    </div>
  );
}
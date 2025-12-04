import logo from '../assets/InstaFixLogo.png';
import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import GoogleButton from '../components/GoogleButton';
import { useNavigate } from 'react-router-dom';

export default function Signup() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();

    setError("");
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await userCredential.user.getIdToken();

      // Send Firebase token to backend to create session
      await fetch("http://localhost:5050/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ idToken }),
      });

      navigate("/services"); // Redirect to services page
    } catch (err) {
      let msg = "Login failed.";
      if (err && err.code) {
        switch (err.code) {
          case "auth/too-many-requests":
            msg = "Too many attempts, try again later.";
            break;
          case "auth/user-not-found":
          case "auth/wrong-password":
          case "auth/invalid-email":
            msg = "Invalid credentials.";
            break;
          default:
            msg = "Login failed.";
        }
      }
      setError(msg);
    }
  };

  return (
    <div className="flex min-h-full flex-col justify-center pt-20 px-6 py-12 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm">
        <img src={logo} alt="Your Company" className="mx-auto h-20 w-auto" />
        <h2 className="mt-10 text-center text-2xl/9 font-bold tracking-tight text-gray-900">
          Sign in to your account
        </h2>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
        <form onSubmit={handleLogin} className="space-y-6">
          {error && (
            <div className="flex items-center gap-2 bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded-lg mb-2 animate-fade-in">
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12A9 9 0 1 1 3 12a9 9 0 0 1 18 0z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="email" className="block text-sm/6 font-medium text-gray-900">Email address</label>
            </div>
            <div className="mt-2">
              <input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className="block w-full rounded-lg border border-gray-300 px-3 py-1.5 text-base"/>
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm/6 font-medium text-gray-900">Password</label>
            <div className="mt-2">
              <input id="password" type="password" required value={password} onChange={e => setPassword(e.target.value)} className="block w-full rounded-lg border border-gray-300 px-3 py-1.5 text-base"/>
            </div>
          </div>

          <button type="submit" className="flex h-10 w-full items-center justify-center rounded-lg bg-bluebrand text-white">
            Sign in
          </button>
        </form>

        <div className="mt-6">
          <GoogleButton />
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "../firebase";
import logo from "../assets/InstaFixLogo.png";
import GoogleButton from "../components/GoogleButton";

export default function Signup() {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");

    try {
      // Create account in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, { displayName: name });

      // Get Firebase ID token
      const token = await userCredential.user.getIdToken();

      // Send user info to backend for DB insertion
      const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
      console.log("Sending signup data to backend...");
      const response = await fetch(`${apiBase}/api/users`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          providerID: userCredential.user.providerData[0]?.providerId,
          displayName: name,
          email: userCredential.user.email,
          emailVerified: userCredential.user.emailVerified,
          phoneNumber: userCredential.user.phoneNumber,
          role: "customer", // always send 'customer' for signup
          photoURL: userCredential.user.photoURL,
          address: address,
        }),
      });

      if (!response.ok) {
        let msg = "An error occurred while saving your account. Please try again.";
        try {
          const data = await response.json();
          if (data && data.error) msg = data.error;
        } catch (_) {
          try {
            const text = await response.text();
            if (text) msg = text;
          } catch {}
        }
        setError(msg);
        return;
      }

      alert("Account created successfully ✅");
    } catch (err) {
      console.error(err);
      let msg = "An error occurred. Please try again.";
      if (err && err.code) {
        switch (err.code) {
          case "auth/email-already-in-use":
            msg = "This email is already in use.";
            break;
          case "auth/invalid-email":
            msg = "The email address is invalid.";
            break;
          case "auth/weak-password":
            msg = "Password is too weak (min 6 characters).";
            break;
          case "auth/network-request-failed":
            msg = "Network error. Check your connection and try again.";
            break;
          default:
            msg = err.message || msg;
        }
      }
      setError(msg);
    }
  };

  return (
    <div className="pt-20 flex min-h-full flex-col justify-center px-6 py-12 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm">
        <img src={logo} alt="InstaFix Logo" className="mx-auto h-15 w-auto" />
        <h2 className="mt-10 text-center text-2xl font-bold tracking-tight text-gray-900">
          Create your account
        </h2>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
        <form onSubmit={handleSignup} className="space-y-6">
          {error && <p className="text-red-500 text-sm">{error}</p>}

          {/* Full Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-900">
              Full Name
            </label>
            <div className="mt-2">
              <input
                id="name"
                name="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="block w-full rounded-lg h-10 border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-indigo-600 focus:ring-0 sm:text-sm"
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label htmlFor="address" className="block text-sm font-medium text-gray-900">
              Address
            </label>
            <div className="mt-2">
              <input
                id="address"
                name="address"
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="block w-full rounded-lg h-10 border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-indigo-600 focus:ring-0 sm:text-sm"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-900">
              Email address
            </label>
            <div className="mt-2">
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full rounded-lg h-10 border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-indigo-600 focus:ring-0 sm:text-sm"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-900">
              Password
            </label>
            <div className="mt-2">
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-lg h-10 border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-indigo-600 focus:ring-0 sm:text-sm"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="flex w-full items-center h-10 justify-center rounded-lg bg-bluebrand px-3 py-1.5 text-sm font-semibold text-white shadow hover:bg-indigo-500 focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 transition border"
          >
            Sign up
          </button>
        </form>

        <div className="mt-6">
          <GoogleButton />
        </div>

        <p className="mt-10 text-center text-sm text-gray-500">
          Already have an account?
          <a href="/login" className="font-semibold text-bluebrand hover:text-blue-500 pl-1">
            Sign in!
          </a>
        </p>
      </div>
    </div>
  );
}

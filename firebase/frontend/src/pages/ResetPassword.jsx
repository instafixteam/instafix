// ResetPassword.jsx
import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../firebase";

export default function ResetPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage("If an account exists with that email, you will receive a reset link shortly");
    } catch (err) {
      // Log the detailed error for debugging purposes
      console.error("sendPasswordResetEmail failed:", error.code, error.message);
      // But show a generic message to the user
      setInfoMessage("If an account exists with that email, you will receive a password reset link shortly.");
      // Optionally, you could store the errorMessage internally (e.g., send to your logging service)
      setErrorMessage(""); // don’t show the raw error to user
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-offwhite">
      <div className="bg-white p-6 rounded-xl shadow w-80">
        <h2 className="text-xl font-semibold mb-4 text-center">Reset Password</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Enter your email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border rounded-lg w-full px-3 py-2 mb-3"
          />
          <button type="submit" className="border signUpButton hover:border text-white w-full py-2 rounded-lg">
            Send Reset Email
          </button>
        </form>

        {message && <p className="text-green-600 mt-3 text-sm">{message}</p>}
        {error && <p className="text-red-600 mt-3 text-sm">{error}</p>}

      </div>
    </div>
  );
}

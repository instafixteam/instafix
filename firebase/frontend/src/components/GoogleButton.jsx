import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import { useNavigate } from "react-router-dom";

export default function GoogleButton() {
  const navigate = useNavigate();

  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      // get Firebase ID token and post to backend to create/upsert user
      const token = await user.getIdToken();
      const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
      try {
        const resp = await fetch(`${apiBase}/api/users`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            providerID: "google",
            displayName: user.displayName,
            email: user.email,
            emailVerified: user.emailVerified,
            phoneNumber: user.phoneNumber,
            photoURL: user.photoURL,
          }),
        });
        if (!resp.ok) {
          const text = await resp.text();
          console.error("Backend /api/users returned error:", resp.status, text);
        }
      } catch (err) {
        console.error("Failed to call backend /api/users:", err);
      }

      // Send Firebase token to backend to create session
      await fetch("http://localhost:5000/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token }),
      });

      navigate("/services"); // Redirect to services page
    } catch (error) {
      console.error("Google login failed:", error);
    }
  };

  return (
    <button
      type="button"
      onClick={handleGoogleLogin}
      className="text-[#4285F4] hover:text-white border border-[#4285F4] hover:bg-[#4285F4]/70 focus:ring-4 focus:outline-none focus:ring-[#4285F4]/50 font-medium rounded-lg text-sm px-5 h-10 text-center inline-flex items-center dark:focus:ring-[#4285F4]/55 me-2 mb-2 w-full justify-center"
    >
      <svg
        className="w-4 h-4 me-2"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        fill="currentColor"
        viewBox="0 0 18 19"
      >
        <path
          fillRule="evenodd"
          d="M8.842 18.083a8.8 8.8 0 0 1-8.65-8.948 8.841 8.841 0 0 1 8.8-8.652h.153a8.464 8.464 0 0 1 5.7 2.257l-2.193 2.038A5.27 5.27 0 0 0 9.09 3.4a5.882 5.882 0 0 0-.2 11.76h.124a5.091 5.091 0 0 0 5.248-4.057L14.3 11H9V8h8.34c.066.543.095 1.09.088 1.636-.086 5.053-3.463 8.449-8.4 8.449l-.186-.002Z"
          clipRule="evenodd"
        />
      </svg>
      Sign in with Google
    </button>
  );
}

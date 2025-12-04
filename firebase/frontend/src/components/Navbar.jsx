import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import useAuthState from "../hooks/useAuthState";

import logo from "../assets/InstaFixLogo.png";

const linkBase = "px-3 py-2 rounded-lg text-sm font-medium transition-colors";
const linkIdle = "text-gray-700 menuButton transition";
const linkActive = "menuButton";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const user = useAuthState();
  const navigate = useNavigate(); // ✅ inside component body

  const handleLogout = async () => {
    try {
      // Sign out from Firebase
      await signOut(auth);

      // Destroy session on backend
      await fetch("http://localhost:5050/api/logout", {
        method: "POST",
        credentials: "include",
      });

      // Redirect to login page
      navigate("/login");
    } catch (err) {
      console.error("Logout failed:", err);
      alert("Failed to logout. Try again.");
    }
  };

  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur shadow-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-[76px] flex items-center">
        {/* Left: Brand */}
        <Link to="/" className="flex items-center gap-2">
          <img src={logo} alt="InstaFix" className="w-10 h-10 object-contain" />
          <span className="text-bluebrand font-bold text-xl">InstaFix</span>
        </Link>

        {/* Center: Links (desktop) */}
        <nav className="hidden md:flex items-center gap-2 ml-8">
          {[
            { to: "/", label: "Home" },
            { to: "/shop", label: "Shop" },
            { to: "/about", label: "About" },
            { to: "/contact", label: "Contact" },
          ].map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `${linkBase} ${isActive ? linkActive : linkIdle}`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        {/* Right: Auth buttons (desktop) */}
        <div className="ml-auto hidden md:flex items-center gap-3">
          {!user ? (
            <>
              <Link
                to="/login"
                className="px-4 py-2 text-sm font-medium rounded-lg border loginButton text-bluebrand hover:bg-sky hover:text-white transition"
              >
                Login
              </Link>
              <Link
                to="/signup"
                className="px-4 py-2 text-sm font-medium rounded-lg bg-bluebrand text-white signUpButton transition"
              >
                Sign Up
              </Link>
            </>
          ) : (
            <>
              <span className="text-sm px-3 py-2">Hello 👋 {user.email}</span>
              <button
                onClick={handleLogout}
                className="px-3 py-1 rounded bg-bluebrand logOutButton transition"
              >
                Logout
              </button>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="md:hidden ml-auto p-2 rounded-md hover:bg-gray-200"
          aria-label="Toggle menu"
        >
          <svg
            className="w-6 h-6 text-gray-800"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            {open ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-offwhite shadow-md">
          <nav className="px-4 py-3 flex flex-col gap-2">
            {[
              { to: "/", label: "Home" },
              { to: "/shop", label: "Services" },
              { to: "/about", label: "About" },
              { to: "/contact", label: "Contact" },
            ].map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `block ${linkBase} ${isActive ? linkActive : linkIdle}`
                }
              >
                {l.label}
              </NavLink>
            ))}

            {user ? (
              <>
                <span className="text-sm px-3 py-2">Hello 👋 {user.email}</span>
                <button
                  onClick={handleLogout}
                  className="px-3 py-1 rounded bg-bluebrand logOutButton transition"
                >
                  Logout
                </button>
              </>
            ) : (
              <div className="mt-2 flex gap-2">
                <Link
                  to="/login"
                  onClick={() => setOpen(false)}
                  className="flex-1 px-4 py-2 text-sm font-medium rounded-lg border border-bluebrand text-bluebrand text-center loginButton hover:bg-bluebrand transition"
                >
                  Login
                </Link>
                <Link
                  to="/signup"
                  onClick={() => setOpen(false)}
                  className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-bluebrand text-white text-center signUpButton transition"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

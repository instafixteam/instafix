import { Menu, MenuButton, MenuItem, MenuItems, Transition } from "@headlessui/react";
import { Fragment, useEffect, useState, useCallback } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";

// Prefer AuthContext (RBAC branch) if available, otherwise fall back to the hook (main branch)
import { useAuthContext } from "../Context/AuthContext";
import useAuthState from "../hooks/useAuthState";

import logo from "../assets/InstaFixLogo.png";

const linkBase = "px-3 py-2 rounded-lg text-sm font-medium transition-colors";
const linkIdle = "text-gray-700 menuButton transition";
const linkActive = "menuButton";

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "http://localhost:5000"; // matches merged backend default; change if needed

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const navigate = useNavigate();

  // Get user from context if present; otherwise from custom hook
  let ctxUser;
  try {
    ctxUser = useAuthContext?.();
  } catch {
    ctxUser = null;
  }
  const hookUser = useAuthState?.();
  const currentUser = ctxUser?.currentUser || hookUser || null;

  const fetchCartCount = useCallback(async () => {
    if (!currentUser) {
      setCartCount(0);
      return;
    }
    try {
      const r = await fetch(`${API_BASE}/api/cart`, {
        credentials: "include", // send __session cookie
      });
      if (!r.ok) {
        // 401/403 when not signed in → zero out
        setCartCount(0);
        return;
      }
      const data = await r.json();
      const count = Array.isArray(data?.items)
        ? data.items.reduce((sum, it) => sum + Number(it.quantity || 0), 0)
        : 0;
      setCartCount(count);
    } catch {
      // network hiccup: don't explode the navbar
    }
  }, [currentUser]);

  useEffect(() => {
    fetchCartCount();
  }, [fetchCartCount]);

  // Refresh when the window regains focus (tab switch)
  useEffect(() => {
    const onFocus = () => fetchCartCount();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchCartCount]);

  // Lightweight cross-app bus: listen for "cart:updated" to refresh badge
  useEffect(() => {
    const onCartUpdated = () => fetchCartCount();
    window.addEventListener("cart:updated", onCartUpdated);
    return () => window.removeEventListener("cart:updated", onCartUpdated);
  }, [fetchCartCount]);

  const handleLogout = async () => {
    try {
      // Firebase sign out
      await signOut(auth);

      // Destroy session on backend (main branch behavior)
      await fetch(`${API_BASE}/api/logout`, {
        method: "POST",
        credentials: "include",
      });

      setCartCount(0);
      navigate("/login");
    } catch (err) {
      console.error("Logout failed:", err);
      alert("Failed to logout. Try again.");
    }
  };

  const navLinks = [
    { to: "/", label: "Home" },
    { to: "/services", label: "Services" }, // desktop says Shop; mobile 'Services' in one branch — keeping Shop for consistency
    { to: "/about", label: "About" },
    { to: "/contact", label: "Contact" },
  ];

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
          {navLinks.map((l) => (
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

        {/* Right: Cart + Auth (desktop) */}
        <div className="ml-auto hidden md:flex items-center gap-3">
           {/* Cart button (visible for everyone; will show 0 when logged out) */}
          
          <Link
            to="/cart"
            aria-label="View cart"
            className="relative inline-flex items-center justify-center rounded-lg px-3 py-2 hover:bg-gray-100 transition"
            onClick={() => setOpen(false)}
          >
            {/* Simple cart icon */}
            <svg
              viewBox="0 0 24 24"
              className="w-6 h-6 text-gray-800"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 12.39A2 2 0 0 0 9.62 15h8.76a2 2 0 0 0 1.98-1.61L23 6H6" />
            </svg>

            {/* Badge */}
            <span
              className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-bluebrand text-white text-xs font-semibold flex items-center justify-center"
              aria-live="polite"
            >
              {cartCount}
            </span>
          </Link>
          
          {!currentUser ? (
            <>
              <Link
                to="/login"
                className="px-4 py-2 text-sm font-medium rounded-lg border loginButton text-bluebrand hover:bg-sky hover:text-white transition"
              >
                Login
              </Link>
              <Link
                to="/signup"
                className="px-4 py-2 text-sm font-medium rounded-lg bg-bluebrand border text-white signUpButton transition"
              >
                Sign Up
              </Link>
            </>
          ) : (
            <Menu as="div" className="relative ml-1">
              <MenuButton className="relative flex max-w-xs items-center rounded-full focus:outline-none">
                <img
                  src={currentUser?.photoURL || "https://avatar.iran.liara.run/public/93"}
                  alt="avatar"
                  className="size-8 rounded-full outline -outline-offset-1 outline-white/10"
                />
              </MenuButton>
              <Transition
                as={Fragment}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
              >
                <MenuItems className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-lg bg-white py-1 shadow-lg focus:outline-none">
                  <MenuItem
                    as={Link}
                    to={`/profile/${currentUser?.uid}`}
                    className="block px-4 py-2 text-sm text-gray-700 data-[active]:bg-gray-100 data-[active]:text-gray-900"
                  >
                    Your Profile
                  </MenuItem>

                  <MenuItem
                    as="button"
                    type="button"
                    onClick={handleLogout}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 data-[active]:bg-gray-100 data-[active]:text-gray-900"
                  >
                    Logout
                  </MenuItem>
                </MenuItems>
              </Transition>
            </Menu>
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
            {navLinks.map((l) => (
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

            {/* Mobile cart row */}
            <Link
              to="/cart"
              onClick={() => setOpen(false)}
              className={`flex items-center justify-between ${linkBase} ${linkIdle}`}
              aria-label="View cart"
            >
              <span>Cart</span>
              <span className="ml-2 inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-bluebrand text-white text-xs font-semibold">
                {cartCount}
              </span>
            </Link>

            {currentUser ? (
              <>
                <span className="text-sm px-3 py-2">
                  Hello 👋 {currentUser.displayName || currentUser.email}
                  <Link
                    to={`/profile/${currentUser.uid}`}
                    onClick={() => setOpen(false)}
                    className="px-5 py-2 text-sm text-bluebrand hover:text-blue-500 rounded-md"
                  >
                    ✏️ Edit Profile
                  </Link>
                </span>
                <button
                  onClick={async () => {
                    await handleLogout();
                    setOpen(false);
                  }}
                  className="px-3 py-1 rounded bg-bluebrand logOutButton transition text-white"
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
                  className="flex-1 px-4 py-2 text-sm font-medium border rounded-lg bg-bluebrand text-white text-center signUpButton transition"
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

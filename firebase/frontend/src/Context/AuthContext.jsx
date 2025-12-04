// src/Context/AuthContext.jsx
import { createContext, useContext, useEffect, useState, useRef } from "react";
import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "http://localhost:5000";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  // null = unknown/no role; use `loading` to tell if we’re still hydrating
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const sessionAttemptedRef = useRef(false);

  const refreshRoleFromDB = async (user) => {
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${API_BASE}/api/users/${user.uid}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setUserRole(data.user?.role || null);
      } else {
        setUserRole(null);
      }
    } catch (e) {
      console.warn("[Auth] refreshRoleFromDB failed", e);
      setUserRole(null);
    }
  };

  const ensureSession = async (user) => {
    if (sessionAttemptedRef.current) return; // avoid duplicate attempts
    sessionAttemptedRef.current = true;
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`${API_BASE}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ idToken }),
      });
      // We do not rely on response body here; cookie is HttpOnly
      if (!res.ok) {
        console.warn("[Auth] /api/login failed status:", res.status);
      } else {
        console.info("[Auth] Session created");
      }
    } catch (e) {
      console.warn("[Auth] ensureSession error", e);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setCurrentUser(null);
        setUserRole(null);
        setLoading(false);
        sessionAttemptedRef.current = false; // reset for next login
        return;
      }

      try {
        await user.getIdToken(true);
        setCurrentUser(user);

        // 1) Try existing session
        let meRes = await fetch(`${API_BASE}/api/me`, { credentials: "include" });
        let meData = meRes.ok ? await meRes.json() : null;
        let role = meData?.user?.role || null;

        if (!role) {
          // 2) Attempt to create session automatically
          await ensureSession(user);
          // Re-check session
          meRes = await fetch(`${API_BASE}/api/me`, { credentials: "include" });
          meData = meRes.ok ? await meRes.json() : null;
          role = meData?.user?.role || null;
        }

        if (role) {
          setUserRole(role);
          setLoading(false);
          return;
        }

        // 3) Fallback: direct DB fetch (ownership protected)
        await refreshRoleFromDB(user);
      } catch (err) {
        console.error("[Auth] hydrate error:", err);
        setUserRole(null);
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{ currentUser, userRole, setUserRole, refreshRoleFromDB, loading }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = () => useContext(AuthContext);


/* // src/Context/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "http://localhost:5000";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  // undefined = not hydrated yet; null = no role/unknown
  const [userRole, setUserRole] = useState(undefined);
  const [loading, setLoading] = useState(true);

  // optional helper to force-refresh role from DB
  const refreshRoleFromDB = async (user) => {
    try {
      const token = await user.getIdToken();
      const res = await fetch(`http://localhost:5000/api/users/${user.uid}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setUserRole(data.user?.role || null);
      } else {
        setUserRole(null);
      }
    } catch {
      setUserRole(null);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setCurrentUser(null);
        setUserRole(null);
        setLoading(false);
        return;
      }

      try {
        // Ensure latest Firebase token
        await user.getIdToken(true);
        setCurrentUser(user);

        // 1) Try session first (fast, no ownership checks)
        const meRes = await fetch(`${API_BASE}/api/me`, {
          credentials: "include", // IMPORTANT: send cookie
        });

        if (meRes.ok) {
          const me = await meRes.json();
          if (me?.user?.role) {
            setUserRole(me.user.role);
            setLoading(false);
            return;
          }
        }

        // 2) Fallback: read role from DB (ownership-protected route)
        const token = await user.getIdToken();
        const dbRes = await fetch(`${API_BASE}/api/users/${user.uid}`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });

        if (dbRes.ok) {
          const data = await dbRes.json();
          setUserRole(data?.user?.role ?? null);
        } else {
          setUserRole(null);
        }
      } catch (err) {
        console.error("Auth hydrate error:", err);
        setUserRole(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Expose setUserRole so Login/Signup can set it immediately after server response
  return (
    <AuthContext.Provider value={{ currentUser, userRole, setUserRole, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = () => useContext(AuthContext);
 */
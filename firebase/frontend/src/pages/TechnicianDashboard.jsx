// src/pages/TechnicianDashboard.jsx

import { Fragment, useEffect } from "react";
import logo from "../assets/InstaFixLogo.png";
import { useAuthContext } from "../Context/AuthContext";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import { signOut } from "firebase/auth";

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "http://localhost:5000";

export default function TechnicianDashboard() {
  const { currentUser, userRole, loading: authLoading } = useAuthContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser) {
      navigate("/login", { replace: true });
      return;
    }
    if (userRole !== "technician") {
      navigate("/unauthorized", { replace: true });
    }
  }, [authLoading, currentUser, userRole, navigate]);

  const handleLogout = async () => {
    try {
      // kill server session
      await fetch(`${API_BASE}/api/logout`, {
        method: "POST",
        credentials: "include", 
      }).catch(() => { });
      // sign out from Firebase
      await signOut(auth);
    } finally {
      navigate("/login", { replace: true });
    }
  };

  if (authLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-gray-600 text-lg">Loading your session...</p>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <header className="relative shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Technician Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Signed in as <span className="font-medium">{currentUser?.email}</span> ({userRole})
          </p>
        </div>
      </header>

      <main>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-700">
              Welcome! Your technician dashboard is ready. Jobs will appear here once assigned.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

// src/pages/PendingTechnicianOnboarding.jsx
import { useEffect, useState } from "react";
import { useAuthContext } from "../Context/AuthContext";
import { useNavigate } from "react-router-dom";
//import SumsubSdk  from "@sumsub/websdk";
import snsWebSdk from "@sumsub/websdk";


const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

export default function PendingTechnicianOnboarding() {
  const { currentUser, userRole, loading: authLoading } = useAuthContext();
  const navigate = useNavigate();
  const [status, setStatus] = useState("not_started");
  const [loading, setLoading] = useState(false);

  // Redirect unauthenticated users
  useEffect(() => {
    if (authLoading) return;
    if (!currentUser) return navigate("/login", { replace: true });
    if (userRole !== "pending_technician")
      return navigate("/unauthorized", { replace: true });
    checkStatus();
  }, [authLoading, currentUser, userRole]);

  // Fetch KYC status from backend
  const checkStatus = async () => {
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch(`${API_BASE}/api/kyc/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setStatus(data.status);
    } catch {
      setStatus("not_started");
    }
  };

  // Start KYC flow using Sumsub SDK


  const startKyc = async () => {
    setLoading(true);
    try {
      const idToken = await currentUser.getIdToken();
      const res = await fetch(`${API_BASE}/api/kyc/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ uid: currentUser.uid, email: currentUser.email }),
      });
      const data = await res.json();

      if (!data.token) throw new Error("No SDK token returned");

      // Launch WebSDK with updateAccessToken callback
      snsWebSdk
        .init(data.token, async () => {
          // This function provides a fresh SDK token when the previous one expires
          const tokenRes = await fetch(`${API_BASE}/api/kyc/start`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${await currentUser.getIdToken()}`,
            },
            body: JSON.stringify({ uid: currentUser.uid, email: currentUser.email }),
          });
          const json = await tokenRes.json();
          return json.token; // return the fresh SDK token
        })
        .withConf({ lang: "en" })
        .withOptions({ adaptIframeHeight: true })
        .build()
        .launch("#sumsub-websdk-container");

    } catch (err) {
      console.error("Failed to start KYC:", err);
      alert("Failed to start KYC");
    } finally {
      setLoading(false);
    }
  };


  if (authLoading) return <p className="text-center mt-10">Loading...</p>;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 pt-30 px-4">
      <div className="bg-white shadow-md rounded-lg p-8 w-full max-w-md text-center">
        <h1 className="text-2xl font-bold mb-6">Technician Onboarding</h1>

        {["not_started", "init"].includes(status) && (
          <>
            <p className="mb-4 text-gray-600">
              To proceed, please complete your KYC verification.
            </p>
            <button
              onClick={startKyc}
              disabled={loading}
              className="bg-indigo-600 text-white px-6 py-3 rounded-md font-medium hover:bg-indigo-700 disabled:bg-gray-400"
            >
              {loading ? "Starting..." : "Start KYC"}
            </button>
          </>
        )}

        {status === "pending" && (
          <p className="text-gray-700">
            Your KYC verification is in progress. Please check back later.
          </p>
        )}

        {["approved"].includes(status) && (
          <p className="text-green-600 font-medium">
            Your KYC has been submitted successfully. InstaFix admin will now
            review your application.
          </p>
        )}
        {/* Sumsub container */}
        <div id="sumsub-websdk-container" className="mt-6"></div>
      </div>
    </div>
  );
}

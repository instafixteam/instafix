import { useEffect, useState } from "react";
import { auth } from "../firebase";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

export default function AdminDashboard() {
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTechnicians();
  }, []);

  const loadTechnicians = async () => {
    setLoading(true);
    const token = await auth.currentUser.getIdToken();
    console.log("Fetching technicians with token:", token);

    const res = await fetch(`${API_BASE}/api/admin/technicians`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();
    setTechnicians(data.technicians || []);
    setLoading(false);
  };

  const updateStatus = async (uid, action) => {
    // Optimistically update the state so UI doesn't jump
    setTechnicians((prev) =>
      prev.map((tech) =>
        tech.uid === uid
          ? { ...tech, adminApproval: action === "approve" ? true : false }
          : tech
      )
    );

    // Send request to server (no full reload)
    try {
      await fetch(`${API_BASE}/api/admin/technicians/${uid}/${action}`, {
        headers: {
          Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
        },
        method: "POST",
      });
    } catch (err) {
      console.error("Failed to update status:", err);
      // Revert if failed
      loadTechnicians();
    }
  };

  const badgeClass = (status, type) => {
    if (type === "kyc") {
      if (status === "init") return "bg-green-100 text-green-800";
      if (status === "approved") return "bg-green-100 text-green-800";
      if (status === "pending") return "bg-yellow-100 text-yellow-800";
      if (status === "rejected") return "bg-red-100 text-red-800";
    } else {
      if (status === true) return "bg-green-100 text-green-800";
      if (status === false) return "bg-red-100 text-red-800";
      if (status === null) return "bg-gray-100 text-gray-600";
    }
  };

  const badgeText = (status, type) => {
    if (type === "kyc") {
      if (status === "init") return "KYC Initiated";
      if (status === "approved") return "KYC Completed";
      if (status === "pending") return "Pending";
      if (status === "rejected") return "Rejected";
    } else {
      if (status === true) return "Approved";
      if (status === false) return "Rejected";
      if (status === null) return "Not Reviewed";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-4 py-5 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <h2 className="text-xl font-semibold mb-6">Technician Approvals</h2>

        {loading ? (
          <p className="text-center mt-10 text-gray-500">Loading...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white shadow-lg rounded-lg table-fixed">
              <thead className="bg-gray-100">
                <tr className="align-middle">
                  <th className="p-4 w-1/3 text-left">Email</th>
                  <th className="p-4 w-1/6 text-left">KYC Status</th>
                  <th className="p-4 w-1/6 text-left">Admin Approval</th>
                  <th className="p-4 w-1/3 text-middle">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {technicians.map((tech) => (
                  <tr
                    key={tech.uid}
                    className="hover:bg-gray-50 transition-colors duration-150"
                  >
                    <td className="p-4 truncate">{tech.email}</td>
                    <td className="p-4">
                      <span
                        className={`px-2 py-1 rounded-full text-sm font-medium ${badgeClass(
                          tech.kycStatus,
                          "kyc"
                        )}`}
                      >
                        {badgeText(tech.kycStatus, "kyc")}
                      </span>
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-2 py-1 rounded-full text-sm font-medium ${badgeClass(
                          tech.adminApproval,
                          "admin"
                        )}`}
                      >
                        {badgeText(tech.adminApproval, "admin")}
                      </span>
                    </td>
                    <td className="p-4 flex gap-3">
                      <button
                        className="flex-1 bg-green-200 text-green-900 px-4 py-2 rounded-md hover:bg-green-300 transition"
                        onClick={() => updateStatus(tech.uid, "approve")}
                      >
                        Approve
                      </button>
                      <button
                        className="flex-1 bg-red-200 text-red-900 px-4 py-2 rounded-md hover:bg-red-300 transition"
                        onClick={() => updateStatus(tech.uid, "reject")}
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

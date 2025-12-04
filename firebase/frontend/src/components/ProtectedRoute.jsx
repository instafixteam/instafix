// src/components/ProtectedRoute.jsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuthContext } from "../Context/AuthContext";

export default function ProtectedRoute({ children, allowedRoles }) {
    const { currentUser, userRole, loading } = useAuthContext();
    const location = useLocation();

    // Still hydrating auth/role? show a tiny loader (do NOT redirect yet)
    if (loading || userRole === undefined) {
        return (
            <div className="min-h-[40vh] grid place-items-center">
                <div className="animate-spin h-6 w-6 rounded-full border-2 border-gray-300 border-t-gray-700" />
            </div>
        );
    }

    // Not signed in
    if (!currentUser) {
        return <Navigate to="/login" replace state={{ from: location }} />;
    }

    // If route is role-gated, check it
    if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
        const role = (userRole || "customer").toLowerCase();
        if (!allowedRoles.map(r => r.toLowerCase()).includes(role)) {
            return <Navigate to="/unauthorized" replace />;
        }
    }

    return children;
}

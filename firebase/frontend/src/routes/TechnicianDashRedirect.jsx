// src/routes/TechnicianDashRedirect.jsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "../Context/AuthContext";

export default function TechnicianDashRedirect() {
    const navigate = useNavigate();
    const { currentUser, loading } = useAuthContext();

    useEffect(() => {
        if (loading) return;
        if (!currentUser) {
            navigate("/login", { replace: true });
            return;
        }
        navigate(`/technician-dashboard/${currentUser.uid}`, { replace: true });
    }, [loading, currentUser, navigate]);

    return null; // or a spinner while loading
}

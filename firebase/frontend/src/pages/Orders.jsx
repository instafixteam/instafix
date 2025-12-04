// src/pages/Orders.jsx
import { useEffect, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";

export default function OrdersPage() {
    const [orders, setOrders] = useState([]);
    const [status, setStatus] = useState("Loading...");

    useEffect(() => {
        const auth = getAuth();

        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                setStatus("You must be signed in to view your orders.");
                setOrders([]);
                return;
            }

            try {
                const token = await user.getIdToken(); // 👈 Firebase ID token

                const res = await fetch("http://localhost:5000/api/orders/me", {
                    headers: {
                        Authorization: `Bearer ${token}`, // 👈 send token
                    },
                });

                if (!res.ok) {
                    const text = await res.text();
                    console.error("Error response:", res.status, text);
                    setStatus(`Failed to fetch orders (HTTP ${res.status})`);
                    return;
                }

                const data = await res.json();
                setOrders(data.orders || []);
                setStatus("");
            } catch (err) {
                console.error("Network/auth error:", err);
                setStatus("Failed to fetch orders (network/auth error)");
            }
        });

        return () => unsub();
    }, []);

    if (status) {
        return (
            <div className="max-w-xl mx-auto pt-30 p-6">
                <p>{status}</p>
            </div>
        );
    }

    if (orders.length === 0) {
        return (
            <div className="max-w-xl mx-auto pt-30 p-6">
                <p>You have no orders yet.</p>
            </div>
        );
    }

    return (
        <div className="max-w-xl mx-auto pt-30 p-6">
            <h1 className="text-2xl font-bold mb-4">My Orders</h1>
            <div className="space-y-4">
                {orders.map((o) => (
                    <div key={o.id} className="p-4 border rounded-xl shadow-sm">
                        <p><strong>ID:</strong> {o.id}</p>
                        <p><strong>Items:</strong></p>
                        <ul className="list-disc ml-6">
                            {o.title
                                .replace("Cart:", "")       // remove Cart:
                                .split(",")                 // split items
                                .map(item => item.trim())   // trim whitespace
                                .map((item, i) => (
                                    <li key={i}>{item}</li>
                                ))}
                        </ul>
                        <p>
                            <strong>Amount:</strong>{" "}
                            {o.total_amount} {o.currency}
                        </p>
                        <p><strong>Status:</strong> {o.status}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

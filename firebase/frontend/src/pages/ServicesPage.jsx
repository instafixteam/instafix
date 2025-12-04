import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { authFetch } from "../utils/authFetch";

const API_BASE = import.meta?.env?.VITE_API_BASE || "http://localhost:5000";

export default function ServicesPage() {
  const [services, setServices] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [adding, setAdding] = useState(null); // service_id while adding
  const [cartCount, setCartCount] = useState(0);
  
  const navigate = useNavigate();

  // Fetch services (protected or public; using authFetch so it works either way)
  useEffect(() => {
    authFetch(`${API_BASE}/api/services`)
      .then((res) => {
        if (res.status === 401) navigate("/login");
        return res.json();
      })
      .then((data) => setServices(data || []))
      .catch(console.error);
  }, [navigate]);

  // Light cart badge
  useEffect(() => {
    authFetch(`${API_BASE}/api/cart`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((c) => setCartCount((c.items || []).reduce((s, i) => s + i.quantity, 0)))
      .catch(() => setCartCount(0));
  }, []);

  const handleAddToCart = async (serviceId) => {
    try {
      setAdding(serviceId);
      const res = await authFetch(`${API_BASE}/api/cart/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_id: serviceId, quantity: 1 }),
      });
      if (!res.ok) throw new Error("Failed to add to cart");

      // 🔔 notify navbar (and other listeners) to refresh its badge
      window.dispatchEvent(new CustomEvent("cart:updated"));

      // (Optional) also refresh local badge immediately
      const cart = await authFetch(`${API_BASE}/api/cart`).then((r) =>
        r.ok ? r.json() : { items: [] }
      );
      setCartCount((cart.items || []).reduce((s, i) => s + (i.quantity || 0), 0));
    } catch (e) {
      console.error(e);
      alert("Could not add to cart. Please try again.");
    } finally {
      setAdding(null);
    }
  };

  const categories = [...new Set(services.map((s) => s.category))];

  const categoryIcons = {
    Electrical: "⚡",
    Plumbing: "💧",
    Cleaning: "🧹",
    "Home Appliances": "🏠",
    Electronics: "💻",
    Default: "🛠️",
  };

  const filteredServices = services.filter((s) => s.category === selectedCategory);

  return (
    <div className="min-h-screen bg-gradient-to-br pt-30 from-gray-50 to-gray-100 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-bold text-indigo-700">Our Services</h1>
          <Link
            to="/cart"
            className="relative inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700"
          >
            🧺 Cart
            <span className="inline-flex items-center justify-center text-sm bg-white text-indigo-700 rounded-full w-6 h-6">
              {cartCount}
            </span>
          </Link>
        </div>

        {/* 1) Categories */}
        {!selectedCategory && (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <li
                key={category}
                onClick={() => setSelectedCategory(category)}
                className="cursor-pointer bg-gradient-to-br from-indigo-50 to-blue-100 hover:from-indigo-100 hover:to-blue-200
                          border border-indigo-200 rounded-2xl p-8 text-center shadow-sm hover:shadow-lg 
                          transition-all duration-300 transform hover:-translate-y-1"
              >
                <div className="text-5xl mb-3">
                  {categoryIcons[category] || categoryIcons.Default}
                </div>
                <h2 className="text-xl font-bold text-gray-800">{category}</h2>
              </li>
            ))}
          </ul>
        )}

        {/* 2) Services within a category */}
        {selectedCategory && (
          <div>
            <button
              onClick={() => setSelectedCategory(null)}
              className="mb-6 text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
            >
              ← Back to Categories
            </button>

            <h2 className="text-3xl font-semibold mb-6 text-center text-gray-800">
              {selectedCategory} Services
            </h2>

            <ul className="grid gap-6 sm:grid-cols-2">
              {filteredServices.map((service) => (
                <li
                  key={service._id}
                  className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md 
                            transition-transform transform hover:-translate-y-1 duration-300"
                >
                  <h3 className="font-bold text-lg text-indigo-700 mb-2">{service.name}</h3>
                  <p className="text-gray-600 mb-1">
                    <strong className="text-gray-800">Description:</strong> {service.description}
                  </p>
                  <p className="text-gray-600 mb-1">
                    <strong className="text-gray-800">Estimated Time:</strong>{" "}
                    {service.estimated_time}
                  </p>
                  <p className="text-gray-900 font-semibold text-lg mt-3">💰 {service.base_price} EGP</p>

                  <button
                    onClick={() => handleAddToCart(service._id)}
                    disabled={adding === service._id}
                    className="mt-4 w-full rounded-xl bg-indigo-600 text-white py-2 hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {adding === service._id ? "Adding..." : "Add to Cart"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

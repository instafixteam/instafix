// CartPage.jsx - COMPLETE FIX
import { useEffect, useState } from "react";
import { authFetch } from "../utils/authFetch";
import PaymentForm from "../components/PaymentForm";

const API_BASE = import.meta?.env?.VITE_API_BASE || "http://localhost:5000";

export default function CartPage() {
  const [cart, setCart] = useState({ items: [], total_amount: 0 });
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  
  // Single state object for checkout data
  const [checkoutData, setCheckoutData] = useState({
    clientSecret: null,
    orderId: null,
    amount: 0,
    currency: "egp",
    isActive: false
  });

  const load = async () => {
    setLoading(true);
    try {
      console.log('🛒 Loading cart...');
      const res = await authFetch(`${API_BASE}/api/cart`);
      
      if (res.status === 401) {
        console.error('Auth failed');
        window.location.href = '/login';
        return;
      }
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      
      const data = await res.json();
      console.log('📦 Cart data loaded:', data);
      setCart(data || { items: [], total_amount: 0 });
    } catch (error) {
      console.error('❌ Failed to load cart:', error);
      setCart({ items: [], total_amount: 0 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateQty = async (serviceId, quantity) => {
    if (quantity < 1) return;
    try {
      await authFetch(`${API_BASE}/api/cart/items/${serviceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      });
      load();
    } catch (error) {
      console.error('Failed to update quantity:', error);
    }
  };

  const removeItem = async (serviceId) => {
    try {
      await authFetch(`${API_BASE}/api/cart/items/${serviceId}`, {
        method: "DELETE",
      });
      load();
    } catch (error) {
      console.error('Failed to remove item:', error);
    }
  };

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    try {
      console.log('🚀 Starting checkout process...');
      const response = await authFetch(`${API_BASE}/api/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cart_checkout: true,
          currency: "egp"
        }),
      });

      console.log('📨 Checkout response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Checkout failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('✅ Checkout response data:', data);

      // VALIDATE ALL REQUIRED FIELDS
      if (!data.clientSecret) {
        throw new Error('No client secret received from server');
      }
      if (!data.orderId) {
        throw new Error('No order ID received from server');
      }

      setCheckoutData({
        clientSecret: data.clientSecret,
        orderId: data.orderId,
        amount: data.amount || cart.total_amount || 0,
        currency: data.currency || "egp",
        isActive: true
      });

      console.log('🎯 Checkout data set:', {
        clientSecret: data.clientSecret ? 'present' : 'missing',
        orderId: data.orderId,
        amount: data.amount
      });

    } catch (error) {
      console.error('❌ Checkout error:', error);
      alert('Checkout failed: ' + error.message);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handlePaymentSuccess = (paymentIntent) => {
    console.log('💳 Payment succeeded:', paymentIntent.id);
    // Reset checkout data
    setCheckoutData({
      clientSecret: null,
      orderId: null,
      amount: 0,
      currency: "egp",
      isActive: false
    });
    // Reload cart to show it's empty
    load();
  };

  const handleBackToCart = () => {
    setCheckoutData({
      clientSecret: null,
      orderId: null,
      amount: 0,
      currency: "egp",
      isActive: false
    });
  };

  if (loading) return <div className="p-8">Loading cart…</div>;

  // Show payment form if checkout is active AND we have all required data
  if (checkoutData.isActive && checkoutData.clientSecret && checkoutData.orderId) {
    console.log('🎨 Rendering PaymentForm with:', {
      hasClientSecret: !!checkoutData.clientSecret,
      hasOrderId: !!checkoutData.orderId,
      amount: checkoutData.amount
    });

    return (
      <div className="max-w-md mx-auto mt-10 p-4">
        <h1 className="text-2xl font-semibold mb-4 text-center">Complete Your Payment</h1>
        
        <PaymentForm
          clientSecret={checkoutData.clientSecret}
          orderId={checkoutData.orderId}
          amount={checkoutData.amount}
          currency={checkoutData.currency}
          onPaymentSuccess={handlePaymentSuccess}
        />
        
        <p className="text-sm text-gray-500 mt-4 text-center">
          Use test card: 4242 4242 4242 4242
        </p>
        
        <button
          onClick={handleBackToCart}
          className="mt-4 w-full px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded hover:bg-gray-50"
        >
          ← Back to Cart
        </button>
      </div>
    );
  }

  // Show cart contents
  return (
    <div className="max-w-3xl mx-auto p-8">
      <h1 className="text-3xl font-bold text-indigo-700 mb-6">Your Cart</h1>

      {cart.items.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600 text-lg mb-4">Your cart is empty</p>
          <a 
            href="/services" 
            className="inline-block px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Browse Services
          </a>
        </div>
      ) : (
        <>
          <ul className="space-y-4">
            {cart.items.map((it) => (
              <li
                key={it.service_id}
                className="flex items-center justify-between bg-white border rounded-xl p-4"
              >
                <div className="flex-1">
                  <div className="font-semibold text-indigo-700">{it.name}</div>
                  <div className="text-sm text-gray-600">
                    {typeof it.unit_price === 'number' ? it.unit_price.toFixed(2) : '0.00'} EGP each
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQty(it.service_id, it.quantity - 1)}
                      className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
                    >
                      −
                    </button>
                    <span className="w-8 text-center font-medium">{it.quantity}</span>
                    <button
                      onClick={() => updateQty(it.service_id, it.quantity + 1)}
                      className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={() => removeItem(it.service_id)}
                    className="ml-4 px-3 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 text-sm"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-8 p-6 bg-gray-50 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xl font-semibold">
                  Total: {typeof cart.total_amount === 'number' ? cart.total_amount.toFixed(2) : '0.00'} EGP
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {cart.items.length} item{cart.items.length !== 1 ? 's' : ''} in cart
                </div>
              </div>
              <button
                onClick={handleCheckout}
                disabled={checkoutLoading}
                className="px-8 py-3 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
              >
                {checkoutLoading ? (
                  <span className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Processing...
                  </span>
                ) : (
                  "Checkout"
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
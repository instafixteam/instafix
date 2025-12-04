// PaymentSuccess.jsx - UPDATED with email functionality
import { useMemo, useState, useEffect } from "react";
import { authFetch } from "../utils/authFetch";
import { Link } from "react-router-dom";

const API_BASE = import.meta?.env?.VITE_API_BASE || "http://localhost:5000";

export default function PaymentSuccess() {
  const qs = useMemo(() => new URLSearchParams(window.location.search), []);
  const orderId = qs.get("orderId");

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    console.log('PaymentSuccess - Order ID from URL:', orderId);

    if (orderId) {
      fetchOrder();
    } else {
      setError("No order ID provided");
      setLoading(false);
    }
  }, [orderId]);

  const fetchOrder = async () => {
    try {
      //console.log('Fetching order:', orderId);
      const response = await authFetch(`${API_BASE}/api/orders/${orderId}`);

      if (response.ok) {
        const data = await response.json();
        console.log('Order data received:', data);

        if (data.order) {
          // Verify the order is actually paid
          if (data.order.status !== 'paid' && data.order.status !== 'succeeded') {
            console.warn('Order is not paid! Status:', data.order.status);
            setError(`Order payment is still processing. Current status: ${data.order.status}`);
          } else {
            setOrder(data.order);
            // Send confirmation email when order is successfully loaded and paid
            sendConfirmationEmail(data.order);
          }
        } else {
          console.log('No order data found in response');
          setError("Order data not found");
        }
      } else {
        const errorText = await response.text();
        console.error('Failed to fetch order:', response.status, errorText);
        setError("Order not found or access denied");
      }
    } catch (err) {
      console.error('Error fetching order:', err);
      setError("Failed to load order details");
    } finally {
      setLoading(false);
    }
  };
  const sendConfirmationEmail = async (orderData) => {
    try {
      if (emailSent) {
        console.log('📧 Email already sent, skipping');
        return;
      }

      console.log('📧 Sending order confirmation email...');

      // DEBUG: Log the exact URL being called
      const emailEndpoint = `${API_BASE}/api/email/send-order-confirmation`;
      console.log('🔍 Calling email endpoint:', emailEndpoint);

      const response = await authFetch(emailEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: orderData.id,
        }),
      });

      console.log('📧 Email API response status:', response.status);

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Email send result:', result);
        setEmailSent(true);
      } else {
        const errorText = await response.text();
        console.warn('⚠️ Email API error:', response.status, errorText);
      }
    } catch (error) {
      console.warn('⚠️ Email send error:', error);
    }
  };

  const copyOrderId = async () => {
    if (!orderId) return;
    await navigator.clipboard.writeText(orderId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  if (loading) {
    return (
      <div className="max-w-lg mx-auto pt-30 mt-12 px-6 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p>Loading order details...</p>
        {orderId && <p className="text-sm text-gray-600 mt-2">Order: #{orderId}</p>}
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto pt-30 mt-12 px-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-yellow-800 mb-2">
            {error.includes('processing') ? 'Payment Processing' : 'Error'}
          </h2>
          <p className="text-yellow-700">{error}</p>
          {orderId && (
            <p className="mt-3 text-sm text-gray-600">
              Reference: #{orderId}
            </p>
          )}
          <div className="mt-4 flex gap-3">
            <button
              onClick={fetchOrder}
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 text-white px-4 py-2 hover:bg-blue-700"
            >
              Refresh Status
            </button>
            <a
              href="/orders"
              className="inline-flex items-center justify-center rounded-xl border px-4 py-2 hover:bg-gray-50"
            >
              View Orders
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto pt-30 mt-12 px-6">
      {/* Success badge */}
      <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
        <svg viewBox="0 0 24 24" className="w-10 h-10 text-green-600">
          <path
            fill="currentColor"
            d="M9.0 16.17l-3.88-3.88a1 1 0 10-1.41 1.41l4.59 4.59c.39.39 1.02.39 1.41 0l10-10a1 1 0 10-1.41-1.41L9.0 16.17z"
          />
        </svg>
      </div>

      <h1 className="text-3xl font-semibold text-center">Payment Successful 🎉</h1>
      <p className="text-center text-gray-600 mt-2">
        Thank you! Your payment was processed successfully.
        {emailSent && (
          <span className="block text-sm text-green-600 mt-1">
            A confirmation email has been sent to you.
          </span>
        )}
      </p>

      <div className="mt-6 rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Order</p>
              <p className="font-medium tracking-tight">#{order.id}</p>
            </div>
            <button
              onClick={copyOrderId}
              className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50"
            >
              {copied ? "Copied ✓" : "Copy ID"}
            </button>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <p className="text-sm text-gray-500">Amount</p>
            <p className="font-medium">
              {order.total_amount} {order.currency.toUpperCase()}
            </p>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <p className="text-sm text-gray-500">Status</p>
            <p className="font-medium text-green-600 capitalize">
              {order.status}
            </p>
          </div>

          <div className="pt-2">
            <p className="text-sm text-gray-500 font-medium">{order.title}</p>
            <p className="text-sm text-gray-500 mt-1">
              {emailSent
                ? "A receipt has been sent to your email."
                : "You will receive a confirmation email shortly."
              }
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link
          to="/orders"
          className="inline-flex items-center justify-center rounded-xl bg-black text-white px-4 py-2.5 hover:bg-gray-900"
        >
          View my orders
        </Link>
        <a
          href="/shop"
          className="inline-flex items-center justify-center rounded-xl border px-4 py-2.5 hover:bg-gray-50"
        >
          Continue shopping
        </a>
        <a
          href="/"
          className="inline-flex items-center justify-center rounded-xl border px-4 py-2.5 hover:bg-gray-50"
        >
          Go home
        </a>
      </div>

      <p className="text-xs text-center text-gray-400 mt-6">
        You can safely close this tab.
      </p>
    </div>
  );
}
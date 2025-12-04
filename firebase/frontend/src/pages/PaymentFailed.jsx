// PaymentFailed.jsx
import { useSearchParams, Link } from "react-router-dom";

export default function PaymentFailed() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("orderId");
  const status = searchParams.get("status");
  const reason = searchParams.get("reason");

  return (
    <div className="max-w-lg mx-auto mt-12 p-6">
      <div className="mx-auto w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
        <svg viewBox="0 0 24 24" className="w-10 h-10 text-red-600">
          <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </div>

      <h1 className="text-3xl font-semibold text-center text-red-700 mb-2">Payment Failed</h1>
      
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
        <p className="text-red-700 text-center">
          {reason === 'retrieve_error' && 'We encountered an issue verifying your payment.'}
          {status === 'requires_payment_method' && 'Your payment method was declined. Please try a different card.'}
          {!reason && !status && 'Your payment could not be processed. Please try again.'}
        </p>
        
        {orderId && (
          <p className="text-sm text-red-600 text-center mt-2">
            Order Reference: #{orderId}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <Link
          to="/cart"
          className="inline-flex items-center justify-center rounded-xl bg-blue-600 text-white px-4 py-2.5 hover:bg-blue-700"
        >
          ← Back to Cart
        </Link>
        <Link
          to="/orders"
          className="inline-flex items-center justify-center rounded-xl border border-gray-300 px-4 py-2.5 hover:bg-gray-50"
        >
          View Orders
        </Link>
        <Link
          to="/"
          className="inline-flex items-center justify-center rounded-xl border border-gray-300 px-4 py-2.5 hover:bg-gray-50"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
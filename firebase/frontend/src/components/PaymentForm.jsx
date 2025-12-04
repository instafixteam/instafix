// PaymentForm.jsx - SIMPLIFIED VERSION
import React, { useState } from "react";
import { PaymentElement, useStripe, useElements, Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = STRIPE_PUBLISHABLE_KEY ? loadStripe(STRIPE_PUBLISHABLE_KEY) : null;

// PaymentForm.jsx - UPDATED CheckoutForm component
function CheckoutForm({ 
  amount, 
  orderId, 
  clientSecret, 
  onPaymentSuccess,
  currency = "egp" 
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [message, setMessage] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [paymentStarted, setPaymentStarted] = useState(false);

  console.log('🔧 CheckoutForm props:', { 
    hasStripe: !!stripe, 
    hasElements: !!elements, 
    hasClientSecret: !!clientSecret,
    orderId, 
    amount 
  });

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) {
      setMessage("Payment system not ready. Please wait...");
      return;
    }

    setIsLoading(true);
    setPaymentStarted(true);
    setMessage(null);

    console.log('💰 Submitting payment for order:', orderId);

    // Set a timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      if (isLoading) {
        console.log('⏰ Payment timeout - checking status');
        setMessage("Payment taking longer than expected. Checking status...");
      }
    }, 10000); // 10 seconds

    try {
      const returnUrl = `${window.location.origin}/payment-return?orderId=${encodeURIComponent(orderId)}`;
      console.log('🔗 Return URL:', returnUrl);

      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: returnUrl,
        },
        redirect: 'if_required',
      });

      clearTimeout(timeoutId);

      if (error) {
        console.error('❌ Payment error:', error);
        
        // Handle specific error types
        if (error.type === 'card_error' || error.type === 'validation_error') {
          setMessage(error.message);
        } else if (error.type === 'invalid_request_error') {
          setMessage("Invalid payment request. Please try again.");
        } else {
          setMessage("Payment failed. Please try again.");
        }
        
        setIsLoading(false);
        setPaymentStarted(false);
        return;
      }

      // If we get here and no redirect happened, check payment status
      console.log('✅ Payment submitted without redirect - checking status');
      
      // Check payment status directly
      const { paymentIntent, error: statusError } = await stripe.retrievePaymentIntent(clientSecret);
      
      if (statusError) {
        console.error('Status check error:', statusError);
        setMessage("Unable to verify payment status. Please check your orders.");
      } else {
        console.log('💰 Payment Intent status:', paymentIntent.status);
        
        if (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing') {
          setMessage("Payment completed successfully! Redirecting...");
          setTimeout(() => {
            onPaymentSuccess?.(paymentIntent);
            window.location.href = `/payment-success?orderId=${orderId}`;
          }, 2000);
        } else {
          setMessage(`Payment status: ${paymentIntent.status}. Please wait or contact support.`);
        }
      }

      setIsLoading(false);
      
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('💥 Unexpected error:', error);
      setMessage("An unexpected error occurred. Please try again.");
      setIsLoading(false);
      setPaymentStarted(false);
    }
  };

  const formatAmount = (amount, currency) => {
    return `${currency.toUpperCase()} ${(amount || 0).toFixed(2)}`;
  };

  const handleCancel = () => {
    setIsLoading(false);
    setPaymentStarted(false);
    setMessage("Payment cancelled");
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg">
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <p className="text-xl font-bold text-center text-gray-800">
          {formatAmount(amount, currency)}
        </p>
        <p className="text-sm text-center text-gray-600 mt-1">
          Order: #{orderId}
        </p>
      </div>

      <form onSubmit={onSubmit}>
        <div className="mb-6">
          <PaymentElement 
            options={{ 
              layout: {
                type: 'tabs',
                defaultCollapsed: false
              }
            }} 
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isLoading || !stripe || !elements}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <span className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                Processing...
              </span>
            ) : (
              `Pay ${formatAmount(amount, currency)}`
            )}
          </button>

          {isLoading && (
            <button
              type="button"
              onClick={handleCancel}
              className="px-6 py-4 bg-gray-500 hover:bg-gray-600 text-white font-bold rounded-lg transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {message && (
        <div className={`mt-4 p-3 rounded-lg text-sm ${
          message.includes('success') 
            ? 'bg-green-50 border border-green-200 text-green-700'
            : message.includes('cancel') || message.includes('failed')
            ? 'bg-red-50 border border-red-200 text-red-700'
            : 'bg-blue-50 border border-blue-200 text-blue-700'
        }`}>
          {message}
        </div>
      )}

      <div className="mt-4 text-xs text-gray-500 text-center">
        Test: 4242 4242 4242 4242 • Any future date • Any CVC
      </div>
    </div>
  );
}

const PaymentForm = ({ 
  clientSecret,
  orderId,
  amount,
  currency = "egp",
  onPaymentSuccess 
}) => {
  console.log('🎯 PaymentForm received:', {
    clientSecret: clientSecret ? `present (${clientSecret.substring(0, 20)}...)` : 'missing',
    orderId: orderId || 'missing',
    amount: amount
  });

  if (!STRIPE_PUBLISHABLE_KEY) {
    return (
      <div className="p-4 text-center text-red-600 bg-red-50 rounded-lg">
        Stripe configuration missing.
      </div>
    );
  }

  if (!clientSecret || !orderId) {
    return (
      <div className="p-4 text-center text-yellow-600 bg-yellow-50 rounded-lg">
        <div className="font-semibold mb-2">Payment Form Not Ready</div>
        <div className="text-sm">
          {!clientSecret && "Missing payment details. "}
          {!orderId && "Missing order information."}
        </div>
      </div>
    );
  }

  return (
    <Elements 
      stripe={stripePromise}
      options={{ clientSecret }}
    >
      <CheckoutForm
        amount={amount}
        orderId={orderId}
        clientSecret={clientSecret}
        onPaymentSuccess={onPaymentSuccess}
        currency={currency}
      />
    </Elements>
  );
};

export default PaymentForm;
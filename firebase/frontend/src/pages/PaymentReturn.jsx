// PaymentReturn.jsx - IMPROVED VERSION
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Elements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = STRIPE_PUBLISHABLE_KEY ? loadStripe(STRIPE_PUBLISHABLE_KEY) : null;

function PaymentReturnInner() {
  const stripe = useStripe();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('checking');

  useEffect(() => {
    const handleRedirect = async () => {
      try {
        const orderId = searchParams.get("orderId");
        const paymentIntentClientSecret = searchParams.get("payment_intent_client_secret");
        const paymentIntentId = searchParams.get("payment_intent");
        const redirectStatus = searchParams.get("redirect_status");

        console.log('🔄 PaymentReturn - Processing:', {
          orderId,
          hasClientSecret: !!paymentIntentClientSecret,
          redirectStatus
        });

        // Clean URL immediately
        window.history.replaceState({}, '', window.location.pathname);

        if (redirectStatus === 'succeeded' && orderId) {
          console.log('✅ Redirect success with orderId');
          setStatus('success');
          setTimeout(() => {
            navigate(`/payment-success?orderId=${orderId}`, { replace: true });
          }, 1000);
          return;
        }

        if (paymentIntentClientSecret && stripe) {
          console.log('🔍 Checking payment intent status...');
          const { paymentIntent, error } = await stripe.retrievePaymentIntent(paymentIntentClientSecret);
          
          if (error) {
            console.error('❌ Error retrieving payment intent:', error);
            setStatus('failed');
            navigate(`/payment-failed?orderId=${orderId || ''}&reason=retrieve_error`, { replace: true });
            return;
          }

          console.log('💰 Payment Intent status:', paymentIntent.status);
          
          if (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing') {
            setStatus('success');
            setTimeout(() => {
              navigate(`/payment-success?orderId=${orderId || ''}`, { replace: true });
            }, 1000);
          } else {
            setStatus('failed');
            navigate(`/payment-failed?orderId=${orderId || ''}&status=${paymentIntent.status}`, { replace: true });
          }
        } else {
          console.log('⚠️ No client secret or Stripe - using orderId');
          if (orderId) {
            setStatus('success');
            setTimeout(() => {
              navigate(`/payment-success?orderId=${orderId}`, { replace: true });
            }, 1000);
          } else {
            setStatus('failed');
            navigate('/payment-failed', { replace: true });
          }
        }
      } catch (error) {
        console.error('💥 PaymentReturn error:', error);
        setStatus('failed');
        navigate('/payment-failed', { replace: true });
      }
    };

    handleRedirect();
  }, [stripe, navigate, searchParams]);

  return (
    <div className="max-w-md mx-auto mt-10 p-6 text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
      <p className="text-lg font-medium">
        {status === 'checking' && 'Finalizing payment...'}
        {status === 'success' && 'Payment successful! Redirecting...'}
        {status === 'failed' && 'Payment issue detected. Redirecting...'}
      </p>
      <p className="text-sm text-gray-600 mt-2">
        Please wait while we complete the transaction.
      </p>
    </div>
  );
}

export default function PaymentReturn() {
  if (!STRIPE_PUBLISHABLE_KEY) {
    return (
      <div className="max-w-md mx-auto mt-10 p-6 text-red-500 text-center">
        <p>Payment system configuration error.</p>
        <button 
          onClick={() => window.location.href = '/'}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
        >
          Go Home
        </button>
      </div>
    );
  }
  
  return (
    <Elements stripe={stripePromise}>
      <PaymentReturnInner />
    </Elements>
  );
}
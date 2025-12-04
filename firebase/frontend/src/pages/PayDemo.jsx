import React from "react";
import PaymentForm from "../components/PaymentForm";

export default function PayDemo() {
  return (
    <div className="max-w-md mx-auto mt-10">
      <h1 className="text-2xl font-semibold mb-4">Pay Demo ($25)</h1>
      <PaymentForm amount={25} onPaymentSuccess={() => console.log("Payment success!")} />
      <p className="text-sm text-gray-500 mt-3">Use test card 4242 4242 4242 4242, any future expiry, any CVC/ZIP.</p>
    </div>
  );
}

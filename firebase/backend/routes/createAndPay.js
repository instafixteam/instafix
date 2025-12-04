// routes/createAndPay.js
import Stripe from "stripe";
import Joi from "joi";
import pool from "../db.js"; // optional if you don't need DB here
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// If you already have Firebase auth middleware, make sure the route uses it.
const schema = Joi.object({
  title: Joi.string().min(1).max(120).required(),
  amount: Joi.number().precision(2).min(0.5).max(999999).required(), // dollars
  currency: Joi.string().valid("usd", "eur", "gbp").required(),
});

function dollarsToCents(d) {
  // avoid float drift
  return Math.round(Number(d) * 100);
}

// If you don't have a Stripe customer per user yet, this will still work (no customer)
async function ensureStripeCustomer(userUid) {
  // If you already store customer ids, call your own getter here.
  const customer = await stripe.customers.create({ metadata: { user_uid: userUid } });
  return customer.id;
}

export async function createAndPay(req, res) {
  // 1) Auth: req.user.uid should be set by your auth middleware
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ error: "Unauthorized" });

  // 2) Validate body sent from your frontend
  const { value, error } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) {
    return res.status(400).json({ error: "Invalid request", details: error.details.map(d => d.message) });
  }

  const { title, amount, currency } = value;

  // 3) Convert dollars → cents (server is source of truth)
  const amount_cents = dollarsToCents(amount);
  if (amount_cents < 50) {
    return res.status(400).json({ error: "Minimum amount is 50 cents" });
  }

  // 4) Optional: attach a Stripe Customer per user
  let customerId = undefined;
  try {
    customerId = await ensureStripeCustomer(uid);
  } catch {
    // It's OK to proceed without a customer; Stripe can still create a PI
  }

  // 5) Stripe idempotency: tie to (uid + title + amount_cents + currency)
  // This prevents dupes if the user double-clicks Pay with the same payload.
  // If/when you add an orders table, switch to `order-${orderId}-create_pi-v1`.
  const idemKey = `uid-${uid}__t-${encodeURIComponent(title)}__amt-${amount_cents}__cur-${currency}__v1`;

  try {
    const pi = await stripe.paymentIntents.create({
      amount: amount_cents,
      currency,
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      metadata: { title, user_uid: uid },
    }, { idempotencyKey: idemKey });

    return res.json({ clientSecret: pi.client_secret, pi_id: pi.id });
  } catch (e) {
    console.error("create-and-pay error:", e?.type || e?.name, e?.message);
    return res.status(502).json({ error: "Payment initialization failed" });
  }
}

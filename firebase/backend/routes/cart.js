// routes/cart.js
import express from "express";
import Joi from "joi";
import mongoose from "mongoose";
import ServiceCatalog from "../models/ServiceCatalog.js";
import { getUserCart, setUserCart } from "../utils/cartStorage.js";
import { authorizePermission } from "../middleware/AuthorizePermission.js";
import { verifyFirebaseToken } from "../middleware/verifyFirebaseToken.js";

const router = express.Router();

function toResponse(items) {
  const total_amount = items.reduce((s, it) => s + it.unit_price * it.quantity, 0);
  return { items, total_amount };
}

// routes/cart.js - Add auth debugging
router.get("/", verifyFirebaseToken, authorizePermission('cart', 'read'), async (req, res) => {
  try {
    //console.log('Cart GET - User:', req.user);
    if (!req.user || !req.user.uid) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const uid = req.user.uid;
    const raw = getUserCart(uid);
    //console.log('GET Cart for user:', uid, 'Raw cart:', raw);

    const ids = Object.keys(raw);
    if (ids.length === 0) return res.json({ items: [], total_amount: 0 });

    const svcDocs = await ServiceCatalog.find({ _id: { $in: ids.map(id => new mongoose.Types.ObjectId(id)) } });
    const byId = Object.fromEntries(svcDocs.map(d => [String(d._id), d]));

    const items = ids
      .filter(id => byId[id])
      .map(id => {
        const svc = byId[id];
        const unit_price = Number(svc.base_price);
        //console.log('Cart item:', { id, name: svc.name, price: svc.base_price, unit_price });
        return {
          service_id: id,
          name: svc.name,
          quantity: raw[id],
          unit_price,
        };
      });

    const response = toResponse(items);
    //console.log('Cart response:', response);
    res.json(response);
  } catch (error) {
    console.error('Cart GET error:', error);
    res.status(500).json({ error: "Failed to fetch cart" });
  }
});

// POST /api/cart/items  { service_id, quantity }
router.post("/items", verifyFirebaseToken, authorizePermission('cart', 'write'), async (req, res) => {
  const schema = Joi.object({
    service_id: Joi.string().required(),
    quantity: Joi.number().integer().min(1).default(1),
  });
  const { value, error } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) return res.status(400).json({ error: "Invalid payload", details: error.details.map(d => d.message) });

  const svc = await ServiceCatalog.findById(value.service_id);
  if (!svc) return res.status(404).json({ error: "Service not found" });

  const cart = getUserCart(req.user.uid);
  cart[value.service_id] = (cart[value.service_id] || 0) + value.quantity;
  setUserCart(req.user.uid, cart);

  return res.status(201).json({ ok: true });
});

// PATCH /api/cart/items/:serviceId  { quantity }
router.patch("/items/:serviceId", verifyFirebaseToken, authorizePermission('cart', 'update'), async (req, res) => {
  const { serviceId } = req.params;
  const schema = Joi.object({ quantity: Joi.number().integer().min(1).required() });
  const { value, error } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: "Invalid payload" });

  const cart = getUserCart(req.user.uid);
  if (!cart[serviceId]) return res.status(404).json({ error: "Item not in cart" });
  cart[serviceId] = value.quantity;
  setUserCart(req.user.uid, cart);

  return res.json({ ok: true });
});

// DELETE /api/cart/items/:serviceId
router.delete("/items/:serviceId", verifyFirebaseToken, authorizePermission('cart', 'delete'), async (req, res) => {
  const { serviceId } = req.params;
  const cart = getUserCart(req.user.uid);
  if (cart[serviceId]) {
    delete cart[serviceId];
    setUserCart(req.user.uid, cart);
  }
  return res.json({ ok: true });
});

// POST /api/cart/checkout → Creates order and returns Payment Intent
// POST /api/cart/checkout → Create Order row + PI (no internal fetch)
router.post("/checkout", verifyFirebaseToken, authorizePermission('orders', 'write'), async (req, res) => {
  try {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const raw = getUserCart(uid);
    const ids = Object.keys(raw);
    if (ids.length === 0) return res.status(400).json({ error: "Cart is empty" });

    // 1) Load services, compute total
    const svcDocs = await ServiceCatalog.find({
      _id: { $in: ids.map(id => new mongoose.Types.ObjectId(id)) },
    });

    const byId = Object.fromEntries(svcDocs.map(d => [String(d._id), d]));

    const total_amount = ids
      .filter(id => byId[id])
      .reduce((sum, id) => sum + (Number(byId[id].base_price) * Number(raw[id] || 0)), 0);

    const amount_cents = Math.round(total_amount * 100);
    if (!Number.isInteger(amount_cents) || amount_cents < 50) {
      return res.status(400).json({ error: "Cart total must be at least $0.50" });
    }

    const cartTitle = svcDocs
      .filter(doc => raw[String(doc._id)] > 0)
      .map(doc => `${doc.name} (x${raw[String(doc._id)]})`)
      .join(", ");

    const currencyNorm = String(process.env.STRIPE_CURRENCY || "usd").toLowerCase();

    // 2) Upsert Order row
    const request_id = `cart-${uid}-${Date.now()}`;
    const upsertSql = `
      INSERT INTO "Order"(user_uid, title, total_amount, currency, request_id, status, updated_at)
      VALUES ($1,$2,$3,$4,$5,'pending', NOW())
      ON CONFLICT (request_id) DO UPDATE
        SET title = EXCLUDED.title,
            total_amount = EXCLUDED.total_amount,
            currency = EXCLUDED.currency,
            updated_at = NOW()
      RETURNING id, payment_intent_id, currency, total_amount
    `;
    const { rows } = await pool.query(upsertSql, [uid, `Cart: ${cartTitle}`, total_amount, currencyNorm, request_id]);
    const order = rows[0];

    // 3) Reuse PI when safe
    if (order.payment_intent_id) {
      try {
        const pi = await stripe.paymentIntents.retrieve(order.payment_intent_id);
        const reusable = !["succeeded", "canceled", "requires_capture"].includes(pi.status);
        const sameAmount = pi.amount === amount_cents;
        const sameCurrency = pi.currency === currencyNorm;
        if (reusable && sameAmount && sameCurrency) {
          return res.json({ orderId: order.id, clientSecret: pi.client_secret, pi_id: pi.id });
        }
        try { await stripe.paymentIntents.cancel(order.payment_intent_id); } catch { }
      } catch { }
    }

    // 4) Ensure Stripe customer (swap in your own helper if you have one)
    const customer = await stripe.customers.create({ metadata: { firebase_uid: uid } });

    // 5) Create PI with identity (metadata) + idempotency
    const idemKey = `pay-${request_id}`;
    const pi = await stripe.paymentIntents.create({
      amount: amount_cents,
      currency: currencyNorm,
      customer: customer.id,
      automatic_payment_methods: { enabled: true },
      metadata: { order_id: String(order.id), user_uid: uid, request_id, source: "cart" },
    }, { idempotencyKey: idemKey });

    // 6) Persist PI on the Order
    await pool.query(
      `UPDATE "Order"
          SET payment_intent_id = $1,
              stripe_idem_key   = $2,
              currency          = $3,
              updated_at        = NOW()
        WHERE id = $4`,
      [pi.id, idemKey, currencyNorm, order.id]
    );

    // Optional: clear cart now or after webhook success
    carts.set(uid, {});

    return res.json({ orderId: order.id, clientSecret: pi.client_secret, pi_id: pi.id });
  } catch (e) {
    console.error("Cart checkout error:", e);
    return res.status(502).json({ error: "Checkout failed" });
  }
});
export default router;

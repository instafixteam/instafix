import express from "express";
import { verifyFirebaseToken } from "../middleware/verifyFirebaseToken.js";
import { getMyOrders } from "../controller/order.controller.js";
import { authorizePermission } from "../middleware/AuthorizePermission.js";
import { authorizeOwnership } from "../middleware/AuthorizeOwnership.js";
import pool from "../db.js";
import { logDataAccess } from "../logger.js";
const router = express.Router();

// GET /api/orders/me — get all orders for logged-in user
//router.get("/me",  getMyOrders);
//router.get("/me", verifyFirebaseToken, authorizePermission('orders', 'read'),  getMyOrders);

// TEMP: no verifyFirebaseToken, no permissions
router.get("/me", verifyFirebaseToken, authorizePermission("orders", "read"), getMyOrders);

// Secure order retrieval - users can only see their own orders
router.get("/:orderId", verifyFirebaseToken, authorizeOwnership("orders"), async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const order = req.order;
    const uid = req.user.uid;

    console.log("order recived: ", order);

    // const result = await pool.query(
    //   `SELECT id, user_uid, title, total_amount, currency, status, items, created_at, updated_at
    //    FROM "Order" 
    //    WHERE id = $1`,
    //   [orderId]
    // );


    logDataAccess("ORDER_READ_SINGLE", {
      actor: { uid },
      resource_type: "ORDER",
      resource_id: orderId,
    });

    res.json({ order: order });
  } catch (e) {
    console.error("[get-order] error:", e);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});


export default router;

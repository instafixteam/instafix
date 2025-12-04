// routes/emailRoutes.js
import express from "express";
import { sendOrderConfirmationEmail } from "../utils/emailService.js";
import pool from "../db.js";
import { verifyFirebaseToken } from "../middleware/verifyFirebaseToken.js";

const router = express.Router();

// Add express.json() middleware to this specific router
router.use(express.json());

// Email confirmation endpoint
router.post("/send-order-confirmation", verifyFirebaseToken, async (req, res) => {
  try {
    console.log('📧 Email route called with body:', req.body);
    
    const { orderId } = req.body;

    if (!orderId) {
      console.log('❌ No orderId provided in request body');
      return res.status(400).json({ error: "Order ID required" });
    }

    const uid = req.user.uid;
    console.log('📧 Processing email for order:', orderId, 'user:', uid);

    // Get order details
    const orderResult = await pool.query(
      `SELECT o.*, u.email 
       FROM "Order" o 
       JOIN "User" u ON o.user_uid = u.uid 
       WHERE o.id = $1 AND o.user_uid = $2`,
      [orderId, uid]
    );

    if (orderResult.rows.length === 0) {
      console.log('❌ Order not found:', orderId);
      return res.status(404).json({ error: "Order not found" });
    }

    const order = orderResult.rows[0];
    const userEmail = order.email;

    console.log('📧 Found order and email:', { orderId: order.id, userEmail });

    if (!userEmail) {
      console.log('❌ No email found for user:', uid);
      return res.status(400).json({ error: "User email not found" });
    }

    // Send confirmation email
    console.log('📧 Attempting to send email to:', userEmail);
    const emailResult = await sendOrderConfirmationEmail(userEmail, order);

    if (emailResult.success) {
      console.log('✅ Email sent successfully');
      res.json({ 
        success: true, 
        message: "Order confirmation email sent",
        messageId: emailResult.messageId
      });
    } else {
      console.log('❌ Email service failed:', emailResult.reason);
      res.status(500).json({ 
        success: false, 
        error: "Failed to send email",
        reason: emailResult.reason 
      });
    }

  } catch (error) {
    console.error("❌ Email confirmation error:", error);
    res.status(500).json({ error: "Failed to send confirmation email" });
  }
});

export default router;
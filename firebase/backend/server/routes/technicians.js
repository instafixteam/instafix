import express from "express";
import pool from "../../db.js"; // your PostgreSQL pool
import { authorizePermission } from "../../middleware/AuthorizePermission.js";
import { verifyFirebaseToken } from "../../middleware/verifyFirebaseToken.js";

const router = express.Router();

// GET all technicians
router.get("/technicians", verifyFirebaseToken, authorizePermission('technicians', 'read'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT uid, email, kyc_status AS "kycStatus", admin_approval AS "adminApproval"
      FROM technician
      ORDER BY created_at DESC
    `);
    res.json({ technicians: result.rows });
  } catch (err) {
    console.error("Error fetching technicians:", err);
    res.status(500).json({ error: "Failed to fetch technicians" });
  }
});

// APPROVE technician
router.post("/technicians/:uid/approve", verifyFirebaseToken, authorizePermission('technicians', 'update'), async (req, res) => {
  const { uid } = req.params;
  try {
    await pool.query(
      `UPDATE technician
       SET admin_approval = TRUE, updated_at = NOW()
       WHERE uid = $1`,
      [uid]
    );
    await pool.query(
      `UPDATE "User"
       SET role = 'technician' , updated_at = NOW()
       WHERE uid = $1`,
      [uid]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Approve error:", err);
    res.status(500).json({ error: "Failed to approve technician" });
  }
});

// REJECT technician
router.post("/technicians/:uid/reject", verifyFirebaseToken, authorizePermission('technicians', 'update'), async (req, res) => {
  const { uid } = req.params;
  try {
    await pool.query(
      `UPDATE technician
       SET admin_approval = FALSE, updated_at = NOW()
       WHERE uid = $1`,
      [uid]
    );
    await pool.query(
      `UPDATE "User"
       SET role = 'pending_technician' , updated_at = NOW()
       WHERE uid = $1`,
      [uid]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Reject error:", err);
    res.status(500).json({ error: "Failed to reject technician" });
  }
});

export default router;

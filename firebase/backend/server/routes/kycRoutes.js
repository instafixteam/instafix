// src/routes/kycRoutes.js
import express from "express";
import { createApplicant, createAccessToken, getApplicantStatus } from "../../api/kyc.js";
import pool from "../../db.js";
import admin from "firebase-admin";
import { authorizePermission } from "../../middleware/AuthorizePermission.js";
import { verifyFirebaseToken } from "../../middleware/verifyFirebaseToken.js";

const router = express.Router();

function parseSafeJson(str) {
  try {
    // Remove new lines and trim
    const cleaned = str.replace(/\n/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null; // not valid JSON
  }
}

// Create applicant + token
router.post("/start", verifyFirebaseToken, authorizePermission("technician_onboarding", "write"), async (req, res) => {
  try {
    const { uid, email } = req.user;
    let applicant = null;

    // 1. Create applicant in Sumsub
    try {
      applicant = await createApplicant({ externalUserId: uid, email });
    } catch (err) {
      const raw = err.message || "";

      // Try to parse JSON safely
      const errJson = parseSafeJson(raw);

      // Case 1 → JSON and "already exists"
      if (raw.includes("already exists")) {
        let existingId = null;

        if (errJson && errJson.description) {
          // Example: description: "Applicant already exists: 6917e2ebcf9..."
          const parts = errJson.description.split(":");
          existingId = parts[1] ? parts[1].trim() : null;
        }

        if (existingId) {
          console.log("Applicant already exists, using existing ID:", existingId);
          applicant = { id: existingId };
        }

        // If no ID found → throw original error
      }

    }
    //for debug only
    //const id = "69162e6525be328b806da5c7"


    // 2. Create access token for SDK
    const tokenData = await createAccessToken(uid);

    // 3. Save both in DB
    await pool.query(
      "UPDATE technician SET sumsub_applicant_id=$1, sumsub_token=$2, kyc_status=$3 WHERE uid=$4",
      [applicant.id, tokenData.token, "pending", uid]
    );

    res.json({ applicantId: applicant.id, token: tokenData.token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "KYC initialization failed" });
  }
});

// Get applicant status
router.get("/status", verifyFirebaseToken, authorizePermission("tech_status", "read"), async (req, res) => {
  try {
    const { uid } = req.
      user;
    const result = await pool.query(
      "SELECT sumsub_applicant_id, kyc_status FROM technician WHERE uid=$1",
      [uid]
    );

    const user = result.rows[0];
    if (!user?.sumsub_applicant_id)
      return res.json({ status: "not_started" });

    // Fetch latest status from Sumsub
    const currentStatus = await getApplicantStatus(user.sumsub_applicant_id);

    // Update local DB
    await pool.query(
      "UPDATE technician SET kyc_status=$1 WHERE uid=$2",
      [currentStatus, uid]
    );

    res.json({ status: currentStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch KYC status" });
  }
});

export default router;

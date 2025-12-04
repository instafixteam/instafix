// controllers/technician.controller.js
import pool from "../db.js";
import { techSignupApiSchema } from "../validations/technician.validation.js";
import { upsertTechnician } from "../models/technician.js";
import { upsertUser } from "../models/user.js";

export async function createTechnicianSignup(req, res) {
    // 1) Validate request body
    const { error, value } = techSignupApiSchema.validate(req.body, {
        abortEarly: false,
    });

    if (error) {
        const msg = error.details.map((d) => d.message).join(". ");
        return res.status(400).json({ error: msg });
    }

    const { name, phoneNumber, specialisation, desiredRole } = value;

    // 2) Firebase user from auth middleware
    const { uid, email } = req.user || {};
    if (!uid || !email) {
        return res.status(401).json({ error: "Unauthenticated" });
    }

    // We always default to not yet verified at signup
    const emailVerified = false;

    try {
        // 3) Upsert into User table
        await upsertUser(uid, email, {
            displayName: name,
            phoneNumber,
            emailVerified,
            role: "pending_technician",
        });

        // 4) Upsert into Technician table
        const technician = await upsertTechnician({
            uid,
            name,
            specialization: specialisation, // string name, FK to speciality(name)
            email,
            phone: phoneNumber,
        });

        return res.json({
            ok: true,
            technician_id: technician.id,
            message: "Technician profile initialized. Awaiting email verification.",
        });
    } catch (e) {
        console.error("createTechnicianSignup error:", e);
        return res
            .status(500)
            .json({ error: "Could not create technician profile." });
    }
}
// POST /api/technician/verify-email
export async function finalizeTechnicianEmailVerification(req, res) {
    try {
        console.log("[finalizeTechnicianEmailVerification] req.user =", req.user);

        const { uid } = req.user || {};  // decoded by your auth middleware

        if (!uid) {
            console.log("[finalizeTechnicianEmailVerification] No uid on req.user");
            return res.status(401).json({ error: "Unauthenticated" });
        }

        console.log("[finalizeTechnicianEmailVerification] uid =", uid);

        // 1) Fetch the real user from Firebase Admin
        const firebaseUser = await admin.auth().getUser(uid);

        const isVerified = firebaseUser.emailVerified;
        console.log("[finalizeTechnicianEmailVerification] Firebase emailVerified =", isVerified);

        if (!isVerified) {
            return res.status(400).json({
                error: "Email is not verified according to Firebase.",
            });
        }

        // 2) Update User table
        const userUpdate = await pool.query(
            `
            UPDATE "User"
            SET email_verified = true
            WHERE uid = $1
            `,
            [uid]
        );
        console.log(
            "[finalizeTechnicianEmailVerification] User update rowCount =",
            userUpdate.rowCount
        );

        // 3) Update technician table (optional)
        const techUpdate = await pool.query(
            `UPDATE "technician" SET updated_at = NOW() WHERE uid = $1`,
            [uid]
        );
        console.log(
            "[finalizeTechnicianEmailVerification] Technician update rowCount =",
            techUpdate.rowCount
        );

        return res.json({
            ok: true,
            verified: true,
            userUpdated: userUpdate.rowCount,
            techUpdated: techUpdate.rowCount,
        });
    } catch (err) {
        console.error("finalizeTechnicianEmailVerification error:", err);
        return res.status(500).json({ error: "Server error verifying email." });
    }
}

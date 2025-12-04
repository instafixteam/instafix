// src/models/technician.model.js
import pool from "../db.js";

/**
 * Inserts or updates a technician record.
 * @param {Object} techData - Technician data from the signup flow
 * @param {string} techData.uid - Firebase UID
 * @param {string} techData.name - Technician's name
 * @param {string[]} techData.services - Array of specialties/services
 * @param {string} techData.email - Email address
 * @param {boolean} techData.email_verified - Whether the email is verified
 * @param {string} techData.phone - Phone number
 * @param {string} [techData.role='technician_pending'] - Technician role
 * @returns {Promise<Object>} The inserted/updated technician row
 */


export async function upsertTechnician({
  uid,
  name,
  specialization,   // e.g. "Plumbing", must exist in speciality(name)
  email,
  phone
}) {
  const query = `
    INSERT INTO "technician" (
      uid,
      name,
      specialization,
      email,
      phone
    )
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (uid) DO UPDATE
      SET name           = EXCLUDED.name,
          specialization = EXCLUDED.specialization,
          email          = EXCLUDED.email,
          phone          = EXCLUDED.phone,
          updated_at     = NOW()
    RETURNING *;
  `;

  const values = [uid, name, specialization, email, phone];
  const { rows } = await pool.query(query, values);
  return rows[0];
}


/**
 * Retrieves a technician by UID.
 */
export async function getTechnicianByUid(uid) {
  const query = `SELECT * FROM "technician" WHERE uid = $1;`;
  const { rows } = await pool.query(query, [uid]);
  return rows[0] || null;
}


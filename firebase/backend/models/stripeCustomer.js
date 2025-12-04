import pool from "../db.js";
import { encrypt, decrypt } from "../encryption.js";

/**
 * Retrieves the decrypted Stripe Customer ID for a given user UID.
 * @param {string} userUid - The unique ID of the user.
 * @returns {Promise<string|null>} The decrypted Stripe Customer ID or null if not found.
 */
export async function getStripeCustomerId(userUid) {
    try {
        const result = await pool.query(
            `SELECT encrypted_customer_id FROM "StripeCustomer" WHERE user_uid = $1`,
            [userUid]
        );

        if (result.rows.length === 0) {
            return null;
        }

        const encryptedId = result.rows[0].encrypted_customer_id;
        return decrypt(encryptedId);
    } catch (error) {
        console.error("Error retrieving Stripe Customer ID:", error);
        throw error;
    }
}

/**
 * Creates or updates the encrypted Stripe Customer ID for a given user UID.
 * @param {string} userUid - The unique ID of the user.
 * @param {string} stripeCustomerId - The Stripe Customer ID (e.g., 'cus_XXXXXX').
 * @returns {Promise<void>}
 */
export async function upsertStripeCustomerId(userUid, stripeCustomerId) {
    try {
        const encryptedId = encrypt(stripeCustomerId);

        await pool.query(
            `INSERT INTO "StripeCustomer" (user_uid, encrypted_customer_id)
             VALUES ($1, $2)
             ON CONFLICT (user_uid) DO UPDATE
             SET encrypted_customer_id = $2, updated_at = NOW()`,
            [userUid, encryptedId]
        );
    } catch (error) {
        console.error("Error upserting Stripe Customer ID:", error);
        throw error;
    }
}

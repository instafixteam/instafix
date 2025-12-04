import pool from "../db.js";

// Fetch order including user_uid by order ID
export async function getOrderById(orderId) {

    const result = await pool.query(
        `SELECT id, user_uid, title, total_amount, currency, status, items, created_at, updated_at
           FROM "Order" 
           WHERE id = $1`,
        [orderId]
    );

    //const result = await pool.query(query, [orderId]);
    return result.rows[0];
}

export async function getOrdersByUserUid(uid) {
    const result = await pool.query(
        `
      SELECT *
      FROM "Order"
      WHERE user_uid = $1
      ORDER BY created_at DESC
    `,
        [uid]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({ error: "Order not found" });
    }

    return result.rows;
}
import { getOrdersByUserUid } from "../models/order.js";
import { logDataAccess } from "../logger.js";

export async function getMyOrders(req, res) {
    try {
        // TEMPORARY HARDCODE (replace after auth is working)
        const uid =
            req.user?.uid; // change this to your UID
        console.log("getMyOrders called for UID:", uid);

        const orders = await getOrdersByUserUid(uid);
        console.log(`Found ${orders.length} orders for user UID:`, uid);
        // logDataAccess("ORDER_LIST_READ", {  
        //     actor: { uid },
        //     resource_type: "ORDER",
        //     result_count: result.rows.length,
        // });

        return res.json({
            count: orders.length,
            orders,
        });
    } catch (err) {
        console.error("🔥 getMyOrders error:", err);
        return res.status(500).json({
            error: "Internal Server Error in getMyOrders",
            detail: err.message
        });
    }
}

// middleware/AuthorizeOwnership.js
import pool from "../db.js";
import { getOrderById } from "../models/order.js";

export function authorizeOwnership(resourceName) {
    return async (req, res, next) => {
        try {
            const authUid = req.user?.uid; // set by verifyFirebaseToken
            if (!authUid) return res.status(401).json({ message: "Unauthorized" });

            switch (resourceName) {
                case "profile_self": {
                    const targetUid = req.params.uid;

                    // HARD guard: only owner may proceed (no admin exceptions)
                    if (targetUid !== authUid) {
                        return res.status(403).json({ message: "Forbidden: not your profile" });
                    }

                    // Optional: ensure the profile exists
                    const { rows } = await pool.query(`SELECT uid FROM "User" WHERE uid = $1`, [authUid]);
                    if (rows.length === 0) {
                        return res.status(404).json({ message: "Profile not found" });
                    }

                    return next();
                }
                case "orders": {
                    //const { orderId } = req.params;
                    const orderNumber = req.params.orderId; // or req.params.id, depends on your route



                    // Fetch order by its ID
                    const order = await getOrderById(orderNumber);

                    if (!order) {
                        return res
                            .status(404)
                            .json({ message: "Order not found" });
                    }


                    const UIDAssociatedWithOrder = order.user_uid;

                    console.log(`Authorizing access to order ${orderNumber} for user UID:`, authUid);
                    console.log(`Order belongs to user UID:`, UIDAssociatedWithOrder);

                    // Check ownership
                    if (authUid != UIDAssociatedWithOrder) {
                        console.log(`Authorization failed: user UID ${authUid} does not own order ${orderNumber} (owned by UID ${UIDAssociatedWithOrder})`);
                        return res.status(403).json({
                            message:
                                "Forbidden: you are attempting to access an order that is not yours",
                        });
                    }

                    // Optionally attach order to req for controller to use
                    req.order = order;

                    console.log("req.order set to:", req.order);

                    return next();
                }

                default:
                    return next();
            }
        } catch (err) {
            console.error("authorizeOwnership error:", err);
            return res.status(500).json({ message: "Internal Server Error (ownership)" });
        }
    };
}

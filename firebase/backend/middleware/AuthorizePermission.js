// middleware/AuthorizePermission.js
import pool from "../db.js";

/**
 * Check if the authenticated user's role has the required permission
 * for a given resource and action.
 *
 * Usage: authorizePermission("profile_self", "read")
 */
export function authorizePermission(resourceName, action) {
    const VALID = new Set(["read", "write", "update", "delete"]);

    return async (req, res, next) => {
        try {
            const uid = req.user?.uid; // set by verifyFirebaseToken
            if (!uid) return res.status(401).json({ error: "Unauthorized: missing UID" });

            if (!resourceName || !action || !VALID.has(action)) {
                return res.status(400).json({ error: `Bad request: invalid resource/action (${resourceName}:${action})` });
            }

            // Single query with joins; adjust table/column names to your schema.
            // NOTE: you use "User" (capital U, quoted) elsewhere — keep it consistent.
            const { rows } = await pool.query(
                `
        SELECT
          u.role                              AS role_name,
          ar.name                              AS resource_name,
          p.can_read, p.can_write, p.can_update, p.can_delete
        FROM "User"            AS u
        JOIN "user_role"       AS r  ON r.name = u.role
        JOIN "app_resource"    AS ar ON ar.name = $1
        JOIN "permissions"     AS p  ON p.role_id = r.id AND p.resource_id = ar.id
        WHERE u.uid = $2
        LIMIT 1
        `,
                [resourceName, uid]
            );

            if (rows.length === 0) {
                // Either user missing, role not mapped, resource not defined, or no permission row
                return res.status(403).json({
                    error: `Permission denied or mapping missing for resource '${resourceName}'`,
                 });
            }

            const perm = rows[0];
            const allowed =
                (action === "read" && perm.can_read) ||
                (action === "write" && perm.can_write) ||
                (action === "update" && perm.can_update) ||
                (action === "delete" && perm.can_delete);

            if (!allowed) {
                // inside authorizePermission, before returning 403 on rows.length === 0
                console.warn("[RBAC] Missing mapping:",
                    { uid, resourceName, hint: "check User.role, user_role.name, app_resource.name, permissions row" }
                );

                return res.status(403).json({
                    error: `Permission denied: role '${perm.role_name}' has no '${action}' on '${perm.resource_name}'`,
                });
            }

            res.locals.roleName = perm.role_name;
            return next();
        } catch (err) {
            console.error("❌ Permission check error:", err);
            return res.status(500).json({ error: "Internal Server Error during permission check" });
        }
    };
}

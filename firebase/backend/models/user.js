// models/user.js
import pool from "../db.js";

/**
 * SIGNUP/ADMIN: Upsert and EXPLICITLY set role when provided.
 * If `role` is not provided, it will be preserved.
 */
export async function upsertUser(uid, email, fields = {}) {
    if (!uid) throw new Error("uid is required");

    const providerid = fields.providerID ?? fields.providerid ?? null;
    const displayname = fields.displayName ?? fields.displayname ?? null;
    const photourl = fields.photoURL ?? fields.photourl ?? null;
    const address = fields.address ?? null;
    const emailverified = fields.emailVerified ?? fields.emailverified ?? null;
    const phonenumber = fields.phoneNumber ?? fields.phonenumber ?? null;

    const hasRole = typeof fields.role === "string" && fields.role.length > 0;
    const sanitizedRole =
        fields.role === "technician" ? "technician" :
            fields.role === "admin" ? "admin" :
                fields.role === "customer" ? "customer" :
                    fields.role === "pending_technician" ? "pending_technician" :
                        null; // if unknown, treat as not provided

    // Build INSERT/UPDATE so that if role is NOT provided, we DO NOT write it at all.
    const cols = ['uid', 'email', '"providerid"', '"displayname"', '"photourl"', 'address', '"emailverified"', '"phonenumber"'];
    const vals = ['$1', '$2', '$3', '$4', '$5', '$6', '$7', '$8'];
    const updates = [
        'email = COALESCE(EXCLUDED.email, "User".email)',
        '"providerid" = COALESCE(EXCLUDED."providerid", "User"."providerid")',
        '"displayname" = COALESCE(EXCLUDED."displayname", "User"."displayname")',
        '"photourl" = COALESCE(EXCLUDED."photourl", "User"."photourl")',
        'address = COALESCE(EXCLUDED.address, "User".address)',
        '"emailverified" = COALESCE(EXCLUDED."emailverified", "User"."emailverified")',
        '"phonenumber" = COALESCE(EXCLUDED."phonenumber", "User"."phonenumber")',
        'updated_at = NOW()'
    ];

    const params = [
        uid,
        email ?? null,
        providerid,
        displayname,
        photourl,
        address,
        emailverified,
        phonenumber,
    ];

    if (hasRole && sanitizedRole) {
        // include role in the INSERT and allow it to overwrite on conflict
        cols.splice(2, 0, 'role');        // after email
        vals.splice(2, 0, '$9');
        params.push(sanitizedRole);
        updates.splice(1, 0, 'role = EXCLUDED.role'); // keep role in sync when explicitly provided
    }

    const sql = `
    INSERT INTO "User" (${cols.join(', ')}, created_at, updated_at)
    VALUES (${vals.join(', ')}, NOW(), NOW())
    ON CONFLICT (uid) DO UPDATE SET
      ${updates.join(', ')}
    RETURNING uid, email, role, "displayname" AS displayname, "photourl" AS photourl, address;
  `;

    // DEBUG
    console.log("[upsertUserWithOptionalRole] hasRole?", !!(hasRole && sanitizedRole), "role=", sanitizedRole);

    const { rows } = await pool.query(sql, params);
    return rows[0];
}

/**
 * LOGIN: Ensure user exists/refresh profile fields WITHOUT touching role.
 */
export async function ensureUserNoRoleChange(uid, email, fields = {}) {
    // Just call the function above WITHOUT role
    const clone = { ...fields };
    delete clone.role;
    return upsertUserWithOptionalRole(uid, email, clone);
}

export async function updateUserRole(uid, role) {
    const allowed = new Set(['technician_pending', 'technician', 'customer', 'admin']);
    if (!allowed.has(role)) throw new Error('invalid role');
    const { rows } = await pool.query(
        `UPDATE "User" SET role = $2, updated_at = NOW() WHERE uid = $1
     RETURNING uid, email, role;`,
        [uid, role]
    );
    return rows[0] ?? null;
}

export async function getUserByUid(uid) {
    const { rows } = await pool.query(`SELECT * FROM "User" WHERE uid = $1;`, [uid]);
    return rows[0] ?? null;
}

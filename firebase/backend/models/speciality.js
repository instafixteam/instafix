import pool from "../db.js";

// Get all specialities (for dropdown / listing)
export async function getAllSpecialities() {
    const { rows } = await pool.query(
        `SELECT id, name, description
     FROM speciality
     WHERE active = TRUE
     ORDER BY name;`
    );
    return rows; // e.g. [{id: 1, name: 'AC', ...}, ...]
}

// Get by name (e.g., 'Cleaning', 'AC', 'Plumbing')
export async function getSpecialityByName(name) {
    const { rows } = await pool.query(
        `SELECT id, name, description
     FROM speciality
     WHERE name = $1`,
        [name]
    );
    return rows[0] || null;
}

// Get by id (useful when you store an int FK in technician.specialization)
export async function getSpecialityById(id) {
    const { rows } = await pool.query(
        `SELECT id, name, description
     FROM speciality
     WHERE id = $1`,
        [id]
    );
    return rows[0] || null;
}

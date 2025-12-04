// controllers/speciality.controller.js
import { getAllSpecialities } from "../models/speciality.js";

export async function listSpecialities(req, res) {
    try {
        const specialities = await getAllSpecialities(); // returns rows from DB
        res.json(specialities);
    } catch (e) {
        console.error("listSpecialities error:", e);
        res.status(500).json({ error: "Could not load specialities" });
    }
}



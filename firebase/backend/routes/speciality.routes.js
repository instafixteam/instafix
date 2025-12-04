// routes/speciality.routes.js
import { Router } from "express";
import { listSpecialities } from "../controller/speciality.controller.js";


const router = Router();

// PUBLIC ROUTE – no login required
router.get("/specialities", listSpecialities);

export default router;

import { Router } from "express";
import { verifyFirebaseToken } from "../middleware/verifyFirebaseToken.js";
import { createTechnicianSignup, finalizeTechnicianEmailVerification } from "../controller/technician.controller.js";

const router = Router();

// POST /api/signup/technician
router.post("/signup/technician", verifyFirebaseToken, createTechnicianSignup);
router.post("/api/technician/verify-email", finalizeTechnicianEmailVerification);

export default router;

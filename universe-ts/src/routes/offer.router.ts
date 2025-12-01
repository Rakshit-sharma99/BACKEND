import { Router } from "express";
import {createOffer, getValidOffersForUser} from "../controllers/offer.controller";

const router = Router();
router.post("/offer", createOffer);
router.get("/valid", getValidOffersForUser);

module.exports = router;

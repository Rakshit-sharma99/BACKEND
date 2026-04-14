const { Router } = require("express");
const {
  createLayout,
  getSeatsStatus,
  getLayouts,
  getLayoutById,
} = require("../controllers/layoutController");

const router = Router();

router.post("/createLayout", createLayout);
router.get("/getSeatsStatus", getSeatsStatus);
router.get("/getLayouts", getLayouts);
router.get("/getLayoutById", getLayoutById);

module.exports = router;

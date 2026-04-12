const express = require("express");
const {
    createAccessCode,
    addUsersToAccessCode,
    verifyAccessCode,
    updateAccessCode
} = require("../controllers/accessControllers");
const router = express.Router();

router.post("/create", createAccessCode);
router.post("/add-users", addUsersToAccessCode);
router.get("/verify", verifyAccessCode);
router.put("/update", updateAccessCode);

module.exports = router;
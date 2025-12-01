const express = require("express");
const router = express.Router();

const {
  getUserFieldsById,
  insertNewFields,
  getUsersWithDynamicQuery,
  fetchBulkUsers,
} = require("../controllers/userControllers");

router.post("/getUserFieldsById", getUserFieldsById);
router.get("/insertNewFields", insertNewFields);
router.post("/getUsersWithDynamicQuery", getUsersWithDynamicQuery);
router.post("/fetchBulkUsers", fetchBulkUsers);

module.exports = router;

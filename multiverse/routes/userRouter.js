const express = require("express");
const router = express.Router();

const {
  getUserFieldsById,
  insertNewFields,
  getUsersWithDynamicQuery,
  fetchBulkUsers,
  getUsersByFields,
} = require("../controllers/userControllers");

router.post("/getUserFieldsById", getUserFieldsById);
router.get("/insertNewFields", insertNewFields);
router.post("/getUsersWithDynamicQuery", getUsersWithDynamicQuery);
router.post("/fetchBulkUsers", fetchBulkUsers);
router.post("/getUsersByFields", getUsersByFields);

module.exports = router;

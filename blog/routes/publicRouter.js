const express = require("express");
const router = express.Router();
const { getRecentBlogs } = require("../controllers/blogController");

router.get("/getRecentBlogs", getRecentBlogs);

module.exports = router;
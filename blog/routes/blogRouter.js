const express = require("express");
const router = express.Router();

const authenticate = require("../middlewares/authentication")
const { createBlog, getBlogs, getBlogBySlug, updateBlog, deleteBlog } = require("../controllers/blogController");

router.post("/createBlog",authenticate,createBlog);
router.get("/getBlogs",getBlogs);
router.get("/getBlogBySlug/:slug",getBlogBySlug);
router.put("/updateBlog/:id",authenticate,updateBlog);
router.delete("/deleteBlog/:id",authenticate,deleteBlog);

module.exports = router;
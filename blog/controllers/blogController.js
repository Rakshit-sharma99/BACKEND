const {StatusCodes} = require("http-status-codes");
const slugify = require('slugify');
const mongoose = require('mongoose');

const Blog = require("../models/blog");

const calculateReadingTime = (text) => {
  const wordsPerMinute = 150;
  const words = text.split(/\s+/).length;
  return Math.ceil(words / wordsPerMinute);
};

const createBlog = async (req, res) => {
  try {
    const { title, category, tags = [], excerpt, content, coverImage, author, seoMeta, isFeatured } = req.body;
    if (req.user.role !== 'admin') {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        message: 'You are unauthorized to access this route.'
      });
    }
    
    
    const sanitizedTitle = title.trim();
    const sanitizedCategory = category.trim();
    const sanitizedExcerpt = excerpt.trim();
    const sanitizedCoverImage = coverImage.trim();
    const sanitizedAuthor = {
        name: author.name.trim(),
        avatar: author.avatar?.trim() || ''
    };
    const sanitizedTags = Array.isArray(tags)
    ? [...new Set(tags.map(tag => tag.trim()))]
    : [];
    
    if (!sanitizedTitle || !sanitizedCategory || !sanitizedExcerpt || !content || !sanitizedCoverImage || !sanitizedAuthor?.name) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: 'Missing required fields. Required: title, category, excerpt, content, coverImage, author.name'
      });
    }
    const slug = slugify(sanitizedTitle, { lower: true, strict: true });
    const readingTime = calculateReadingTime(content);

    const existingBlog = await Blog.findOne({ slug });
    if (existingBlog) {
      return res.status(StatusCodes.CONFLICT).json({
        message: 'A blog with the same title already exists.'
      });
    }

    const newBlog = await Blog.create({
      title: sanitizedTitle,
      slug,
      category: sanitizedCategory,
      tags: sanitizedTags,
      excerpt: sanitizedExcerpt,
      content,
      coverImage: sanitizedCoverImage,
      author: sanitizedAuthor,
      seoMeta,
      isFeatured,
      readingTime
    });

    res.status(StatusCodes.CREATED).json({
      message: 'Blog created successfully',
      blog: newBlog
    });
  } catch (err) {
    console.error(err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Internal server error'
    });
  }
};

const getBlogs = async (req, res) => {
  try {
    let { category, tags, search, page = 1, limit = 10 } = req.query;

    page = parseInt(page, 10);
    limit = parseInt(limit, 10);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1 || limit > 100) limit = 10;

    const filter = {};

    if (category && typeof category === 'string') {
      filter.category = category.trim();
    }

    if (tags && typeof tags === 'string') {
      const tagArray = tags.split(',').map(tag => tag.trim()).filter(Boolean);
      if (tagArray.length > 0) {
        filter.tags = { $in: tagArray };
      }
    }

    if (search && typeof search === 'string') {
      if (search.length <= 100) { 
        filter.title = { $regex: search, $options: 'i' };
      }
    }

    const blogs = await Blog.find(filter)
      .sort({ publishedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.status(StatusCodes.OK).json(blogs);
  } catch (err) {
    console.error(err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Internal server error' });
  }
};

const getBlogBySlug = async (req, res) => {
  try {
    let { slug } = req.params;

    slug = slug.trim();

    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid slug format' });
    }

    const blog = await Blog.findOne({ slug });

    if (!blog) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Blog not found' });
    }

    res.status(StatusCodes.OK).json(blog);
  } catch (err) {
    console.error(err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Internal server error' });
  }
};

const updateBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if(req.user.role!=="admin"){
        return res.status(StatusCodes.UNAUTHORIZED).json({
            message:"You are unauthorized to access this route."
        })
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: 'Invalid blog ID.'
      });
    }

    if (updates.title) {
      updates.slug = slugify(updates.title, { lower: true, strict: true });
    }
    if (updates.content) {
      updates.readingTime = calculateReadingTime(updates.content);
    }

    const updatedBlog = await Blog.findByIdAndUpdate(id, updates, { new: true });

    if (!updatedBlog) return res.status(StatusCodes.NOT_FOUND).json({ message: 'Blog not found' });

    res.status(StatusCodes.OK).json({ message: 'Blog updated successfully', blog: updatedBlog });
  } catch (err) {
    console.error(err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Internal server error' });
  }
};

const deleteBlog = async (req, res) => {
  try {
    const { id } = req.params;

    if(req.user.role!=="admin"){
        return res.status(StatusCodes.UNAUTHORIZED).json({
            message:"You are unauthorized to access this route."
        })
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: 'Invalid blog ID.'
      });
    }

    const deleted = await Blog.findByIdAndDelete(id);

    if (!deleted) return res.status(StatusCodes.NOT_FOUND).json({ message: 'Blog not found' });

    res.status(StatusCodes.OK).json({ message: 'Blog deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Internal server error' });
  }
};

module.exports = {
    createBlog,
    getBlogs,
    getBlogBySlug,
    updateBlog,
    deleteBlog
}
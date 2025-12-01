// models/Blog.js
const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true
  },
  category: {
    type: String,
    required: true
  },
  tags: [{
    type: String
  }],
  excerpt: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  coverImage: {
    type: String,
    required: true
  },
  author: {
    name: { type: String, required: true },
    avatar: { type: String }
  },
  publishedAt: {
    type: Date,
    default: Date.now
  },
  readingTime: {
    type: Number
  },
  seoMeta: {
    title: String,
    description: String,
    keywords: [String],
    image: String
  },
  isFeatured: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

module.exports = mongoose.model('Blog', blogSchema);

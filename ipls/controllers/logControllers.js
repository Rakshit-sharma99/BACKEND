const Log = require("../models/log");

const createLog = async (req, res) => {
  try {
    const { c_source, d_source, c_ref, d_ref, description, ip, status } =
      req.body;

    // Validate required fields
    if (!c_source || !d_source || ip === undefined) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    // Create log entry
    const logEntry = new Log({
      c_source,
      d_source,
      c_ref,
      d_ref,
      description,
      ip,
      status,
    });

    // Save to database
    await logEntry.save();
    return res
      .status(201)
      .json({ message: "Log created successfully", log: logEntry });
  } catch (error) {
    console.error("Error creating log:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = { createLog };

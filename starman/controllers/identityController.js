/**
 * Identity Controller — Exposes identity endpoints from the Starman service.
 *
 * Proxies identity requests to the Knowledge Service and serves the static SOUL.
 * These endpoints give users transparency into what Starman knows about them
 * and let them customize Starman's persona.
 */

const axios = require("axios");
const jwt = require("jsonwebtoken");
const { soul, invalidateIdentityCache } = require("../identity/identityManager");

const KNOWLEDGE_URL =
  process.env.KNOWLEDGE_URL || "http://knowledge:7080/knowledge/api/v1";

function getInternalToken() {
  return jwt.sign(
    { role: "internal", service: "starman" },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "5m" },
  );
}

function internalHeaders() {
  return { Authorization: `Bearer ${getInternalToken()}` };
}

/**
 * GET /starman/api/v1/identity/me
 * Get the current user's full identity context.
 */
const getMyIdentity = async (req, res) => {
  try {
    const user = req.user;

    const profileRes = await axios.get(
      `${KNOWLEDGE_URL}/user/${user.id}/identity-context`,
      { headers: internalHeaders(), timeout: 3000 },
    );

    return res.status(200).json({
      success: true,
      identity: profileRes.data?.identity || null,
      found: profileRes.data?.found || false,
    });
  } catch (err) {
    console.error("[IdentityController] getMyIdentity error:", err.message);
    return res
      .status(500)
      .json({ success: false, error: "Could not fetch identity." });
  }
};

/**
 * PATCH /starman/api/v1/identity/starman
 * Update the user's Starman persona.
 * Body: { name?, creature?, vibe?, emoji?, formalityLevel?, humorLevel?, verbosityLevel? }
 */
const updateMyStarmanPersona = async (req, res) => {
  try {
    const user = req.user;

    const updateRes = await axios.patch(
      `${KNOWLEDGE_URL}/user/${user.id}/starman-persona`,
      req.body,
      { headers: internalHeaders(), timeout: 3000 },
    );

    // Invalidate the cached identity so next chat picks up the changes
    await invalidateIdentityCache(user.id);

    return res.status(200).json({
      success: true,
      starmanPersona: updateRes.data?.starmanPersona || null,
    });
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({
        success: false,
        error: "Answer some questions first to set up your identity!",
      });
    }
    console.error(
      "[IdentityController] updateMyStarmanPersona error:",
      err.message,
    );
    return res
      .status(500)
      .json({ success: false, error: "Could not update Starman persona." });
  }
};

/**
 * GET /starman/api/v1/identity/soul
 * Get the active SOUL (transparency endpoint).
 */
const getSoul = async (req, res) => {
  return res.status(200).json({
    success: true,
    soul,
  });
};

module.exports = {
  getMyIdentity,
  updateMyStarmanPersona,
  getSoul,
};

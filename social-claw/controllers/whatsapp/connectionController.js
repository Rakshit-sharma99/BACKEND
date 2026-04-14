/**
 * WhatsApp Connection Controller — handles connect/disconnect/status/QR.
 * All operations are scoped to the authenticated user via req.user.id.
 */

const registry = require("../../platforms/whatsapp/tenantRegistry");

/**
 * GET /whatsapp/status
 */
const getStatus = (req, res) => {
  const userId = req.user.id;
  const status = registry.getTenantStatus(userId);
  res.json(status);
};

/**
 * GET /whatsapp/qr
 */
const getQR = (req, res) => {
  const userId = req.user.id;
  const status = registry.getTenantStatus(userId);

  if (status.state === "open") {
    return res.json({ qr: null, state: "open", phone: status.phone });
  }

  const qr = registry.getTenantQR(userId);
  res.json({
    qr,
    state: status.state,
    phone: status.phone,
  });
};

/**
 * POST /whatsapp/connect
 */
const connect = async (req, res) => {
  try {
    const userId = req.user.id;
    const uid = req.user.uid;
    const status = await registry.connectTenant(userId, uid);
    res.json({ success: true, message: "Connection initiated", ...status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /whatsapp/logout
 */
const logout = async (req, res) => {
  try {
    const userId = req.user.id;
    const uid = req.user.uid;
    // Disconnect existing session to wipe credentials
    await registry.disconnectTenant(userId);
    // Immediately start a new session so the frontend QR begins generating
    const status = await registry.connectTenant(userId, uid);
    res.json({ success: true, message: "Logged out and ready for new session", ...status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /whatsapp/pairing-code
 * Body: { phoneNumber: "919876543210" }
 * Returns: { code: "ABCDEFGH" }
 */
const requestPairingCode = async (req, res) => {
  try {
    const userId = req.user.id;
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ error: "phoneNumber is required" });
    }
    const code = await registry.requestTenantPairingCode(userId, phoneNumber);
    res.json({ code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getStatus, getQR, connect, logout, requestPairingCode };

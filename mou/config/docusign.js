const docusign = require("docusign-esign");
const fs = require("fs");
const path = require("path");

let dsApiClient = null;
let tokenExpiresAt = 0;

/**
 * Get an authenticated DocuSign API client using JWT Grant.
 * Caches the token and only refreshes when expired.
 */
async function getDocuSignClient() {
  const now = Math.floor(Date.now() / 1000);

  if (dsApiClient && now < tokenExpiresAt - 60) {
    return dsApiClient;
  }

  dsApiClient = new docusign.ApiClient();
  dsApiClient.setBasePath(process.env.DOCUSIGN_BASE_URL + "/restapi");
  dsApiClient.setOAuthBasePath(
    process.env.DOCUSIGN_BASE_URL.includes("demo")
      ? "account-d.docusign.com"
      : "account.docusign.com",
  );

  // Read the RSA private key from the mounted key file
  const keyPath =
    process.env.DOCUSIGN_PRIVATE_KEY_PATH ||
    path.join(__dirname, "..", "keys", "docusign-private.key");
  const privateKey = fs.readFileSync(keyPath, "utf8");

  try {
    const results = await dsApiClient.requestJWTUserToken(
      process.env.DOCUSIGN_INTEGRATION_KEY,
      process.env.DOCUSIGN_USER_ID,
      ["signature", "impersonation"],
      Buffer.from(privateKey),
      3600, // 1 hour token lifetime
    );

    const accessToken = results.body.access_token;
    tokenExpiresAt = now + results.body.expires_in;

    dsApiClient.addDefaultHeader("Authorization", `Bearer ${accessToken}`);

    console.log("✅ DocuSign API client authenticated via JWT Grant");
    return dsApiClient;
  } catch (error) {
    if (error.response && error.response.data) {
      console.error("❌ DocuSign JWT Auth Error:", error.response.data);
    } else {
      console.error("❌ DocuSign JWT Auth Error:", error.message);
    }
    throw error;
  }
}

/**
 * Get an EnvelopesApi instance for envelope operations.
 */
async function getEnvelopesApi() {
  const client = await getDocuSignClient();
  return new docusign.EnvelopesApi(client);
}

/**
 * Create an envelope from the MOU template with pre-filled tabs.
 *
 * @param {object} params
 * @param {string} params.signerEmail - Creator's email
 * @param {string} params.signerName - Creator's full name
 * @param {string} params.clientUserId - Unique ID for embedded signing (use creator's MongoDB _id)
 * @param {object} params.tabValues - Key-value pairs for template tab pre-fill
 * @returns {string} envelopeId
 */
async function createEnvelope({
  signerEmail,
  signerName,
  clientUserId,
  tabValues,
}) {
  const envelopesApi = await getEnvelopesApi();
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID;

  console.log("🔍 [DocuSign] createEnvelope called with:");
  console.log("   signerEmail:", signerEmail);
  console.log("   signerName:", signerName);
  console.log("   clientUserId:", clientUserId);
  console.log("   tabValues:", JSON.stringify(tabValues, null, 2));

  // Build text tabs for club_representative
  const clubRepTextTabs = [
    { tabLabel: "opted_plan", value: tabValues.opted_plan || " " },
    {
      tabLabel: "organizer_designation",
      value: tabValues.organizer_designation || " ",
    },
    { tabLabel: "event_name", value: tabValues.event_name || "" },
    { tabLabel: "club_name", value: tabValues.club_name || "" },
    {
      tabLabel: "macbease_name",
      value: process.env.MACBEASE_SIGNATORY_NAME || "Macbease",
    },
    {
      tabLabel: "macbease_designation",
      value:
        process.env.MACBEASE_SIGNATORY_DESIGNATION || "Platform Administrator",
    },
  ]
    .filter((t) => t.value.trim() !== "")
    .map((t) => ({ ...t, locked: "true" }));

  // Build number tabs for club_representative
  const clubRepNumberTabs = [
    {
      tabLabel: "commission_rate",
      value: String(tabValues.commission_rate || ""),
    },
    { tabLabel: "platform_fee", value: String(tabValues.platform_fee || "") },
  ]
    .filter((t) => t.value.trim() !== "")
    .map((t) => ({ ...t, locked: "true" }));

  console.log(
    "🔍 [DocuSign] clubRepTextTabs:",
    JSON.stringify(clubRepTextTabs, null, 2),
  );
  console.log(
    "🔍 [DocuSign] clubRepNumberTabs:",
    JSON.stringify(clubRepNumberTabs, null, 2),
  );

  const envelopeDefinition = {
    templateId: process.env.DOCUSIGN_TEMPLATE_ID,
    templateRoles: [
      {
        email: signerEmail,
        name: signerName,
        roleName: "club_representative",
        clientUserId,
        tabs: {
          textTabs: clubRepTextTabs.length > 0 ? clubRepTextTabs : undefined,
          numberTabs:
            clubRepNumberTabs.length > 0 ? clubRepNumberTabs : undefined,
        },
      },
      {
        email: process.env.MACBEASE_ADMIN_EMAIL || "support@macbease.com",
        name: "Macbease",
        roleName: "macbease_admin",
      },
    ],
    status: "sent",
  };

  console.log(
    "🔍 [DocuSign] Full envelopeDefinition:",
    JSON.stringify(envelopeDefinition, null, 2),
  );

  const result = await envelopesApi.createEnvelope(accountId, {
    envelopeDefinition,
  });

  console.log(`📄 DocuSign envelope created: ${result.envelopeId}`);
  return result.envelopeId;
}

/**
 * Generate an embedded signing URL (recipient view) for the creator.
 *
 * @param {string} envelopeId
 * @param {object} params
 * @param {string} params.signerEmail
 * @param {string} params.signerName
 * @param {string} params.clientUserId
 * @param {string} params.returnUrl - Deep link URL after signing
 * @returns {string} signingUrl
 */
async function getSigningUrl(
  envelopeId,
  { signerEmail, signerName, clientUserId, returnUrl },
) {
  const envelopesApi = await getEnvelopesApi();
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID;

  const recipientViewRequest = {
    returnUrl,
    authenticationMethod: "none",
    email: signerEmail,
    userName: signerName,
    clientUserId,
  };

  try {
    const result = await envelopesApi.createRecipientView(
      accountId,
      envelopeId,
      {
        recipientViewRequest,
      },
    );
    return result.url;
  } catch (err) {
    console.error(
      "❌ [DocuSign] Failed to get signing URL:",
      err.response
        ? JSON.stringify(err.response.data || err.response.body)
        : err.message,
    );
    throw err;
  }
}

/**
 * Download the completed (signed) envelope document as a PDF buffer.
 *
 * @param {string} envelopeId
 * @returns {Buffer} PDF document buffer
 */
async function getSignedDocument(envelopeId) {
  const envelopesApi = await getEnvelopesApi();
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID;

  // "combined" merges all documents into a single PDF
  const documentBuffer = await envelopesApi.getDocument(
    accountId,
    envelopeId,
    "combined",
  );

  return documentBuffer;
}

/**
 * Void (cancel) an envelope.
 *
 * @param {string} envelopeId
 * @param {string} voidedReason
 */
async function voidEnvelope(envelopeId, voidedReason) {
  const envelopesApi = await getEnvelopesApi();
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID;

  await envelopesApi.update(accountId, envelopeId, {
    envelope: {
      status: "voided",
      voidedReason: voidedReason || "Voided by admin",
    },
  });

  console.log(`🚫 DocuSign envelope voided: ${envelopeId}`);
}

module.exports = {
  getDocuSignClient,
  createEnvelope,
  getSigningUrl,
  getSignedDocument,
  voidEnvelope,
};

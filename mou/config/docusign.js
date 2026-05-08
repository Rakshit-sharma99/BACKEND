const docusign = require("docusign-esign");

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
      : "account.docusign.com"
  );

  // Decode the RSA private key from base64 env var (handles newlines in Docker)
  const privateKey = process.env.DOCUSIGN_PRIVATE_KEY.replace(/\\n/g, "\n");

  const results = await dsApiClient.requestJWTUserToken(
    process.env.DOCUSIGN_INTEGRATION_KEY,
    process.env.DOCUSIGN_USER_ID,
    ["signature", "impersonation"],
    Buffer.from(privateKey),
    3600 // 1 hour token lifetime
  );

  const accessToken = results.body.access_token;
  tokenExpiresAt = now + results.body.expires_in;

  dsApiClient.addDefaultHeader("Authorization", `Bearer ${accessToken}`);

  console.log("✅ DocuSign API client authenticated via JWT Grant");
  return dsApiClient;
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
async function createEnvelope({ signerEmail, signerName, clientUserId, tabValues }) {
  const envelopesApi = await getEnvelopesApi();
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID;

  // Build text tabs from tabValues
  const textTabs = Object.entries(tabValues).map(([tabLabel, value]) => ({
    tabLabel,
    value: String(value),
  }));

  const envelopeDefinition = {
    templateId: process.env.DOCUSIGN_TEMPLATE_ID,
    templateRoles: [
      {
        email: signerEmail,
        name: signerName,
        roleName: "Signer", // must match the role name in the DocuSign template
        clientUserId, // enables embedded signing
        tabs: {
          textTabs,
        },
      },
    ],
    status: "sent", // "sent" = immediately available for signing
  };

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
async function getSigningUrl(envelopeId, { signerEmail, signerName, clientUserId, returnUrl }) {
  const envelopesApi = await getEnvelopesApi();
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID;

  const recipientViewRequest = {
    returnUrl,
    authenticationMethod: "none",
    email: signerEmail,
    userName: signerName,
    clientUserId,
  };

  const result = await envelopesApi.createRecipientView(accountId, envelopeId, {
    recipientViewRequest,
  });

  return result.url;
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
    "combined"
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

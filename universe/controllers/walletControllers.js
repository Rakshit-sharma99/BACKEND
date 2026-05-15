const crypto = require("crypto");
const mongoose = require("mongoose");
const { StatusCodes } = require("http-status-codes");
const Club = require("../models/club");
const { fetchAwardById } = require("./interServiceCalls");
const Wallet = require("../models/wallet");
const WalletTransaction = require("../models/walletTransaction");
const WithdrawalRequest = require("../models/withdrawalRequest");

// ─── Constants ─────────────────────────────────────────────────

const MIN_WITHDRAWAL_PAISE = 50000;
const WITHDRAWAL_COOLDOWN_DAYS = 7;
const PURCHASE_CATEGORIES = new Set(["BADGE", "E_CERTIFICATE"]);

// ─── Helpers ───────────────────────────────────────────────────

function assertObjectId(value, label) {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return { valid: false, message: `Invalid ${label}.` };
  }
  return { valid: true };
}

function maskAccountNumber(accountNumber) {
  const cleaned = String(accountNumber).replace(/\s+/g, "");
  const visible = cleaned.slice(-4);
  return `${"*".repeat(Math.max(0, cleaned.length - 4))}${visible}`;
}

function getBankEncryptionKey() {
  const rawKey = process.env.WALLET_BANK_ENCRYPTION_KEY;

  if (!rawKey) {
    return null;
  }

  try {
    const base64Decoded = Buffer.from(rawKey, "base64");
    if (base64Decoded.length === 32) {
      return base64Decoded;
    }
  } catch (error) {
    // ignore and try utf8 fallback
  }

  const utf8Key = Buffer.from(rawKey, "utf8");
  if (utf8Key.length === 32) {
    return utf8Key;
  }

  return crypto.createHash("sha256").update(rawKey).digest();
}

function encryptBankPayload(payload) {
  const key = getBankEncryptionKey();
  if (!key) return null;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    content: encrypted.toString("base64"),
  });
}

function buildCreatedBy(actor) {
  if (!actor) return {};

  return {
    id: actor.id || null,
    role: actor.role || null,
    service: actor.service || null,
  };
}

function getActor(req) {
  if (req.internalService) {
    return {
      service: req.internalService,
      role: "internal",
    };
  }
  return req.user;
}

async function getOrCreateWallet(clubId, session = null) {
  const options = {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  };

  if (session) {
    options.session = session;
  }

  return Wallet.findOneAndUpdate(
    { clubId },
    { $setOnInsert: { clubId } },
    options,
  );
}

function isClubAdmin(club, actorId) {
  return (
    club?.mainAdmin?.toString() === actorId ||
    (club?.adminId || []).some((adminId) => adminId.toString() === actorId)
  );
}

function canDispatchAwards(club, actorId) {
  return (club?.permissions?.whoCanDispatchAwards || []).includes(actorId);
}

function normalizeTransaction(transaction) {
  if (!transaction) return null;

  return {
    _id: transaction._id,
    walletId: transaction.walletId,
    clubId: transaction.clubId,
    direction: transaction.direction,
    category: transaction.category,
    entryKind: transaction.entryKind,
    amountPaise: transaction.amountPaise,
    currency: transaction.currency,
    sourceType: transaction.sourceType,
    sourceId: transaction.sourceId,
    razorpayPaymentId: transaction.razorpayPaymentId,
    relatedEntityId: transaction.relatedEntityId,
    metadata: transaction.metadata || {},
    pricingSnapshot: transaction.pricingSnapshot || {},
    createdBy: transaction.createdBy || {},
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
  };
}

// ─── Controllers ───────────────────────────────────────────────

const getWallet = async (req, res) => {
  try {
    const { clubId } = req.params;
    const actor = getActor(req);

    const idCheck = assertObjectId(clubId, "clubId");
    if (!idCheck.valid) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ success: false, message: idCheck.message });
    }

    const club = await Club.findById(clubId, {
      adminId: 1,
      mainAdmin: 1,
      permissions: 1,
      name: 1,
    });
    if (!club) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ success: false, message: "Club not found." });
    }

    if (!actor || !actor.id) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ success: false, message: "You are not authorized to access this wallet." });
    }

    const hasWalletAccess =
      actor.role === "admin" ||
      isClubAdmin(club, actor.id) ||
      club.permissions?.whoCanAccessWallet?.includes(actor.id);

    if (!hasWalletAccess) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ success: false, message: "You are not authorized for this wallet action." });
    }

    const wallet = await getOrCreateWallet(clubId);

    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        walletId: wallet._id,
        clubId: wallet.clubId,
        clubName: club.name,
        currency: wallet.currency,
        availableBalancePaise: wallet.availableBalancePaise,
        lockedBalancePaise: wallet.lockedBalancePaise,
        bankAccount: {
          accountHolderName: wallet.bankAccount?.accountHolderName || null,
          maskedAccountNumber: wallet.bankAccount?.maskedAccountNumber || null,
          ifscCode: wallet.bankAccount?.ifscCode || null,
          lastUpdatedAt: wallet.bankAccount?.lastUpdatedAt || null,
        },
        permissions: {
          canView: true,
          canPurchase: actor.role === "admin" || canDispatchAwards(club, actor.id),
          canWithdraw:
            actor.role === "admin" ||
            club.mainAdmin?.toString() === actor.id ||
            club.permissions?.whoCanAccessWallet?.includes(actor.id),
          canManageBank:
            actor.role === "admin" ||
            club.mainAdmin?.toString() === actor.id ||
            club.permissions?.whoCanAccessWallet?.includes(actor.id),
        },
      },
    });
  } catch (error) {
    console.error("getWallet error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong while processing the wallet request.",
    });
  }
};

const getWalletTransactions = async (req, res) => {
  try {
    const { clubId } = req.params;
    const actor = getActor(req);

    const idCheck = assertObjectId(clubId, "clubId");
    if (!idCheck.valid) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ success: false, message: idCheck.message });
    }

    const club = await Club.findById(clubId, {
      adminId: 1,
      mainAdmin: 1,
      permissions: 1,
    });
    if (!club) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ success: false, message: "Club not found." });
    }

    if (!actor || !actor.id) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ success: false, message: "You are not authorized to access this wallet." });
    }

    const hasWalletAccess =
      actor.role === "admin" ||
      isClubAdmin(club, actor.id) ||
      club.permissions?.whoCanAccessWallet?.includes(actor.id);

    if (!hasWalletAccess) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ success: false, message: "You are not authorized for this wallet action." });
    }

    const wallet = await getOrCreateWallet(clubId);
    const safePage = Math.max(Number(req.query.page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const skip = (safePage - 1) * safeLimit;
    const view = req.query.view || "raw";

    if (view === "summary") {
      const rows = await WalletTransaction.aggregate([
        { $match: { walletId: wallet._id } },
        {
          $group: {
            _id: {
              category: "$category",
              direction: "$direction",
              entryKind: "$entryKind",
              relatedEntityId: "$relatedEntityId",
              label: "$metadata.label",
            },
            amountPaise: { $sum: "$amountPaise" },
            count: { $sum: 1 },
            latestCreatedAt: { $max: "$createdAt" },
          },
        },
        { $sort: { latestCreatedAt: -1 } },
        { $skip: skip },
        { $limit: safeLimit },
      ]);

      return res.status(StatusCodes.OK).json({
        success: true,
        data: {
          page: safePage,
          limit: safeLimit,
          view,
          items: rows.map((row) => ({
            category: row._id.category,
            direction: row._id.direction,
            entryKind: row._id.entryKind,
            relatedEntityId: row._id.relatedEntityId,
            label: row._id.label || null,
            amountPaise: row.amountPaise,
            count: row.count,
            latestCreatedAt: row.latestCreatedAt,
          })),
        },
      });
    }

    const transactions = await WalletTransaction.find({ walletId: wallet._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean();

    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        page: safePage,
        limit: safeLimit,
        view,
        items: transactions.map(normalizeTransaction),
      },
    });
  } catch (error) {
    console.error("getWalletTransactions error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong while processing the wallet request.",
    });
  }
};

const patchBankAccount = async (req, res) => {
  try {
    const { clubId } = req.params;
    const actor = getActor(req);

    const idCheck = assertObjectId(clubId, "clubId");
    if (!idCheck.valid) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ success: false, message: idCheck.message });
    }

    const club = await Club.findById(clubId, {
      adminId: 1,
      mainAdmin: 1,
      permissions: 1,
    });
    if (!club) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ success: false, message: "Club not found." });
    }

    if (!actor || !actor.id) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ success: false, message: "You are not authorized to access this wallet." });
    }

    const hasWalletAccess =
      actor.role === "admin" ||
      club.mainAdmin?.toString() === actor.id ||
      club.permissions?.whoCanAccessWallet?.includes(actor.id);

    if (!hasWalletAccess) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ success: false, message: "You are not authorized for this wallet action." });
    }

    const cleanName = String(req.body.accountHolderName || "").trim();
    const cleanNumber = String(req.body.accountNumber || "").replace(/\s+/g, "");
    const cleanIfsc = String(req.body.ifscCode || "").trim().toUpperCase();

    if (!cleanName || !cleanNumber || !cleanIfsc) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "accountHolderName, accountNumber, and ifscCode are required.",
      });
    }

    if (!/^\d{9,18}$/.test(cleanNumber)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Account number must be between 9 and 18 digits.",
      });
    }

    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid IFSC code format.",
      });
    }

    const encryptedPayload = encryptBankPayload({
      accountHolderName: cleanName,
      accountNumber: cleanNumber,
      ifscCode: cleanIfsc,
    });

    if (!encryptedPayload) {
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Wallet bank encryption key is not configured on the server.",
      });
    }

    const wallet = await getOrCreateWallet(clubId);
    wallet.bankAccount = {
      accountHolderName: cleanName,
      maskedAccountNumber: maskAccountNumber(cleanNumber),
      ifscCode: cleanIfsc,
      encryptedPayload,
      lastUpdatedBy: actor.id,
      lastUpdatedAt: new Date(),
    };
    await wallet.save();

    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        clubId,
        bankAccount: {
          accountHolderName: wallet.bankAccount.accountHolderName,
          maskedAccountNumber: wallet.bankAccount.maskedAccountNumber,
          ifscCode: wallet.bankAccount.ifscCode,
          lastUpdatedAt: wallet.bankAccount.lastUpdatedAt,
        },
      },
    });
  } catch (error) {
    console.error("patchBankAccount error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong while processing the wallet request.",
    });
  }
};

const purchaseFromWallet = async (req, res) => {
  try {
    const { clubId } = req.params;
    const actor = getActor(req);

    const idCheck = assertObjectId(clubId, "clubId");
    if (!idCheck.valid) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ success: false, message: idCheck.message });
    }

    const club = await Club.findById(clubId, {
      adminId: 1,
      mainAdmin: 1,
      permissions: 1,
      name: 1,
      awards: 1,
    });
    if (!club) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ success: false, message: "Club not found." });
    }

    if (!actor || !actor.id) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ success: false, message: "You are not authorized to access this wallet." });
    }

    if (actor.role !== "admin" && !canDispatchAwards(club, actor.id)) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ success: false, message: "You are not authorized for this wallet action." });
    }

    const { category, awardId, count } = req.body;
    const idempotencyKey = req.body.idempotencyKey || req.headers["x-idempotency-key"];

    if (!idempotencyKey || typeof idempotencyKey !== "string") {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "idempotencyKey is required for wallet purchases.",
      });
    }

    if (!PURCHASE_CATEGORIES.has(category)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Only BADGE and E_CERTIFICATE purchases are supported.",
      });
    }

    const awardIdCheck = assertObjectId(awardId, "awardId");
    if (!awardIdCheck.valid) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ success: false, message: awardIdCheck.message });
    }

    const purchaseCount = Number(count);
    if (!Number.isInteger(purchaseCount) || purchaseCount <= 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "count must be a positive integer.",
      });
    }

    // Idempotency check
    const existingTransaction = await WalletTransaction.findOne({ idempotencyKey });
    if (existingTransaction) {
      const wallet = await getOrCreateWallet(clubId);
      return res.status(StatusCodes.OK).json({
        success: true,
        data: {
          walletId: wallet._id,
          clubId,
          availableBalancePaise: wallet.availableBalancePaise,
          lockedBalancePaise: wallet.lockedBalancePaise,
          transaction: normalizeTransaction(existingTransaction),
          reused: true,
        },
      });
    }

    // Transactional purchase
    const session = await mongoose.startSession();
    let responsePayload = null;

    try {
      await session.withTransaction(async () => {
        // Fetch award data from award service (read-only validation, outside transaction scope)
        const award = await fetchAwardById(awardId, ["type", "price", "title"]);
        if (!award) {
          throw new Error("Award not found.");
        }

        const expectedCategory = award.type === "badge" ? "BADGE" : "E_CERTIFICATE";
        if (expectedCategory !== category) {
          throw new Error(`Award type does not match purchase category ${category}.`);
        }

        const totalAmountPaise = Math.round(Number(award.price) * 100) * purchaseCount;
        if (totalAmountPaise <= 0) {
          throw new Error("Calculated wallet purchase amount is invalid.");
        }

        const wallet = await getOrCreateWallet(clubId, session);
        const updatedWallet = await Wallet.findOneAndUpdate(
          {
            _id: wallet._id,
            availableBalancePaise: { $gte: totalAmountPaise },
          },
          {
            $inc: {
              availableBalancePaise: -totalAmountPaise,
            },
          },
          {
            new: true,
            session,
          },
        );

        if (!updatedWallet) {
          throw new Error("Insufficient wallet balance.");
        }

        const transactionalClub = await Club.findById(clubId).session(session);
        if (!transactionalClub) {
          throw new Error("Club not found.");
        }

        const existingAward = transactionalClub.awards.find(
          (entry) => entry.awardId.toString() === awardId,
        );

        if (existingAward) {
          existingAward.count += purchaseCount;
        } else {
          transactionalClub.awards.push({
            awardId,
            count: purchaseCount,
          });
        }

        await transactionalClub.save({ session });

        const [transaction] = await WalletTransaction.create(
          [
            {
              walletId: updatedWallet._id,
              clubId,
              direction: "DEBIT",
              category,
              entryKind: "PURCHASE_DEBIT",
              amountPaise: totalAmountPaise,
              currency: "INR",
              sourceType: "INTERNAL_PURCHASE",
              sourceId: awardId,
              idempotencyKey,
              relatedEntityId: awardId,
              metadata: {
                label: `Wallet purchase for ${award.title}`,
                awardTitle: award.title,
                purchaseCount,
                clubName: club.name,
              },
              createdBy: buildCreatedBy(actor),
            },
          ],
          { session },
        );

        responsePayload = {
          walletId: updatedWallet._id,
          clubId,
          availableBalancePaise: updatedWallet.availableBalancePaise,
          lockedBalancePaise: updatedWallet.lockedBalancePaise,
          transaction: normalizeTransaction(transaction),
          reused: false,
        };
      });
    } finally {
      await session.endSession();
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      data: responsePayload,
    });
  } catch (error) {
    console.error("purchaseFromWallet error:", error);

    if (
      error.message === "Award not found." ||
      error.message === "Club not found."
    ) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ success: false, message: error.message });
    }
    if (error.message === "Insufficient wallet balance.") {
      return res
        .status(StatusCodes.CONFLICT)
        .json({ success: false, message: error.message });
    }
    if (error.message.includes("does not match") || error.message.includes("invalid")) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ success: false, message: error.message });
    }

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong while processing the wallet request.",
    });
  }
};

const createWithdrawal = async (req, res) => {
  try {
    const { clubId } = req.params;
    const actor = getActor(req);

    const idCheck = assertObjectId(clubId, "clubId");
    if (!idCheck.valid) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ success: false, message: idCheck.message });
    }

    const club = await Club.findById(clubId, {
      adminId: 1,
      mainAdmin: 1,
      permissions: 1,
    });
    if (!club) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ success: false, message: "Club not found." });
    }

    if (!actor || !actor.id) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ success: false, message: "You are not authorized to access this wallet." });
    }

    const hasWalletAccess =
      actor.role === "admin" ||
      club.mainAdmin?.toString() === actor.id ||
      club.permissions?.whoCanAccessWallet?.includes(actor.id);

    if (!hasWalletAccess) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ success: false, message: "You are not authorized for this wallet action." });
    }

    const idempotencyKey = req.body.idempotencyKey || req.headers["x-idempotency-key"];
    const note = req.body.note;

    if (!idempotencyKey || typeof idempotencyKey !== "string") {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "idempotencyKey is required for withdrawals.",
      });
    }

    const safeAmount = Number(req.body.amountPaise);
    if (!Number.isInteger(safeAmount) || safeAmount < MIN_WITHDRAWAL_PAISE) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: `Minimum withdrawal amount is ${MIN_WITHDRAWAL_PAISE} paise.`,
      });
    }

    // Idempotency check
    const existingRequest = await WithdrawalRequest.findOne({ idempotencyKey });
    if (existingRequest) {
      const wallet = await getOrCreateWallet(clubId);
      return res.status(StatusCodes.OK).json({
        success: true,
        data: {
          requestId: existingRequest._id,
          clubId,
          walletId: wallet._id,
          availableBalancePaise: wallet.availableBalancePaise,
          lockedBalancePaise: wallet.lockedBalancePaise,
          status: existingRequest.status,
          amountPaise: existingRequest.amountPaise,
          currency: existingRequest.currency,
          createdAt: existingRequest.createdAt,
        },
      });
    }

    // Transactional withdrawal
    const session = await mongoose.startSession();
    let withdrawalResult = null;

    try {
      await session.withTransaction(async () => {
        const wallet = await getOrCreateWallet(clubId, session);

        if (!wallet.bankAccount?.encryptedPayload) {
          throw new Error(
            "Bank account details must be configured before requesting withdrawals.",
          );
        }

        const cooldownCutoff = new Date(
          Date.now() - WITHDRAWAL_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
        );

        if (
          wallet.lastWithdrawalRequestedAt &&
          wallet.lastWithdrawalRequestedAt > cooldownCutoff
        ) {
          throw new Error(
            `Only one withdrawal can be requested every ${WITHDRAWAL_COOLDOWN_DAYS} days.`,
          );
        }

        const updatedWallet = await Wallet.findOneAndUpdate(
          {
            _id: wallet._id,
            availableBalancePaise: { $gte: safeAmount },
          },
          {
            $inc: {
              availableBalancePaise: -safeAmount,
              lockedBalancePaise: safeAmount,
            },
            $set: {
              lastWithdrawalRequestedAt: new Date(),
            },
          },
          {
            new: true,
            session,
          },
        );

        if (!updatedWallet) {
          throw new Error("Insufficient wallet balance.");
        }

        const [request] = await WithdrawalRequest.create(
          [
            {
              walletId: updatedWallet._id,
              clubId,
              amountPaise: safeAmount,
              currency: updatedWallet.currency,
              status: "PENDING",
              idempotencyKey,
              requestedBy: buildCreatedBy(actor),
              bankSnapshot: {
                accountHolderName: updatedWallet.bankAccount.accountHolderName,
                maskedAccountNumber: updatedWallet.bankAccount.maskedAccountNumber,
                ifscCode: updatedWallet.bankAccount.ifscCode,
              },
              note: typeof note === "string" ? note.trim() : "",
            },
          ],
          { session },
        );

        await WalletTransaction.create(
          [
            {
              walletId: updatedWallet._id,
              clubId,
              direction: "DEBIT",
              category: "WITHDRAWAL",
              entryKind: "WITHDRAWAL_LOCK",
              amountPaise: safeAmount,
              currency: updatedWallet.currency,
              sourceType: "WITHDRAWAL_REQUEST",
              sourceId: request._id.toString(),
              idempotencyKey: `withdraw_lock_${request._id}`,
              relatedEntityId: request._id.toString(),
              metadata: {
                label: "Withdrawal requested",
                requestStatus: request.status,
              },
              createdBy: buildCreatedBy(actor),
            },
          ],
          { session },
        );

        withdrawalResult = {
          requestId: request._id,
          clubId,
          walletId: updatedWallet._id,
          availableBalancePaise: updatedWallet.availableBalancePaise,
          lockedBalancePaise: updatedWallet.lockedBalancePaise,
          status: request.status,
          amountPaise: request.amountPaise,
          currency: request.currency,
          createdAt: request.createdAt,
        };
      });
    } finally {
      await session.endSession();
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      data: withdrawalResult,
    });
  } catch (error) {
    console.error("createWithdrawal error:", error);

    if (error.message.includes("Bank account")) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ success: false, message: error.message });
    }
    if (error.message.includes("Insufficient")) {
      return res
        .status(StatusCodes.CONFLICT)
        .json({ success: false, message: error.message });
    }
    if (error.message.includes("Only one withdrawal")) {
      return res
        .status(StatusCodes.CONFLICT)
        .json({ success: false, message: error.message });
    }

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong while processing the wallet request.",
    });
  }
};

const getWithdrawals = async (req, res) => {
  try {
    const { clubId } = req.params;
    const actor = getActor(req);

    const idCheck = assertObjectId(clubId, "clubId");
    if (!idCheck.valid) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ success: false, message: idCheck.message });
    }

    const club = await Club.findById(clubId, {
      adminId: 1,
      mainAdmin: 1,
      permissions: 1,
    });
    if (!club) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ success: false, message: "Club not found." });
    }

    if (!actor || !actor.id) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ success: false, message: "You are not authorized to access this wallet." });
    }

    const hasWalletAccess =
      actor.role === "admin" ||
      isClubAdmin(club, actor.id) ||
      club.permissions?.whoCanAccessWallet?.includes(actor.id);

    if (!hasWalletAccess) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ success: false, message: "You are not authorized for this wallet action." });
    }

    const safePage = Math.max(Number(req.query.page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);

    const items = await WithdrawalRequest.find({ clubId })
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean();

    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        page: safePage,
        limit: safeLimit,
        items,
      },
    });
  } catch (error) {
    console.error("getWithdrawals error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong while processing the wallet request.",
    });
  }
};

const resolveWalletWithdrawal = async (req, res) => {
  try {
    const { withdrawalRequestId } = req.params;
    const actor = getActor(req);

    if (!actor || (!actor.id && !actor.service)) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ success: false, message: "You are not authorized to resolve withdrawals." });
    }

    const canResolve =
      actor.role === "admin" || actor.role === "internal" || !!actor.service;

    if (!canResolve) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ success: false, message: "You are not authorized to resolve withdrawals." });
    }

    const idCheck = assertObjectId(withdrawalRequestId, "withdrawalRequestId");
    if (!idCheck.valid) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ success: false, message: idCheck.message });
    }

    const normalizedAction = String(req.body.action || "").trim().toUpperCase();
    if (!["COMPLETE", "FAIL", "CANCEL"].includes(normalizedAction)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "action must be COMPLETE, FAIL, or CANCEL.",
      });
    }

    const session = await mongoose.startSession();
    let result = null;

    try {
      await session.withTransaction(async () => {
        const request = await WithdrawalRequest.findById(withdrawalRequestId).session(
          session,
        );

        if (!request) {
          throw new Error("Withdrawal request not found.");
        }

        if (request.status !== "PENDING") {
          throw new Error("Only pending withdrawals can be resolved.");
        }

        const wallet = await Wallet.findById(request.walletId).session(session);
        if (!wallet) {
          throw new Error("Wallet not found.");
        }

        let walletUpdate = null;
        let entryKind = "WITHDRAWAL_SETTLEMENT";
        let metadataLabel = "Withdrawal completed";
        let nextStatus = "COMPLETED";
        let direction = "DEBIT";

        if (normalizedAction === "COMPLETE") {
          if (wallet.lockedBalancePaise < request.amountPaise) {
            throw new Error("Locked wallet balance is inconsistent.");
          }

          walletUpdate = {
            $inc: {
              lockedBalancePaise: -request.amountPaise,
            },
          };
        } else {
          if (wallet.lockedBalancePaise < request.amountPaise) {
            throw new Error("Locked wallet balance is inconsistent.");
          }

          walletUpdate = {
            $inc: {
              lockedBalancePaise: -request.amountPaise,
              availableBalancePaise: request.amountPaise,
            },
          };
          entryKind = "WITHDRAWAL_RELEASE";
          metadataLabel =
            normalizedAction === "FAIL"
              ? "Withdrawal failed and funds released"
              : "Withdrawal cancelled and funds released";
          nextStatus = normalizedAction === "FAIL" ? "FAILED" : "CANCELLED";
          direction = "CREDIT";
        }

        const updatedWallet = await Wallet.findByIdAndUpdate(wallet._id, walletUpdate, {
          new: true,
          session,
        });

        const { payoutReference, failureReason } = req.body;

        request.status = nextStatus;
        request.payoutReference =
          typeof payoutReference === "string" ? payoutReference.trim() : null;
        request.failureReason =
          typeof failureReason === "string" ? failureReason.trim() : null;
        request.resolvedAt = new Date();
        request.resolvedBy = buildCreatedBy(actor);
        await request.save({ session });

        await WalletTransaction.create(
          [
            {
              walletId: updatedWallet._id,
              clubId: request.clubId,
              direction,
              category: "WITHDRAWAL",
              entryKind,
              amountPaise: request.amountPaise,
              currency: request.currency,
              sourceType: "WITHDRAWAL_REQUEST",
              sourceId: request._id.toString(),
              idempotencyKey: `withdraw_resolve_${request._id}_${nextStatus}`,
              relatedEntityId: request._id.toString(),
              metadata: {
                label: metadataLabel,
                payoutReference: request.payoutReference,
                failureReason: request.failureReason,
              },
              createdBy: buildCreatedBy(actor),
            },
          ],
          { session },
        );

        result = {
          requestId: request._id,
          clubId: request.clubId,
          status: request.status,
          availableBalancePaise: updatedWallet.availableBalancePaise,
          lockedBalancePaise: updatedWallet.lockedBalancePaise,
        };
      });
    } finally {
      await session.endSession();
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("resolveWalletWithdrawal error:", error);

    if (error.message === "Withdrawal request not found." || error.message === "Wallet not found.") {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ success: false, message: error.message });
    }
    if (
      error.message === "Only pending withdrawals can be resolved." ||
      error.message === "Locked wallet balance is inconsistent."
    ) {
      return res
        .status(StatusCodes.CONFLICT)
        .json({ success: false, message: error.message });
    }

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong while processing the wallet request.",
    });
  }
};

module.exports = {
  getWallet,
  getWalletTransactions,
  patchBankAccount,
  purchaseFromWallet,
  createWithdrawal,
  getWithdrawals,
  resolveWalletWithdrawal,
};

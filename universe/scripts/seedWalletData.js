/**
 * Seed script to populate mock wallet data for a specific club.
 *
 * Usage:
 *   node scripts/seedWalletData.js <clubId>
 *
 * Example:
 *   node scripts/seedWalletData.js 6654a1b2c3d4e5f678901234
 *
 * This script:
 *  1. Creates (or resets) a Wallet for the given club with a healthy balance.
 *  2. Inserts a variety of WalletTransaction records spanning multiple
 *     categories, directions, and entry kinds so you can test every UI state.
 *  3. Inserts one PENDING and one COMPLETED WithdrawalRequest.
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const mongoose = require("mongoose");
const connectDB = require("../db/connect");
const Wallet = require("../models/wallet");
const WalletTransaction = require("../models/walletTransaction");
const WithdrawalRequest = require("../models/withdrawalRequest");
const Club = require("../models/club");

// ─── Config ────────────────────────────────────────────────────
const MOCK_ACTOR_ID = new mongoose.Types.ObjectId();
const NOW = new Date();

function daysAgo(n) {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
}

function hoursAgo(n) {
  return new Date(NOW.getTime() - n * 60 * 60 * 1000);
}

function uid() {
  return new mongoose.Types.ObjectId().toString();
}

// ─── Mock transactions generator ───────────────────────────────

function buildTransactions(walletId, clubId) {
  const eventId1 = new mongoose.Types.ObjectId().toString();
  const eventId2 = new mongoose.Types.ObjectId().toString();
  const badgeAwardId = new mongoose.Types.ObjectId().toString();
  const certAwardId = new mongoose.Types.ObjectId().toString();

  const txns = [
    // ── TICKET_SALE credits (simulating multiple purchases for 2 events) ──
    ...Array.from({ length: 8 }, (_, i) => ({
      walletId,
      clubId,
      direction: "CREDIT",
      category: "TICKET_SALE",
      entryKind: "CREDIT_APPLIED",
      amountPaise: 25000 + i * 500, // ₹250 – ₹285 range
      currency: "INR",
      sourceType: "RAZORPAY_PAYMENT",
      sourceId: `pay_mock_ticket_${uid()}_${i}`,
      relatedEntityId: i < 5 ? eventId1 : eventId2,
      idempotencyKey: `idem_ticket_${uid()}`,
      metadata: {
        label: i < 5 ? "Ticket Sale – Summer Fest 2026" : "Ticket Sale – Tech Meetup",
        buyerName: `User ${i + 1}`,
      },
      pricingSnapshot: {
        grossAmountPaise: 30000 + i * 500,
        platformFeePaise: 5000,
        netAmountPaise: 25000 + i * 500,
        platformFeePercent: 15,
      },
      createdBy: { service: "ticket-service", role: "internal" },
      createdAt: daysAgo(30 - i),
      updatedAt: daysAgo(30 - i),
    })),

    // ── MERCHANDISE credit ──
    {
      walletId,
      clubId,
      direction: "CREDIT",
      category: "MERCHANDISE",
      entryKind: "CREDIT_APPLIED",
      amountPaise: 75000, // ₹750
      currency: "INR",
      sourceType: "RAZORPAY_PAYMENT",
      sourceId: `pay_mock_merch_${uid()}`,
      relatedEntityId: uid(),
      idempotencyKey: `idem_merch_${uid()}`,
      metadata: { label: "Merchandise – Club T-Shirt Bundle", quantity: 5 },
      pricingSnapshot: {
        grossAmountPaise: 85000,
        platformFeePaise: 10000,
        netAmountPaise: 75000,
        platformFeePercent: 12,
      },
      createdBy: { service: "merch-service", role: "internal" },
      createdAt: daysAgo(18),
      updatedAt: daysAgo(18),
    },

    // ── AD_REVENUE credit ──
    {
      walletId,
      clubId,
      direction: "CREDIT",
      category: "AD_REVENUE",
      entryKind: "CREDIT_APPLIED",
      amountPaise: 120000, // ₹1,200
      currency: "INR",
      sourceType: "SYSTEM",
      sourceId: "ad_cycle_mar_2026",
      relatedEntityId: null,
      idempotencyKey: `idem_ad_${uid()}`,
      metadata: { label: "Ad Revenue – March 2026 cycle", impressions: 45200 },
      createdBy: { service: "ad-engine", role: "internal" },
      createdAt: daysAgo(10),
      updatedAt: daysAgo(10),
    },

    // ── BADGE purchase (debit) ──
    {
      walletId,
      clubId,
      direction: "DEBIT",
      category: "BADGE",
      entryKind: "PURCHASE_DEBIT",
      amountPaise: 15000, // ₹150
      currency: "INR",
      sourceType: "INTERNAL_PURCHASE",
      sourceId: badgeAwardId,
      relatedEntityId: badgeAwardId,
      idempotencyKey: `idem_badge_${uid()}`,
      metadata: { label: "Wallet purchase for Gold Star Badge", awardTitle: "Gold Star Badge", purchaseCount: 3, clubName: "Test Club" },
      createdBy: { id: MOCK_ACTOR_ID.toString(), role: "admin" },
      createdAt: daysAgo(8),
      updatedAt: daysAgo(8),
    },

    // ── E_CERTIFICATE purchase (debit) ──
    {
      walletId,
      clubId,
      direction: "DEBIT",
      category: "E_CERTIFICATE",
      entryKind: "PURCHASE_DEBIT",
      amountPaise: 30000, // ₹300
      currency: "INR",
      sourceType: "INTERNAL_PURCHASE",
      sourceId: certAwardId,
      relatedEntityId: certAwardId,
      idempotencyKey: `idem_cert_${uid()}`,
      metadata: { label: "Wallet purchase for Participation Certificate", awardTitle: "Participation Certificate", purchaseCount: 10, clubName: "Test Club" },
      createdBy: { id: MOCK_ACTOR_ID.toString(), role: "admin" },
      createdAt: daysAgo(6),
      updatedAt: daysAgo(6),
    },

    // ── BOOST debit ──
    {
      walletId,
      clubId,
      direction: "DEBIT",
      category: "BOOST",
      entryKind: "PURCHASE_DEBIT",
      amountPaise: 50000, // ₹500
      currency: "INR",
      sourceType: "INTERNAL_PURCHASE",
      sourceId: eventId1,
      relatedEntityId: eventId1,
      idempotencyKey: `idem_boost_${uid()}`,
      metadata: { label: "Event boost – Summer Fest 2026", boostDays: 7 },
      createdBy: { id: MOCK_ACTOR_ID.toString(), role: "admin" },
      createdAt: daysAgo(5),
      updatedAt: daysAgo(5),
    },

    // ── WITHDRAWAL lock + settlement (completed withdrawal cycle) ──
    {
      walletId,
      clubId,
      direction: "DEBIT",
      category: "WITHDRAWAL",
      entryKind: "WITHDRAWAL_LOCK",
      amountPaise: 100000, // ₹1,000
      currency: "INR",
      sourceType: "WITHDRAWAL_REQUEST",
      sourceId: "wr_completed_mock",
      relatedEntityId: "wr_completed_mock",
      idempotencyKey: `idem_wdlock_${uid()}`,
      metadata: { label: "Withdrawal lock" },
      createdBy: { id: MOCK_ACTOR_ID.toString(), role: "admin" },
      createdAt: daysAgo(15),
      updatedAt: daysAgo(15),
    },
    {
      walletId,
      clubId,
      direction: "DEBIT",
      category: "WITHDRAWAL",
      entryKind: "WITHDRAWAL_SETTLEMENT",
      amountPaise: 100000,
      currency: "INR",
      sourceType: "WITHDRAWAL_REQUEST",
      sourceId: "wr_completed_mock",
      relatedEntityId: "wr_completed_mock",
      idempotencyKey: `idem_wdsettle_${uid()}`,
      metadata: { label: "Withdrawal settled to bank" },
      createdBy: { service: "payout-service", role: "internal" },
      createdAt: daysAgo(13),
      updatedAt: daysAgo(13),
    },

    // ── WITHDRAWAL lock (pending — still in progress) ──
    {
      walletId,
      clubId,
      direction: "DEBIT",
      category: "WITHDRAWAL",
      entryKind: "WITHDRAWAL_LOCK",
      amountPaise: 50000, // ₹500
      currency: "INR",
      sourceType: "WITHDRAWAL_REQUEST",
      sourceId: "wr_pending_mock",
      relatedEntityId: "wr_pending_mock",
      idempotencyKey: `idem_wdlock_pending_${uid()}`,
      metadata: { label: "Withdrawal lock (pending)" },
      createdBy: { id: MOCK_ACTOR_ID.toString(), role: "admin" },
      createdAt: hoursAgo(12),
      updatedAt: hoursAgo(12),
    },

    // ── ADJUSTMENT (manual correction) ──
    {
      walletId,
      clubId,
      direction: "CREDIT",
      category: "ADJUSTMENT",
      entryKind: "MANUAL_ADJUSTMENT",
      amountPaise: 10000, // ₹100
      currency: "INR",
      sourceType: "ADMIN",
      sourceId: "admin_adjustment_001",
      relatedEntityId: null,
      idempotencyKey: `idem_adj_${uid()}`,
      metadata: { label: "Manual adjustment – duplicate fee reversal", reason: "Platform fee was charged twice for order #xyz" },
      createdBy: { id: MOCK_ACTOR_ID.toString(), role: "admin" },
      createdAt: daysAgo(2),
      updatedAt: daysAgo(2),
    },
  ];
  return txns.map(t => ({...t, razorpayPaymentId: t.razorpayPaymentId || `pay_mock_dummy_${uid()}` }));
}

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  const clubId = process.argv[2];

  if (!clubId || !mongoose.Types.ObjectId.isValid(clubId)) {
    console.error("Usage:  node scripts/seedWalletData.js <clubId>");
    console.error("Provide a valid MongoDB ObjectId for an existing club.");
    process.exit(1);
  }

  await connectDB(process.env.MONGO_URI);
  console.log("✅  Connected to MongoDB\n");

  // Verify the club exists
  const club = await Club.findById(clubId, { name: 1 });
  if (!club) {
    console.error(`❌  Club with id ${clubId} not found. Please provide a valid clubId.`);
    process.exit(1);
  }
  console.log(`📌  Seeding wallet data for club: "${club.name}" (${clubId})\n`);

  // ── Clean up any previous mock data for this club ──
  await Wallet.deleteMany({ clubId });
  await WalletTransaction.deleteMany({ clubId });
  await WithdrawalRequest.deleteMany({ clubId });
  console.log("🗑️   Cleared existing wallet data for this club.");

  // ── Create the Wallet ──
  const wallet = await Wallet.create({
    clubId,
    currency: "INR",
    availableBalancePaise: 197000, // ₹1,970.00  (after all credits & debits)
    lockedBalancePaise: 50000,     // ₹500.00   (pending withdrawal)
    bankAccount: {
      accountHolderName: "Test Club Account",
      maskedAccountNumber: "********1234",
      ifscCode: "SBIN0001234",
      encryptedPayload: "MOCK_ENCRYPTED_PAYLOAD_FOR_TESTING", // non-null so withdrawal guard passes
      lastUpdatedBy: MOCK_ACTOR_ID.toString(),
      lastUpdatedAt: daysAgo(20),
    },
    lastWithdrawalRequestedAt: hoursAgo(12),
    lastReconciledAt: daysAgo(1),
    lastReconciledLedgerBalancePaise: 197000,
  });
  console.log(`💰  Wallet created: ${wallet._id}  (available: ₹${(wallet.availableBalancePaise / 100).toFixed(2)}, locked: ₹${(wallet.lockedBalancePaise / 100).toFixed(2)})`);

  // ── Insert Transactions ──
  const txDocs = buildTransactions(wallet._id, clubId);
  const insertedTx = await WalletTransaction.insertMany(txDocs, { ordered: false });
  console.log(`📝  Inserted ${insertedTx.length} wallet transactions.`);

  // ── Insert Withdrawal Requests ──
  const withdrawals = await WithdrawalRequest.insertMany([
    {
      walletId: wallet._id,
      clubId,
      amountPaise: 100000,
      currency: "INR",
      status: "COMPLETED",
      idempotencyKey: `idem_wr_completed_${uid()}`,
      requestedBy: { id: MOCK_ACTOR_ID.toString(), role: "admin" },
      bankSnapshot: {
        accountHolderName: "Test Club Account",
        maskedAccountNumber: "********1234",
        ifscCode: "SBIN0001234",
      },
      note: "Monthly payout – February",
      payoutReference: "pout_mock_ref_001",
      resolvedAt: daysAgo(13),
      resolvedBy: { service: "payout-service", role: "internal" },
      createdAt: daysAgo(15),
      updatedAt: daysAgo(13),
    },
    {
      walletId: wallet._id,
      clubId,
      amountPaise: 50000,
      currency: "INR",
      status: "PENDING",
      idempotencyKey: `idem_wr_pending_${uid()}`,
      requestedBy: { id: MOCK_ACTOR_ID.toString(), role: "admin" },
      bankSnapshot: {
        accountHolderName: "Test Club Account",
        maskedAccountNumber: "********1234",
        ifscCode: "SBIN0001234",
      },
      note: "Urgent – event vendor payment",
      createdAt: hoursAgo(12),
      updatedAt: hoursAgo(12),
    },
  ]);
  console.log(`🏦  Inserted ${withdrawals.length} withdrawal requests (1 COMPLETED, 1 PENDING).`);

  // ── Summary ──
  console.log("\n══════════════════════════════════════════════════");
  console.log("  SEED COMPLETE — Quick Summary");
  console.log("══════════════════════════════════════════════════");

  const totalCredits = txDocs
    .filter((t) => t.direction === "CREDIT")
    .reduce((sum, t) => sum + t.amountPaise, 0);
  const totalDebits = txDocs
    .filter((t) => t.direction === "DEBIT")
    .reduce((sum, t) => sum + t.amountPaise, 0);

  console.log(`  Club:       ${club.name}`);
  console.log(`  Wallet ID:  ${wallet._id}`);
  console.log(`  Available:  ₹${(wallet.availableBalancePaise / 100).toFixed(2)}`);
  console.log(`  Locked:     ₹${(wallet.lockedBalancePaise / 100).toFixed(2)}`);
  console.log(`  Txns:       ${insertedTx.length} (Credits: ₹${(totalCredits / 100).toFixed(2)}, Debits: ₹${(totalDebits / 100).toFixed(2)})`);
  console.log(`  Withdrawals: ${withdrawals.length}`);
  console.log("══════════════════════════════════════════════════\n");

  await mongoose.disconnect();
  console.log("🔌  Disconnected from MongoDB. Done!");
}

main().catch((err) => {
  console.error("❌  Seed script failed:", err);
  process.exit(1);
});

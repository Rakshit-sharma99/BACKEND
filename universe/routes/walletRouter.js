const express = require("express");
const {
  getWallet,
  getWalletTransactions,
  patchBankAccount,
  purchaseFromWallet,
  createWithdrawal,
  getWithdrawals,
  resolveWalletWithdrawal,
} = require("../controllers/walletControllers");

const router = express.Router();

router.get("/:clubId", getWallet);
router.get("/:clubId/transactions", getWalletTransactions);
router.patch("/:clubId/bank-account", patchBankAccount);
router.post("/:clubId/purchase", purchaseFromWallet);
router.post("/:clubId/withdraw", createWithdrawal);
router.get("/:clubId/withdrawals", getWithdrawals);
router.post("/withdrawals/:withdrawalRequestId/resolve", resolveWalletWithdrawal);

module.exports = router;

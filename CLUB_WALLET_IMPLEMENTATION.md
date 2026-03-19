# Club Wallet Implementation

## Overview

This document describes the club wallet feature that has been implemented in the current branch for the `multiverse-test` repo.

The implementation introduces a wallet system for clubs inside the `universe` service and connects ticket sales from the `ticket` service into the wallet ledger through Kafka.

The current implementation covers:

- wallet creation and retrieval
- wallet transaction ledger
- bank account management
- wallet-funded club purchases for awards
- withdrawal request and resolution flow
- ticket-sale wallet credits through Kafka

The current implementation does not yet cover:

- refund reversal into the wallet ledger
- boost purchases
- automated payout provider integration
- reconciliation cron jobs
- historical balance backfill

## Service Ownership

The wallet is implemented in the `universe` service because `universe` already owns:

- `Club`
- club admins and permissions
- club award inventory
- internal authenticated APIs

The `ticket` service remains responsible for:

- Razorpay webhook intake
- ticket creation
- emitting a wallet credit event after successful ticket creation

## Files Added

### Universe

- `universe/models/wallet.js`
- `universe/models/walletTransaction.js`
- `universe/models/withdrawalRequest.js`
- `universe/services/walletService.js`
- `universe/controllers/walletControllers.js`
- `universe/routes/walletRouter.js`
- `universe/config/event_handlers/wallet_event_handlers/credit_ticket_sale.js`

### Files Updated

- `universe/app.js`
- `universe/config/event_handlers/main.js`
- `universe/controllers/paymentControllers.js`
- `ticket/config/utils/kafkaMessagesSchemas.js`
- `ticket/workers/ticketWorker.js`

## Data Model

### 1. Wallet

Each club gets one wallet document.

Main fields:

- `clubId`
- `currency`
- `availableBalancePaise`
- `lockedBalancePaise`
- `bankAccount`
- `lastWithdrawalRequestedAt`
- reconciliation metadata

Purpose:

- stores the fast-access balance
- stores linked bank account metadata
- stores locked withdrawal amount separately from available balance

### 2. WalletTransaction

This is the append-only ledger.

Main fields:

- `walletId`
- `clubId`
- `direction`
- `category`
- `entryKind`
- `amountPaise`
- `sourceType`
- `sourceId`
- `idempotencyKey`
- `razorpayPaymentId`
- `relatedEntityId`
- `metadata`
- `pricingSnapshot`

Purpose:

- captures immutable money movement history
- provides idempotency for external payment credits
- supports audit and future reconciliation

### 3. WithdrawalRequest

This stores withdrawal workflow state.

Main fields:

- `walletId`
- `clubId`
- `amountPaise`
- `status`
- `idempotencyKey`
- `requestedBy`
- `bankSnapshot`
- `payoutReference`
- `resolvedBy`
- `failureReason`

Purpose:

- tracks the operational lifecycle of a withdrawal
- keeps mutable state separate from immutable ledger records

## API Endpoints

These routes are mounted under:

- `/universe/api/v1/wallet`

### 1. Get Wallet

- `GET /:clubId`

Returns:

- wallet balances
- bank account summary
- action permissions for the requesting user

### 2. Get Wallet Transactions

- `GET /:clubId/transactions?page=&limit=&view=raw|summary`

Modes:

- `raw`: full transaction rows
- `summary`: grouped transaction output for UI-friendly display

### 3. Update Bank Account

- `PATCH /:clubId/bank-account`

Required body:

- `accountHolderName`
- `accountNumber`
- `ifscCode`

Behavior:

- validates account details
- encrypts raw bank payload before storage
- stores only masked account number for read access

### 4. Purchase With Wallet

- `POST /:clubId/purchase`

Current supported categories:

- `BADGE`
- `E_CERTIFICATE`

Required body:

- `category`
- `awardId`
- `count`
- `idempotencyKey`

Behavior:

- validates permission
- checks award type
- atomically debits wallet
- atomically increments club award inventory
- appends a ledger entry

### 5. Request Withdrawal

- `POST /:clubId/withdraw`

Required body:

- `amountPaise`
- `idempotencyKey`
- optional `note`

Behavior:

- validates `mainAdmin` access
- validates bank account exists
- validates minimum amount
- validates cooldown
- moves funds from `availableBalancePaise` to `lockedBalancePaise`
- creates withdrawal request
- appends `WITHDRAWAL_LOCK` ledger entry

### 6. List Withdrawals

- `GET /:clubId/withdrawals?page=&limit=`

Returns paginated withdrawal request history.

### 7. Resolve Withdrawal

- `POST /withdrawals/:withdrawalRequestId/resolve`

Required body:

- `action`: `COMPLETE`, `FAIL`, or `CANCEL`

Optional body:

- `payoutReference`
- `failureReason`

Behavior:

- `COMPLETE`: reduces locked balance and appends settlement ledger entry
- `FAIL` or `CANCEL`: releases funds back to available balance and appends release ledger entry

## Authorization Rules

The wallet implementation currently enforces:

- view wallet: club admins and `mainAdmin`
- update bank account: `mainAdmin`
- request withdrawal: `mainAdmin`
- purchase awards from wallet: users in `permissions.whoCanDispatchAwards`
- platform admin can bypass these checks

## Amount Handling

All wallet amounts are stored in paise.

This applies to:

- `availableBalancePaise`
- `lockedBalancePaise`
- transaction amounts
- withdrawal amounts
- ticket-sale credit amounts

This prevents floating point drift and aligns with Razorpay amount conventions.

## Ticket Sale Credit Flow

This is the main implemented inflow path.

### Step 1. Ticket Order Creation in `universe`

File:

- `universe/controllers/paymentControllers.js`

When a Razorpay order is created for a ticket:

- event pricing is loaded
- platform fee is computed
- coupon impact is applied
- ticket pricing snapshot is computed
- club ownership is captured from event `belongsTo`

The following are added into Razorpay `notes`:

- `clubId`
- `belongsToType`
- `grossChargePaise`
- `chargedAmountPaise`
- `platformFeePaise`
- `clubNetCreditPaise`
- `feePercent`

### Step 2. Razorpay Webhook Arrives in `ticket`

File:

- `ticket/controllers/razorpayHookControllers.js`

Behavior:

- verifies webhook signature
- queues ticket processing

### Step 3. Ticket Worker Creates Ticket

Files:

- `ticket/workers/ticketWorker.js`
- `ticket/jobs/ticket/index.js`

Behavior:

- ticket creation runs inside a MongoDB transaction
- duplicate payment IDs are treated as idempotent no-op
- only after successful ticket creation do secondary actions run

### Step 4. Ticket Worker Emits Wallet Credit Event

File:

- `ticket/workers/ticketWorker.js`

If:

- the event belongs to a club
- `clubId` in payment notes matches event ownership
- `clubNetCreditPaise` is positive

Then it sends Kafka event:

- `CREDIT_TICKET_SALE`

Payload includes:

- `clubId`
- `eventId`
- `eventName`
- `ticketId`
- `paymentId`
- `grossChargePaise`
- `platformFeePaise`
- `clubNetCreditPaise`
- `currency`
- `ticketType`
- `userId`

### Step 5. Universe Consumes Wallet Credit Event

Files:

- `universe/config/event_handlers/main.js`
- `universe/config/event_handlers/wallet_event_handlers/credit_ticket_sale.js`
- `universe/services/walletService.js`

Behavior:

- consumes `credit_ticket_sale`
- checks if transaction with the same `razorpayPaymentId` already exists
- creates wallet if missing
- increments `availableBalancePaise`
- appends immutable `CREDIT_APPLIED` ledger entry

This runs inside a MongoDB transaction.

## Wallet Purchase Flow

This is the main implemented internal outflow path.

### Step 1. Authorized Club User Calls Purchase API

Endpoint:

- `POST /universe/api/v1/wallet/:clubId/purchase`

### Step 2. Wallet Service Validates Request

Checks:

- request permission
- category is supported
- award exists
- award type matches category
- `count` is valid
- `idempotencyKey` exists

### Step 3. Atomic Debit + Award Provisioning

Inside a MongoDB transaction:

- wallet balance is decremented using guarded update
- club award inventory is incremented
- ledger entry is created with `PURCHASE_DEBIT`

This avoids:

- negative balance due to concurrent requests
- award inventory update without balance debit
- duplicate purchase execution for same idempotency key

## Withdrawal Flow

### Step 1. Main Admin Requests Withdrawal

Endpoint:

- `POST /universe/api/v1/wallet/:clubId/withdraw`

Checks:

- caller is `mainAdmin`
- `amountPaise` meets minimum threshold
- bank account is configured
- cooldown has passed
- wallet has enough available balance

### Step 2. Atomic Fund Lock

Inside a MongoDB transaction:

- `availableBalancePaise` decreases
- `lockedBalancePaise` increases
- `WithdrawalRequest` is created with `PENDING`
- `WITHDRAWAL_LOCK` ledger entry is written

### Step 3. Withdrawal Resolution

Endpoint:

- `POST /universe/api/v1/wallet/withdrawals/:withdrawalRequestId/resolve`

Actions:

- `COMPLETE`
  - locked funds are removed from wallet
  - `WITHDRAWAL_SETTLEMENT` ledger entry is written
- `FAIL`
  - locked funds are moved back to available
  - `WITHDRAWAL_RELEASE` ledger entry is written
- `CANCEL`
  - locked funds are moved back to available
  - `WITHDRAWAL_RELEASE` ledger entry is written

## Idempotency

Idempotency is handled in multiple places:

### Ticket Credit

- wallet credit uses `razorpayPaymentId`
- duplicate captured payment credits are skipped

### Wallet Purchase

- requires `idempotencyKey`
- duplicate purchase request returns previously created result

### Withdrawal Request

- requires `idempotencyKey`
- duplicate request returns existing request state

## Security

### Bank Account Protection

Raw bank details are not stored in plain response form.

Implementation:

- account number is masked for reads
- raw bank payload is encrypted before persistence
- encryption key comes from:
  - `WALLET_BANK_ENCRYPTION_KEY`

### Permission Enforcement

Wallet access is enforced in the wallet service before controller response generation.

## Current Limitations

The following parts are still pending:

### Refund Ledger Reversal

Refund records exist in the repo, but the wallet implementation does not yet append debit reversals for ticket refunds.

### Boost Purchases

The wallet service currently supports only award purchases.

### Reconciliation

There is no scheduled balance-vs-ledger verification job yet.

### Test Harness

The implementation was syntax-checked with `node --check`, but automated behavior tests have not yet been added.

## Required Environment Variable

The following environment variable is required for bank account encryption:

- `WALLET_BANK_ENCRYPTION_KEY`

Recommended:

- use a stable 32-byte secret or a base64-encoded 32-byte key

## Suggested Next Steps

1. Add refund success/failure events into the wallet ledger.
2. Replace the old direct paid-award purchase flow in clients with wallet purchase.
3. Add wallet reconciliation job.
4. Add automated tests for wallet credit, debit, and withdrawal race conditions.

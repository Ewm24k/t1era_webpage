# T1ERA Billing System — AI Handoff Document
**Project:** T1ERA Compute · Pod-workflow.html  
**Prepared by:** Claude Sonnet 4.6 (session: Balance Manager implementation)  
**Files in scope:** `Pod-workflow.html` · `pod-balance.js` · `pod-notify.js` · `pod-serverless.js`

---

## MANDATORY: Read This Before Touching Anything

1. **Copy files from uploads to `/home/claude/` first.** Never edit in `/mnt/user-data/uploads/` directly.
2. **Use Python string replacement for surgical edits.** Never rewrite whole files.
3. **Verify every change with `grep -n` after writing.** Confirm line numbers and context.
4. **Read both `pod-notify.js` and `pod-balance.js` in full first.** All new code must mirror their patterns exactly.
5. **The HTML file is 3002 lines.** Any replacement targeting a string that appears more than once must use `replace(old, new, 1)` (count=1) to avoid double-replacement.

---

## Part 1 — What Was Built This Session

### 1.1 New File: `pod-balance.js` (501 lines)

A complete Firestore balance and transaction manager. Architecture is a deliberate, line-for-line mirror of `pod-notify.js` so both modules are consistent in style, boot sequence, and failure handling.

#### Firestore Paths Created

```
users/{uid}/billing/balance
  {
    amount:     number,   // current balance
    currency:   string,   // 'MYR' | 'USD'
    updatedAt:  string,   // ISO timestamp
  }

users/{uid}/billing/transactions
  {
    entries: [
      {
        id:          string,   // 'txn_{Date.now()}'
        type:        string,   // 'topup' | 'deduction' | 'refund' | 'adjustment'
        amount:      number,   // positive = credit, negative = debit
        balanceAfter:number,   // balance snapshot after this entry
        description: string,   // human label
        ref:         string,   // payment gateway reference (billCode, txnId, etc.)
        gateway:     string,   // 'toyyibpay' | 'stripe' | 'manual' | ''
        status:      string,   // 'completed' | 'pending' | 'failed'
        createdAt:   string,   // ISO timestamp
      }
    ],
    updatedAt: string,
  }
```

#### When Does Firestore Get Written?

The balance document is **created automatically on first authenticated page load** — inside `loadBalanceFromFirestore()`. If the document does not exist, the module seeds it from `localStorage` (`t1era_sl_balance`) or falls back to `142.50`. This mirrors the exact same first-visit seeding pattern in `pod-notify.js` → `loadPrefsFromFirestore()`.

The transactions document is seeded the same way — empty `entries: []` on first visit.

**So: Firestore documents are created the moment a user loads the page for the first time while authenticated.** No manual provisioning required.

#### Public API: `window.T1Balance`

```js
T1Balance.topUp(amount, opts)
// opts: { description, ref, gateway, status }
// Adds to balance → saves to Firestore → appends txn → syncs all DOMs → fires slBalanceUpdate

T1Balance.deduct(amount, opts)
// Subtracts from balance → same chain as topUp

T1Balance.getBalance()          // returns current balance (number)
T1Balance.getCurrency()         // returns 'MYR' or 'USD'
T1Balance.getTransactions()     // returns copy of _txns array
T1Balance.renderHistory()       // re-renders #billingTxnList manually
T1Balance.isReady()             // true after Firestore load completes
T1Balance.toyyibPayCallback(billCode, txnData)
// toyyibPay hook — see Part 2 below
```

#### Boot Sequence (matches pod-notify.js exactly)

```
DOMContentLoaded / immediate
  → initFirebase()        — piggybacks existing firebase app
  → firebase.auth().onAuthStateChanged()
      → show cached localStorage data immediately
      → loadBalanceFromFirestore()  — authoritative, async
      → loadTxnsFromFirestore()     — authoritative, async
      → hook slBalanceUpdate event  — keeps Firestore in sync with SL tick
```

### 1.2 Changes to `Pod-workflow.html`

**Only 3 surgical insertions were made. Nothing else was changed.**

| # | Location | What was added |
|---|---|---|
| 1 | Inside `<style>` before `</style>` (line ~1169) | CSS classes: `.txn-card`, `.txn-card-head`, `.txn-card-icon`, `.txn-card-title`, `.txn-card-sub`, `.txn-refresh-btn`, `#billingTxnList` |
| 2 | Inside `#tab-payg` after `.billing-grid` closing `</div>` (line ~1525) | Transaction History card HTML with `id="billingTxnList"` |
| 3 | Before `</body>`, between `pod-serverless.js` and `pod-notify.js` (line 2999) | `<script src="pod-balance.js"></script>` |

---

## Part 2 — What Needs to Be Done Next

### Priority 1 — toyyibPay API Integration

This is the primary goal. `pod-balance.js` already has the receiving end built (`T1Balance.toyyibPayCallback`). What's missing is the **outbound call** — sending the user to toyyibPay and handling the return.

#### How toyyibPay Works (for context)

toyyibPay is a Malaysian payment gateway. Flow:
1. Your server creates a bill via `https://toyyibpay.com/index.php/api/createBill` → returns `billCode`
2. You redirect user to `https://toyyibpay.com/{billCode}`
3. After payment, toyyibPay redirects user back to your `returnUrl` with query params: `billCode`, `billpaymentStatus` (`1`=success, `2`=pending, `3`=failed), `billpaymentAmount`, `billpaymentInvoiceNo`

#### What Still Needs to Be Built

**A. Backend/Cloud Function (outside this HTML)**
```
POST /api/createToyyibBill
  body: { amount, description, uid, email, name }
  → calls toyyibPay API with your secretKey
  → returns { billCode, billUrl }
```
The secret key must NEVER be in client-side code.

**B. `Pod-workflow.html` — Wire the checkout button**

The `.btn-checkout` button currently has no `onclick`. It needs to:
```js
// Pseudocode for what next AI should implement:
async function handleCheckout() {
  const amount = getSelectedAmount(); // from amt-btn or customAmtInput
  const res = await fetch('/api/createToyyibBill', {
    method: 'POST',
    body: JSON.stringify({ amount, uid: firebase.auth().currentUser.uid, ... })
  });
  const { billUrl } = await res.json();
  window.location.href = billUrl; // redirect to toyyibPay
}
```

**C. Return URL Handler**

When toyyibPay redirects back, the URL will have query params. On page load, check for them and call:
```js
// At DOMContentLoaded in Pod-workflow.html:
const params = new URLSearchParams(window.location.search);
const billCode = params.get('billCode');
const status   = params.get('billpaymentStatus');
const amount   = params.get('billpaymentAmount');

if (billCode && status) {
  T1Balance.toyyibPayCallback(billCode, {
    amount:      parseFloat(amount) / 100, // toyyibPay uses cents
    status:      status,                   // '1' = success
    description: 'Top-up via toyyibPay',
  });
  // Clean URL
  window.history.replaceState({}, '', window.location.pathname);
  // Switch to billing tab to show the new transaction
  document.querySelector('.tab[data-target="tab-payg"]').click();
}
```

### Priority 2 — Fix the Reset Balance Danger Zone Button

**Current bug:** The Reset Balance button in Settings → Danger Zone writes directly to `localStorage` only. It completely bypasses `T1Balance` and does not update Firestore.

**File:** `Pod-workflow.html` line ~1978

**Current code:**
```js
onclick="if(confirm('Reset balance to $142.50?')){
  localStorage.setItem('t1era_sl_balance','142.5');
  showSettingsToast('Balance reset to $142.50');
}"
```

**Correct replacement:**
```js
onclick="if(confirm('Reset balance to $142.50?')){
  if(window.T1Balance){
    window.T1Balance.topUp(0, {description:'Balance reset to $142.50 (demo)', gateway:'manual', status:'completed'});
    // Actually set to 142.50 directly:
    // T1Balance has no setBalance() — add one, or do this:
  }
  localStorage.setItem('t1era_sl_balance','142.5');
  showSettingsToast('Balance reset to $142.50');
}"
```

Actually the cleanest fix is to add a `T1Balance.setBalance(amount, opts)` method in `pod-balance.js` that writes directly, then call that from the button.

### Priority 3 — Currency Support (MYR)

The system stores `currency: 'MYR'` but all DOM displays show `$`. Once toyyibPay is integrated, amounts will be in MYR (Ringgit). The display formatter in `syncAllBalanceDOMs()` in `pod-balance.js` needs to be updated to use the correct symbol:

```js
// In pod-balance.js → syncAllBalanceDOMs()
// Current:
var fmt = '$' + amount.toFixed(2);
// Should become:
var symbol = _currency === 'MYR' ? 'RM' : '$';
var fmt = symbol + amount.toFixed(2);
```

This also affects `#headerBalanceStat`, `#balanceAmount`, `#runwayBalance`, `#sidebarBalance`.

### Priority 4 — Firestore Security Rules

The current Firebase setup has no security rules shown in this codebase. Before going live, Firestore rules must be set so users can only read/write their own billing documents:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/billing/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /users/{userId}/settings/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### Priority 5 — Connect Checkout Button to Selected Amount

Right now the `.btn-checkout` button has no `onclick` at all (line 1422). The `amountSelector` logic updates the button label but the button does nothing when clicked. The checkout flow needs to be wired end-to-end with `T1Balance.topUp()` as the final step after payment confirmation.

---

## Part 3 — Architecture Reference Map

### File Load Order (bottom of `</body>`)
```
pod-serverless.js   → window.SL        (instance manager, fires slBalanceUpdate)
pod-balance.js      → window.T1Balance  (balance + Firestore ledger) ← NEW
pod-notify.js       → window.T1Notify   (banner alerts, reads balance)
```

### Balance Data Flow (current state)
```
pod-serverless.js (SL module)
  → fires CustomEvent('slBalanceUpdate', { detail: '$X.XX' })
  → writes to localStorage: t1era_sl_balance

Pod-workflow.html (inline script, line ~2715)
  → listens to slBalanceUpdate
  → updates #headerBalanceStat only

pod-balance.js (T1Balance)
  → listens to slBalanceUpdate
  → syncs all 4 DOM elements: #headerBalanceStat, #balanceAmount,
    #runwayBalance, #sidebarBalance
  → saves to Firestore: users/{uid}/billing/balance

pod-notify.js (T1Notify)
  → watches #headerBalanceStat via MutationObserver
  → evaluates balance thresholds
  → shows/hides alert banners
```

### Key DOM IDs — Balance
| ID | Location | Purpose |
|---|---|---|
| `headerBalanceStat` | Topbar pill | Live balance display |
| `balanceAmount` | Billing tab, Add Credits card | Large balance figure |
| `runwayBalance` | Billing tab, Runway Estimator card | Balance in runway calc |
| `sidebarBalance` | Sidebar footer | User balance |
| `billingTxnList` | Billing tab, Transaction History card | Txn rows injected here |

### Key localStorage Keys
| Key | Owner | Purpose |
|---|---|---|
| `t1era_sl_balance` | SL module + T1Balance | Current balance (number as string) |
| `t1era_billing_transactions` | T1Balance | Cached txn array (last 50) |
| `t1era_notif_prefs` | T1Notify | Notification toggles cache |
| `t1era_notif_dismissed` | T1Notify | Dismissed banner state |
| `t1era_sl_instances` | SL module | Instance array |

### Firestore Document Tree
```
users/
  {uid}/
    billing/
      balance          ← T1Balance reads/writes
      transactions     ← T1Balance reads/appends
    settings/
      notifications    ← T1Notify reads/writes
    (root doc)         ← auth gate reads (profile, photo)
```

---

## Part 4 — Patterns to Always Follow

### Pattern: Adding a new Firestore doc path
Copy `fsDocRef()` / `balanceDocRef()` / `txnDocRef()` exactly. Always:
- Guard with `if (!_db || !_uid) return null;`
- Seed on first visit inside the `!snap.exists` branch
- Cache to localStorage immediately after Firestore write

### Pattern: Saving to Firestore
Always use `{ merge: true }` on `set()` so partial updates don't clobber other fields. Always add `updatedAt: new Date().toISOString()`.

### Pattern: Loading data
Always show localStorage cache first (fast), then overwrite with Firestore (authoritative). Never block render waiting for Firestore.

### Pattern: DOM balance sync
Never update a single balance DOM element in isolation. Always call `syncAllBalanceDOMs(amount)` so all 4 displays stay consistent.

### Pattern: Script insertion
New module scripts go at the bottom of `<body>`, **between** `pod-serverless.js` and `pod-notify.js`. Notify must always load last because it depends on both SL and Balance being available.

---

## Part 5 — Known Gaps / Things That Are NOT Wired Yet

| Gap | File | Why it matters |
|---|---|---|
| `.btn-checkout` has no `onclick` | `Pod-workflow.html` line 1422 | Clicking Pay does nothing |
| Reset Balance button bypasses T1Balance | `Pod-workflow.html` line ~1978 | Firestore not updated on reset |
| `syncAllBalanceDOMs` doesn't handle MYR symbol | `pod-balance.js` line ~220 | Will show `$` for MYR amounts |
| No return URL handler for toyyibPay | `Pod-workflow.html` | Payment can't complete without it |
| No server-side bill creation endpoint | Backend (not in these files) | Required before toyyibPay works |
| Firestore security rules not set | Firebase Console | Any authenticated user could read others' billing |
| `slBalanceUpdate` listener in inline script (line ~2715) and T1Balance both update `#headerBalanceStat` | `Pod-workflow.html` | Redundant but harmless — inline one should be removed eventually |

---

## Part 6 — Quick Verification Checklist (Run Before Every Edit)

```bash
# 1. Copy from uploads
cp /mnt/user-data/uploads/Pod-workflow.html /home/claude/Pod-workflow.html
cp /mnt/user-data/uploads/pod-balance.js /home/claude/pod-balance.js
cp /mnt/user-data/uploads/pod-notify.js /home/claude/pod-notify.js

# 2. Confirm line counts (sanity check nothing was truncated)
wc -l /home/claude/Pod-workflow.html /home/claude/pod-balance.js /home/claude/pod-notify.js
# Expected: ~3002 / ~501 / ~578

# 3. Confirm the 3 insertions from this session are present
grep -n "pod-balance.js\|billingTxnList\|TRANSACTION HISTORY CARD" /home/claude/Pod-workflow.html

# 4. Confirm T1Balance public API
grep -n "global.T1Balance" /home/claude/pod-balance.js

# 5. Confirm Firestore paths
grep -n "billing" /home/claude/pod-balance.js

# 6. Before any edit, always verify the exact OLD string exists once:
grep -c "YOUR_TARGET_STRING" /home/claude/Pod-workflow.html
# Must return 1. If 0 = wrong string. If 2+ = use more unique context.
```

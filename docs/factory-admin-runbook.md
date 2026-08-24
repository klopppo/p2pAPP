# Factory Owner Operations — Runbook

> How to change the platform fee or treasury on a deployed
> `KlerosEscrowFactory`. Assumes a multisig (e.g. Safe) owns the factory
> contract post-deployment. For the function reference see
> `contracts/KlerosEscrowFactory.sol` and
> [`contract-execution-status.md`](contract-execution-status.md).

---

## Why a two-step pattern?

`KlerosEscrowFactory` enforces a two-step change for **fee** and **treasury**:

- `setPendingFee` → wait → `acceptFee`
- `setTreasury` → wait → `acceptTreasury`

This stops an owner from sandwiching a pending `createEscrow` transaction with
a fee / treasury update that would silently inflate the cut or reroute funds.
See `KlerosEscrowFactory.sol:103-153` for the exact guards.

- The fee change is gated on a 1-day gap between step 1 and step 2.
- The treasury change is gated on the **new** treasury signing step 2
  themselves — the previous treasury keeps control until the new one accepts.

---

## 1. Change the platform fee

**Actor**: owner (multisig). **Step 2**: anyone (a keeper bot is ideal).

```bash
# Step 1 — owner proposes the new fee (in basis points, 0..MAX_FEE_BPS=10000)
cast send $FACTORY "setPendingFee(uint256)" $NEW_BPS \
    --rpc-url $RPC --account $OWNER

# Confirm the proposal landed
cast call $FACTORY "pendingFeeBps()(uint256)" --rpc-url $RPC
cast call $FACTORY "feeChangePending()(bool)"     --rpc-url $RPC

# Wait at least 1 day, then…

# Step 2 — anyone accepts the pending fee
cast send $FACTORY "acceptFee()" --rpc-url $RPC --account $KEEPER

# Verify the live fee moved
cast call $FACTORY "feeBps()(uint256)" --rpc-url $RPC
```

If you need to cancel the proposal before step 2 fires, set the fee to the
current value (`setPendingFee(currentFeeBps)`) — `acceptFee()` is idempotent
and the on-chain history is clean.

---

## 2. Change the platform treasury

**Actor step 1**: owner (multisig). **Actor step 2**: the *new* treasury
themselves — they must hold the private key for the new address and sign the
transaction. The previous treasury keeps withdrawal rights until step 2 lands.

```bash
# Step 1 — owner proposes the new treasury
cast send $FACTORY "setTreasury(address)" $NEW_TREASURY \
    --rpc-url $RPC --account $OWNER

# Confirm
cast call $FACTORY "pendingTreasury()(address)" --rpc-url $RPC

# Step 2 — the new treasury accepts
cast send $FACTORY "acceptTreasury()" --rpc-url $RPC --account $NEW_TREASURY

# Verify
cast call $FACTORY "treasury()(address)" --rpc-url $RPC
```

If the new treasury never accepts, the previous one remains in control. The
proposal is purely additive; nothing is lost by walking away from it.

---

## 3. Deploy a brand-new factory

See `contrats/Makefile` and `contrats/script/DeployKlerosEscrowFactory.s.sol`.
The deploy script wires up the treasury + initial fee in the same broadcast,
so no separate runbook steps are needed for the bootstrap.

Required `.env`:

```
TOKEN=0x...                       # ERC-20 the escrow will trade
KLEROS_COURT=0x988b3A538b618C7A603e1c11Ab82Cd16dbE28069  # mainnet default
KLEROS_EXTRA_DATA_P1=0x000...<subcourtId>                  # uint96 right-aligned
KLEROS_EXTRA_DATA_P2=0x000...<minJurors>
FEE_BPS=30
TREASURY=0x...
RPC=https://...
DEPLOYER=<keystore name or 0x...>
ETHERSCAN_API_KEY=...
CHAIN_ID=1
```

Then:

```bash
make deploy         # forge script --broadcast --verify
```

The script's console output includes the new factory address. Drop that into
`VITE_KLEROS_ESCROW_FACTORY` (vite-app `.env`) so the frontend can target it.

---

## 4. Auditor / read-only checks

Anyone can query live state without holding keys:

```bash
# Live config
cast call $FACTORY "token()(address)"               --rpc-url $RPC
cast call $FACTORY "klerosCourt()(address)"         --rpc-url $RPC
cast call $FACTORY "klerosExtraDataPart1()(bytes32)" --rpc-url $RPC
cast call $FACTORY "klerosExtraDataPart2()(bytes32)" --rpc-url $RPC
cast call $FACTORY "feeBps()(uint256)"               --rpc-url $RPC
cast call $FACTORY "treasury()(address)"            --rpc-url $RPC
cast call $FACTORY "implementation()(address)"       --rpc-url $RPC

# Pending changes
cast call $FACTORY "pendingFeeBps()(uint256)"       --rpc-url $RPC
cast call $FACTORY "feeChangePending()(bool)"        --rpc-url $RPC
cast call $FACTORY "pendingTreasury()(address)"     --rpc-url $RPC
```

---

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| `acceptFee()` reverts | Less than 1 day passed since `setPendingFee` | Wait and retry |
| `setPendingFee(_bps)` reverts | `_bps > MAX_FEE_BPS (=10000)` | Cap at 10000 (100%) |
| `setTreasury(addr)` reverts | `addr == address(0)` or caller ≠ owner | Use a real address; route through multisig |
| `acceptTreasury()` reverts | Caller ≠ `pendingTreasury` | Sign the tx from the new treasury EOA / multisig |
| `Ownable: caller is not the owner` | Direct EOA sent `set*` instead of multisig | Re-issue from the multisig signer |
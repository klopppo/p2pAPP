# 🗄️ Database Schema - P2P Crypto Platform
# Struttura con Relazioni e Flussi

## 📊 **Schema Principale (Diagramma Interattivo)**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USERS DATABASE                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                     User Profiles (Public)                         │    │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    │    │
│  │  │  Wallet  │───▶│  Profile │───▶│ Reputation│───▶│   Tags   │    │    │
│  │  │  Address │    │   Data   │    │   Scores │    │  System  │    │    │
│  │  └──────────┘    └──────────┘    └──────────┘    └──────────┘    │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                 │                                           │
│                                 ▼                                           │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                 User Profiles (Private)                             │    │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    │    │
│  │  │   KYC    │───▶│  2FA     │───▶│   Wallet │───▶│Security  │    │    │
│  │  │ Documents│    │ Settings │    │ Locking  │    │ Settings │    │    │
│  │  └──────────┘    └──────────┘    └──────────┘    └──────────┘    │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ 1:N
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            TRADES SYSTEM                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                        Trade Record                                 │    │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    │    │
│  │  │  Details │───▶│  Crypto  │───▶│   Fiat   │───▶│ Escrow   │    │    │
│  │  │   Info   │    │  Amount  │    │  Payment │    │ Contract │    │    │
│  │  └──────────┘    └──────────┘    └──────────┘    └──────────┘    │    │
│  │        │           │           │           │                     │    │
│  │        ▼           ▼           ▼           ▼                     │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │    │
│  │  │ Reviews│  │    Rating  │  │   Time   │  │ Events   │         │    │
│  │  │ Buyer    │  │  Scores  │  │   Logs   │  │ Tracking │         │    │
│  │  │ Seller   │  │  Breakdown│  │          │  │          │         │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘         │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ 1:N
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           OFFERS SYSTEM                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                        Offer Record                                 │    │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    │    │
│  │  │  Status  │───▶│  Crypto  │───▶│   Fiat   │───▶│ Pricing  │    │    │
│  │  │          │    │  Amount  │    │  Payment │    │         │    │    │
│  │  └──────────┘    └──────────┘    └──────────┘    └──────────┘    │    │
│  │        │           │           │           │                     │    │
│  │        ▼           ▼           ▼           ▼                     │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │    │
│  │  │   Views  │  │  Limits  │  │  Scoperta │  │  Tags    │         │    │
│  │  │ Tracking │  │  Amount  │  │  & SEO    │  │  System  │         │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘         │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ 1:N
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DISPUTES SYSTEM                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                      Dispute Record                                 │    │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    │    │
│  │  │   Status │───▶│  Reason  │───▶│   Prove   │───▶│ Resolution│   │    │
│  │  │          │    │          │    │  (Evid.) │    │   Data   │    │    │
│  │  └──────────┘    └──────────┘    └──────────┘    └──────────┘    │    │
│  │        │           │           │           │                     │    │
│  │        ▼           ▼           ▼           ▼                     │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │    │
│  │  │   Steps  │  │ Appeal   │  │  Flags   │  │  Outcome │         │    │
│  │  │  Process │  │ History  │  │  System  │  │   Data   │         │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘         │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ 1:N
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          KYC SYSTEM                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                     Verification Request                             │    │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    │    │
│  │  │ Documents│───▶│ Verification│───▶│ Providers│───▶│ Review   │    │    │
│  │  │  Upload  │    │  Request  │    │  Checks  │    │ Process  │    │    │
│  │  └──────────┘    └──────────┘    └──────────┘    └──────────┘    │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 🔗 **FLUSSI PRINCIPALI CON FRECCE**

### **1. FLUSSO DI REGISTRAZIONE E VERIFICHE**

```
User → Wallet Connection → Profile Creation → KYC Request → Verification → Approved
    │                                           │
    └─────────────────┐                         └───▶ Reputation Score (50 base)
                      │                                 │
                      ▼                                 ▼
              ┌─────────────────┐              ┌─────────────────┐
              │   Public Profile│              │   Private Data  │
              │  (Visible)       │              │   (Encrypted)    │
              └─────────────────┘              └─────────────────┘
```

### **2. FLUSSO DI TRADING**

```
Seller → Create Offer → Buyer Sees Offer → Buyer Accepts Offer →
    │                                              │
    └──────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  Smart Contract Escrow Creation                              │
└─────────────────────────────────────────────────────────────┘
    │
    ├─────────────────┬─────────────────┐
    │                 │                 │
    ▼                 ▼                 ▼
Buyer pays Fiat   Crypto sent to   Escrow Locked
    │                 (to smart       │
    │                 contract)       │
    │                 │               │
    └─────────────────┴────────────────┘
                    │
                    ▼
            Buyer Confirms Crypto
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  Trade Completion → Both Rate → Reputation Updated            │
└─────────────────────────────────────────────────────────────┘
```

### **3. FLUSSO DI REPUTAZIONE**

```
Trade Completed → Rating Submitted → Average Score Calculated
    │                                              │
    ├──────────────────────────────────────────────┤
    │                                              │
    ▼                                              ▼
┌─────────────────┐                    ┌─────────────────┐
│   Points Earned │                    │   Points Lost   │
│  (+5 per trade) │                    │  (-2 per cancel)│
└─────────────────┘                    └─────────────────┘
    │                                              │
    └─────────────────┬────────────────────────────┘
                      ▼
              ┌─────────────────┐
              │ Reputation Score │
              │  (0-100 scale)   │
              └─────────────────┘
                      │
                      ▼
              ┌─────────────────┐
              │    Badges       │
              │  (unlocked)     │
              └─────────────────┘
```

### **4. FLUSSO DI DISPUTE**

```
Disagreement Occurs → Buyer/Seller Files Dispute →
    │                                              │
    └──────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  Evidence Collection (Both sides)                             │
└─────────────────────────────────────────────────────────────┘
    │
    ├─────────────────┬─────────────────┐
    │                 │                 │
    ▼                 ▼                 ▼
Buyer's Proof    Seller's Proof    System Logs
    │                 │                 │
    └─────────────────┴─────────────────┘
                    │
                    ▼
            ┌───────────────┐
            │  Review Panel │
            └───────────────┘
                    │
                    ├───────────────┬───────────────┐
                    ▼               ▼               ▼
            ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
            │  Dispute Resolved│  Escalated │  Rejected   │
            │  (Mutual)   │   │  (Arbitration)│            │
            └─────────────┘ └─────────────┘ └─────────────┘
                    │               │               │
                    └───────┬───────┴───────┬───────┘
                            ▼               ▼
                    ┌─────────────┐ ┌─────────────┐
                    │ Funds Released││ Funds Refunded│
                    │ to Winner    ││ to Correct Party│
                    └─────────────┘ └─────────────┘
                            │               │
                            └───────┬───────┘
                                    ▼
                        ┌─────────────────┐
                        │ Reputation Updated│
                        │ (Penalty Applied) │
                        └─────────────────┘
```

### **5. FLUSSO DI OFFERS E SCOPERTA**

```
Seller Creates Offer → Category/Tags Applied → Offer Listed
    │                                              │
    └──────────────────────────────────────────────┘
                    │
                    ▼
            ┌───────────────┐
            │  Search & Filter│
            └───────────────┘
                    │
                    ├─────────────────┬─────────────────┐
                    ▼                 ▼                 ▼
            ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
            │  Matching Offers│  Featured Offers│ Premium Offers│
            └─────────────┘ └─────────────┘ └─────────────┘
                    │                 │                 │
                    └─────────────────┴─────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  Buyer Selects │
                    └───────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  Trade Initiated│
                    └───────────────┘
```

## 🎯 **KEY RELATIONSHIPS**

### **User ↔ Trade** (1:N)
```
User (1) ──────────────> (N) Trade
[1 buyer + 1 seller]      [Multiple trades per user]
```

### **User ↔ Offer** (1:N)
```
User (1) ──────────────> (N) Offer
[1 seller]               [Multiple offers by seller]
```

### **Offer ↔ Trade** (1:1 when active)
```
Offer (1) ──────────────> (1) Trade
[Single active trade]    [Completed from this offer]
```

### **User ↔ Reputation** (1:1)
```
User (1) ──────────────> (1) Reputation Score
[Own detailed reputation]  [Comprehensive score tracking]
```

### **Trade ↔ Dispute** (0:N)
```
Trade (1) ──────────────> (N) Dispute
[May have multiple disputes] [One active dispute max]
```

### **User ↔ KYC** (1:1)
```
User (1) ──────────────> (1) KYC Document
[One verification record] [Multiple providers possible]
```

## 📊 **STATISTICS & METRICS FLOW**

```
Trade Completed → Rating Submitted →
    │                                      │
    ├──────────────────────────────────────┤
    │                                      │
    ▼                                      ▼
┌─────────────────┐              ┌─────────────────┐
│  Metrics Updated │              │  Trade History  │
│  - Volume        │              │  - Listings     │
│  - Success Rate  │              │  - Trends       │
│  - Avg Rating    │              │  - Statistics   │
│  - Response Time │              └─────────────────┘
└─────────────────┘
    │
    ▼
┌─────────────────┐
│  Dashboard Data │
│  - Stats Cards  │
│  - Charts       │
│  - Analytics    │
└─────────────────┘
```

## 🔄 **UPDATE FLOWS**

### **Real-time Updates:**
```
Trade Status Change → Events Log → Dashboard Refresh
    │                         │
    └──────────┬──────────────┘
               ▼
        ┌──────────────┐
        │  WebSocket   │
        │  Notifications│
        └──────────────┘
```

### **Reputation Updates:**
```
Rating Received → Score Calculation → Badges Check → Notification
    │                                   │
    └──────────┬────────────────────────┘
               ▼
        ┌──────────────┐
        │  Reputation  │
        │  Score Update│
        └──────────────┘
```

## 📈 **DATA FLOW DURING A TRADE**

```
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: Offer Creation                                      │
│  Seller → Create Offer → Database                           │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 2: Offer Discovery                                     │
│  Buyer Searches → Matching Offers Found                     │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 3: Offer Acceptance                                    │
│  Buyer Accepts → Offer Status: Active                       │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 4: Escrow Creation                                     │
│  Smart Contract Deployed → Funds Locked                      │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 5: Payment Exchange                                    │
│  Fiat Sent → Crypto Sent to Escrow                           │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 6: Trade Completion                                    │
│  Both Confirm → Trade Completed → Rating Submitted          │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 7: Post-Trade                                          │
│  Funds Released → Reputation Updated → Analytics Updated    │
└─────────────────────────────────────────────────────────────┘
```

## 🛡️ **SECURITY FLOWS**

```
User Login → 2FA Verification → Session Created → Protected Data Access
    │
    ├─▶ Wallet Connection → Private Key Encryption
    │
    ├─▶ KYC Upload → Hash Verification → Provider Check
    │
    └─▶ Trade Execution → Smart Contract Interaction → Timestamp
```

Questa struttura fornisce una visuale completa di come tutti i componenti del database interagiscono e fluiscono dati in una piattaforma P2P crypto affidabile. 🚀

# 🗄️ Supabase Integration Guide

This guide will help you integrate your P2P crypto platform with Supabase database.

---

## 📋 Prerequisites

- Supabase account (https://supabase.com)
- Node.js 18+
- npm 9+

---

## 🚀 Quick Setup

### 1. Install Supabase CLI

```bash
npm install -g supabase
```

### 2. Initialize Supabase Project

```bash
supabase init
```

This will create a `.supabase` folder in your project with:
- `config.toml` - Project configuration
- `migrations/` - Database migration files

### 3. Link to Your Project

Run this in your project directory:

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

Replace `YOUR_PROJECT_REF` with your Supabase project reference ID.

---

## 🗄️ Database Setup

### 1. Create Database from Schema

Your existing schema files are ready:

- `docs/migrations/001-escrow-lifecycle-update.sql` - Main migration
- `docs/database-schema.md` - Visual diagrams
- `docs/database-relational-schema.md` - Complete relational schema

### 2. Push Schema to Supabase

```bash
npm run db:migrate
```

Or manually:

```bash
supabase db push
```

This will:
- Create all tables
- Create enums
- Create indexes
- Create triggers
- Apply constraints

### 3. View Database in Studio

```bash
npm run db:studio
```

This will:
- Start Supabase local instance
- Open database studio in browser
- Allow you to query tables, manage rows, etc.

---

## 🔐 Authentication Setup

### 1. Enable Email Auth

In Supabase Dashboard → Authentication → Providers → Email:
- ✅ Enable Email provider
- ✅ Enable Email Confirmations (optional)
- Set "Confirm email" policy

### 2. Enable Magic Link (Wallet Sign-in)

We'll use email-based magic links for wallet connections.

**Note:** We'll use `{wallet_address}@wallet.p2p` as email format.

### 3. Set Up RLS Policies

See `src/lib/supabase/index.ts` for query examples.

---

## 🔧 Configuration

### 1. Create `.env.local`

Copy from `.env.example`:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_APP_URL=http://localhost:5173
```

Get these keys from:
Supabase Dashboard → Project Settings → API

### 2. Restart Development Server

```bash
npm run dev
```

---

## 📁 Project Structure

```
p2pAPP/
├── src/
│   ├── lib/
│   │   └── supabase/
│   │       └── index.ts        # Main Supabase client
│   ├── types/
│   │   └── database.ts         # TypeScript interfaces
│   └── pages/
│       ├── OffersPage.tsx      # Connected to Supabase
│       └── Dashboard.tsx       # Connected to Supabase
├── .env.example
├── docs/
│   ├── migrations/
│   │   └── 001-escrow-lifecycle-update.sql
│   └── SUPABASE-INTEGRATION.md # This file
└── package.json
```

---

## 🎯 Usage Examples

### 1. Create Offer

```typescript
import { createOffer, OfferStatus } from '@/lib/supabase'

const offer = await createOffer({
  seller_id: userId,
  type: 'sell',
  crypto_token: 'ETH',
  crypto_amount: 1.5,
  fiat_currency: 'EUR',
  fiat_amount: 3000,
  price_per_unit: 2000,
  min_amount: 1000,
  max_amount: 50000,
  payment_methods: ['SEPA', 'PayPal'],
  available_regions: ['IT', 'DE', 'FR'],
  platform_fee_bps: 50,
})
```

### 2. Get Active Offers

```typescript
import { getActiveOffers } from '@/lib/supabase'

const offers = await getActiveOffers(50, 0)
// Returns array of offers with seller profile
```

### 3. Create Trade

```typescript
import { createTrade } from '@/lib/supabase'

const trade = await createTrade({
  offer_id: offerId,
  buyer_id: buyerId,
  seller_id: sellerId,
  crypto_token: 'ETH',
  crypto_amount: 1.5,
  crypto_price_per_unit: 2000,
  fiat_currency: 'EUR',
  fiat_amount: 3000,
  payment_method: 'SEPA',
  payment_details: { iban: 'IT12 0000...' },
  escrow_contract_addr: '0x1234abcd...',
  escrow_timeout: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  escrow_release_after: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
  platform_fee_bps: 50,
})
```

### 4. Update Escrow Status

```typescript
import { updateTradeEscrowStatus, EscrowStatus } from '@/lib/supabase'

await updateTradeEscrowStatus(
  tradeId,
  'deposited',
  '0xabcdef1234567890...'
)
```

### 5. Submit Rating

```typescript
import { submitTradeRating } from '@/lib/supabase'

await submitTradeRating({
  trade_id: tradeId,
  rater_id: myUserId,
  rated_id: otherUserId,
  direction: 'buyer',
  score: 5,
  comment: 'Excellent trade!',
})
```

---

## 🔒 Security

### Row Level Security (RLS)

All queries use RLS policies defined in:

- `supabase/migrations/001-escrow-lifecycle-update.sql`
- Database documentation

### Anon Key vs Service Role

- **Anon Key**: For frontend (public API)
- **Service Role**: For backend (bypasses RLS) - NEVER expose this

### What's Protected

✅ **User Private Data** (wallet keys, 2FA secrets, KYC)
✅ **Trade Data** (buyer/seller privacy)
✅ **Dispute Evidence** (confidential evidence)
✅ **Admin Features** (admin-only actions)
✅ **Reputation Data** (prevent manipulation)

---

## 📊 Database Schema Reference

### Core Tables

1. **users** - User profiles and public data
2. **user_private** - Encrypted private data
3. **offers** - Trade offers from sellers
4. **trades** - Active trades
5. **trade_ratings** - User ratings
6. **trade_events** - Audit log
7. **disputes** - Dispute records
8. **dispute_evidence** - Evidence files
9. **kyc_applications** - KYC records
10. **kyc_documents** - KYC documents
11. **reputation_scores** - Reputation metrics
12. **reputation_points** - Point history

### Key Enums

- `escrow_status`: awaiting_deposit, deposited, pending_release, disputed, released, refunded
- `offer_status`: active, paused, completed, cancelled, expired
- `kyc_status`: pending, approved, rejected, expired
- `verification_level`: unverified, verified, trusted, suspicious
- `dispute_status`: open, in_review, resolved, escalated, closed

---

## 🧪 Testing

### Local Development

1. Start Supabase local:
   ```bash
   npm run db:studio
   ```

2. Run Supabase in background:
   ```bash
   supabase start
   ```

3. View logs:
   ```bash
   supabase logs
   ```

4. Stop Supabase:
   ```bash
   supabase stop
   ```

### Reset Database

```bash
npm run db:reset
```

⚠️ **Warning**: This deletes all data!

---

## 📈 Real-time Updates

Supabase supports real-time subscriptions. Coming soon!

```typescript
// Subscribe to trade status changes
const channel = supabase
  .channel('trade-updates')
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'trades',
      filter: `escrow_status=eq.pending_release`,
    },
    (payload) => {
      console.log('Trade updated:', payload.new)
    }
  )
  .subscribe()
```

---

## 🐛 Troubleshooting

### Connection Issues

1. Check Supabase status:
   ```bash
   supabase status
   ```

2. Verify `.env.local` has correct keys

3. Check network tab for CORS errors

### Authentication Issues

1. Verify email auth is enabled in Supabase dashboard

2. Check RLS policies allow public reads

3. Verify Supabase URL and anon key are correct

### Database Errors

1. Check migration status:
   ```bash
   supabase db diff
   ```

2. Verify schema matches your code

3. Check error messages in browser console

---

## 📚 Next Steps

1. ✅ Set up Supabase project
2. ✅ Push database schema
3. ✅ Configure environment variables
4. ✅ Connect frontend to Supabase
5. 🔄 Implement real-time subscriptions
6. 🔄 Add admin dashboard
7. 🔄 Implement webhooks for smart contract events
8. 🔄 Add data validation & error handling

---

## 🤝 Support

- Supabase Docs: https://supabase.com/docs
- Supabase Discord: https://discord.supabase.com
- Issue Tracker: (your project's issue tracker)

---

## 📄 License

MIT License - see main LICENSE file

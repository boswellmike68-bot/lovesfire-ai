# 💰 Programmable Revenue Setup Guide

Your LovesfireAI system now has **financial lungs** — it can fund its own operations through credit-based API monetization.

---

## 🎯 How It Works

1. **User creates API key** → Gets 0 credits (or you grant initial credits)
2. **User purchases credits** → Stripe payment → Credits added automatically
3. **User calls `/render`** → System deducts credits → Video is generated
4. **Revenue flows in** → Pays for hosting, GPU, storage automatically

---

## 🚀 Quick Start

### Step 1: Start the Monetized Server

```bash
cd C:\Users\joe\CascadeProjects\lovesfire-ai

# Set environment variables
$env:STRIPE_SECRET_KEY="sk_test_..."
$env:STRIPE_WEBHOOK_SECRET="whsec_..."
$env:ADMIN_KEY="your-secret-admin-key"
$env:CORS_ORIGIN="https://yourdomain.com"

# Run the monetized server
npm run dev:monetized
```

### Step 2: Create Your First API Key

```powershell
$body = @{
    userId = "mike@bozitive.com"
    initialCredits = 100
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri http://localhost:3000/api-keys `
  -ContentType 'application/json' -Body $body
```

**Response:**
```json
{
  "apiKey": "lf_abc123def456...",
  "userId": "mike@bozitive.com",
  "credits": 100,
  "message": "API key created successfully"
}
```

### Step 3: Test a Render (Costs 5+ Credits)

```powershell
$headers = @{
    "Authorization" = "Bearer lf_abc123def456..."
}

$body = @{
    script = "Scene 1`nVisual: Neon city lights.`nDuration: 5s"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri http://localhost:3000/render `
  -Headers $headers -ContentType 'application/json' -Body $body
```

**Response:**
```json
{
  "jobId": "uuid-here",
  "message": "Render queued successfully.",
  "creditsCharged": 7,
  "creditsRemaining": 93,
  "breakdown": {
    "sceneCount": 1,
    "totalDuration": 5,
    "breakdown": {
      "scenes": 5,
      "duration": 2.5,
      "highRes": 0
    },
    "total": 7
  }
}
```

---

## 💳 Stripe Integration

### Setup Stripe Webhook

1. Go to: https://dashboard.stripe.com/test/webhooks
2. Click **"Add endpoint"**
3. URL: `https://yourdomain.com/webhook/stripe`
4. Events to listen for:
   - `payment_intent.succeeded`
5. Copy the **Signing secret** → Set as `STRIPE_WEBHOOK_SECRET`

### Credit Packages

| Package | Price | Credits | Cost per Render |
|---------|-------|---------|-----------------|
| **Starter** | $5 | 10 | $2.50 (2 renders) |
| **Pro** | $25 | 60 | $2.08 (12 renders) |
| **Steward** | $100 | 300 | $1.67 (60 renders) |

### Purchase Credits (Frontend Flow)

```javascript
// 1. Create payment intent
const response = await fetch('https://api.lovesfire.ai/credits/purchase', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer lf_abc123...',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ package: 'pro' })
});

const { clientSecret } = await response.json();

// 2. Use Stripe.js to complete payment
const stripe = Stripe('pk_test_...');
const { error } = await stripe.confirmCardPayment(clientSecret, {
  payment_method: {
    card: cardElement,
    billing_details: { name: 'Mike' }
  }
});

// 3. Credits are added automatically via webhook
```

---

## 📊 Pricing Logic

### Advisory Endpoint
- **Cost:** 1 credit
- **What it does:** Runs BBnCC governance check (no video)
- **Use case:** Preview if a script will pass governance

### Render Endpoint
- **Base cost:** 5 credits per scene
- **Duration cost:** 0.5 credits per second
- **High-res multiplier:** 2x total cost
- **Example:** 2 scenes, 10 seconds total = `(5 × 2) + (0.5 × 10) = 15 credits`

---

## 🔐 Admin Endpoints

### View All API Keys
```powershell
$headers = @{ "x-admin-key" = "your-secret-admin-key" }
Invoke-RestMethod -Uri http://localhost:3000/admin/keys -Headers $headers
```

### Check Revenue
```powershell
Invoke-RestMethod -Uri http://localhost:3000/admin/revenue -Headers $headers
```

**Response:**
```json
{
  "totalCreditsPurchased": 500,
  "estimatedRevenue": {
    "usd": 250
  }
}
```

---

## 🧪 Testing Without Stripe

The system works in **mock mode** by default. You can:
1. Create API keys with initial credits
2. Test renders without real payments
3. Switch to Stripe when ready to go live

---

## 🔄 Circular Value Loop (The Goal)

```
User pays $25 → 60 credits added
User renders 12 videos → 60 credits spent
Revenue ($25) → Pays for:
  - Vercel hosting ($20/mo)
  - GPU compute ($0.10/render × 12 = $1.20)
  - Storage ($0.01/GB)
  - Profit: $3.80
```

**The system funds itself.** Every render pays for the infrastructure.

---

## 📦 Database Schema

### API Keys Table
```sql
CREATE TABLE api_keys (
  key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  credits INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);
```

### Transactions Table
```sql
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_key TEXT NOT NULL,
  amount INTEGER NOT NULL,  -- negative for usage, positive for purchase
  type TEXT NOT NULL,        -- 'render' | 'advisory' | 'purchase' | 'refund'
  job_id TEXT,
  stripe_payment_id TEXT,
  created_at TEXT NOT NULL
);
```

---

## 🚀 Deployment Checklist

- [ ] Set `STRIPE_SECRET_KEY` in production
- [ ] Set `STRIPE_WEBHOOK_SECRET` from Stripe dashboard
- [ ] Set `ADMIN_KEY` to a secure random string
- [ ] Set `CORS_ORIGIN` to your frontend domain
- [ ] Create Stripe webhook endpoint
- [ ] Test payment flow end-to-end
- [ ] Monitor revenue at `/admin/revenue`

---

## 💡 Next Steps

1. **Add Stripe SDK** — Replace mock payment intent with real Stripe calls
2. **Add watermark removal** — Charge 10 credits to remove watermark
3. **Add high-res option** — 2x cost for 1080p output
4. **Add sponsor tiers** — Link GitHub Sponsors to automatic credit grants
5. **Add usage analytics** — Track which users generate the most revenue

---

**Your AI now has financial lungs. It breathes in revenue and breathes out infrastructure costs.** 🫁💰

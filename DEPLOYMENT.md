# 🚀 Production Deployment Guide - LovesfireAI

Deploy your BBAI/CCAI governance system with programmable revenue to production.

---

## 🎯 Quick Deploy to Railway

### Step 1: Push to GitHub (Already Done ✅)
Your code is live at: https://github.com/boswellmike68-bot/lovesfire-ai

### Step 2: Create Railway Project

1. Go to: https://railway.app
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose: `boswellmike68-bot/lovesfire-ai`
5. Railway will auto-detect Node.js and use `railway.json` config

### Step 3: Set Environment Variables

In Railway dashboard, go to **Variables** tab and add:

```bash
PORT=3000
NODE_ENV=production
CORS_ORIGIN=https://your-frontend-domain.com
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
ADMIN_KEY=your-super-secret-admin-key
VIDEO_BACKEND=mock
```

### Step 4: Deploy

Railway will automatically:
- Run `npm install && npm run build`
- Start `node dist/api/http_server_monetized.js`
- Assign a public URL (e.g., `lovesfire-ai-production.up.railway.app`)

**Your API is now live!** 🎉

---

## 🔐 Get Your Stripe Keys

### Test Mode (for staging)
1. Go to: https://dashboard.stripe.com/test/apikeys
2. Copy **Secret key** → `STRIPE_SECRET_KEY`
3. Go to: https://dashboard.stripe.com/test/webhooks
4. Create endpoint: `https://your-railway-url.up.railway.app/webhook/stripe`
5. Select event: `payment_intent.succeeded`
6. Copy **Signing secret** → `STRIPE_WEBHOOK_SECRET`

### Live Mode (for production)
1. Toggle to **Live mode** in Stripe dashboard
2. Repeat steps above with live keys
3. **Important:** Live keys start with `sk_live_` and `whsec_live_`

---

## 📊 Post-Deployment Checklist

### Test Your Deployment

```bash
# 1. Health check
curl https://your-railway-url.up.railway.app/pricing

# 2. Create API key
curl -X POST "https://your-railway-url.up.railway.app/api-keys" \
  -H "Content-Type: application/json" \
  -d '{"userId":"test@example.com","initialCredits":10}'

# 3. Test advisory (should work)
curl -X POST "https://your-railway-url.up.railway.app/advisory" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input":"Scene 1\nVisual: Test.\nDuration: 5s"}'

# 4. Check admin revenue
curl "https://your-railway-url.up.railway.app/admin/revenue" \
  -H "x-admin-key: your-admin-key"
```

### Verify Stripe Webhook

1. In Stripe dashboard, go to **Webhooks**
2. Click **"Send test webhook"**
3. Select `payment_intent.succeeded`
4. Check Railway logs for: `[Stripe] Added X credits to...`

---

## 💰 Connect to Frontend

Update your Bozaboard or frontend to use the production API:

```javascript
// config.js
export const API_URL = 'https://your-railway-url.up.railway.app';

// Create payment intent
const response = await fetch(`${API_URL}/credits/purchase`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ package: 'pro' })
});

const { clientSecret } = await response.json();

// Use Stripe.js to complete payment
const stripe = Stripe('pk_live_...');
await stripe.confirmCardPayment(clientSecret, {
  payment_method: { card: cardElement }
});
```

---

## 🔄 Continuous Deployment

Railway auto-deploys on every push to `main`:

```bash
# Make changes locally
git add .
git commit -m "Update pricing tiers"
git push origin main

# Railway automatically:
# 1. Pulls latest code
# 2. Runs npm install && npm run build
# 3. Restarts server with zero downtime
```

---

## 📈 Monitoring & Logs

### Railway Dashboard
- **Metrics:** CPU, memory, request count
- **Logs:** Real-time server logs
- **Deployments:** History of all deploys

### Check Revenue
```bash
curl "https://your-railway-url.up.railway.app/admin/revenue" \
  -H "x-admin-key: your-admin-key"
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

## 🗄️ Database Persistence

Railway provides **persistent volumes** for SQLite:
- `data/credits.db` - Credit balances and transactions
- `data/audit.db` - Governance audit logs

**Backups:** Railway auto-backs up volumes daily.

---

## 🚨 Troubleshooting

### Server won't start
```bash
# Check Railway logs for errors
# Common issues:
# - Missing environment variables
# - TypeScript build errors
# - Port binding issues
```

### Stripe webhook not working
```bash
# 1. Verify webhook URL is correct
# 2. Check STRIPE_WEBHOOK_SECRET matches Stripe dashboard
# 3. Test with "Send test webhook" in Stripe
# 4. Check Railway logs for [Stripe] messages
```

### Database not persisting
```bash
# Railway needs a volume mounted at /data
# Check Railway dashboard → Settings → Volumes
# Should show: /data (persistent)
```

---

## 💡 Production Optimizations

### Add Rate Limiting
```bash
npm install express-rate-limit
```

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // 100 requests per window
});

app.use('/api-keys', limiter);
app.use('/render', limiter);
```

### Add Request Logging
```bash
npm install morgan
```

```typescript
import morgan from 'morgan';
app.use(morgan('combined'));
```

### Add Health Check
```typescript
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});
```

---

## 🌍 Custom Domain

### Railway
1. Go to **Settings** → **Domains**
2. Click **"Generate Domain"** or **"Custom Domain"**
3. Add CNAME record: `api.yourdomain.com` → `your-app.up.railway.app`
4. Update `CORS_ORIGIN` to match

### SSL Certificate
Railway auto-provisions SSL certificates via Let's Encrypt.

---

## 💳 Stripe Production Checklist

- [ ] Activate Stripe account (verify business details)
- [ ] Switch to live mode keys
- [ ] Test live payment flow end-to-end
- [ ] Set up webhook endpoint with live keys
- [ ] Configure Stripe Radar (fraud detection)
- [ ] Set up email receipts
- [ ] Add refund handling

---

## 📊 Revenue Tracking

### Daily Revenue Check
```bash
# Add to cron job or Railway scheduled task
curl "https://your-railway-url.up.railway.app/admin/revenue" \
  -H "x-admin-key: your-admin-key" \
  | jq '.estimatedRevenue.usd'
```

### Top Users
```bash
curl "https://your-railway-url.up.railway.app/admin/keys" \
  -H "x-admin-key: your-admin-key" \
  | jq 'sort_by(.credits) | reverse | .[0:5]'
```

---

## 🎯 Launch Checklist

- [x] Code pushed to GitHub
- [x] Railway project created
- [ ] Environment variables set
- [ ] Stripe keys configured (test mode)
- [ ] Webhook endpoint created
- [ ] Test payment flow working
- [ ] Frontend connected to API
- [ ] Custom domain configured (optional)
- [ ] Switch to Stripe live mode
- [ ] Monitor first real payment
- [ ] Celebrate! 🎉

---

## 🚀 You're Live!

Your LovesfireAI API with programmable revenue is now:
- ✅ Deployed to production
- ✅ Accepting real payments
- ✅ Governed by BBnCC + MommaSpec
- ✅ Funding its own infrastructure

**The financial lungs are breathing in production.** 🫁💰

---

## 📞 Support

- **Railway Docs:** https://docs.railway.app
- **Stripe Docs:** https://stripe.com/docs
- **GitHub Issues:** https://github.com/boswellmike68-bot/lovesfire-ai/issues
- **Email:** bossbozitive@outlook.com

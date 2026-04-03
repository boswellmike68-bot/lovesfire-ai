# Production Deployment Guide - LovesfireAI

Deploy your BBAI/CCAI governance system with programmable revenue to production.

---

## CRITICAL: Persistent Storage Setup

**Your SQLite databases MUST be on a persistent volume or users will lose credits on server restart.**

Most container hosts use ephemeral file systems by default. Configure persistent storage **immediately after creating your project**:

1. Create a persistent volume on your deployment platform.
2. Name it: `lovesfire-data`
3. Set the `DATA_DIR` environment variable to the volume mount path.
4. Attach the volume to your service.

**Without this, your `credits.db` and `audit.db` will be deleted on every deploy.**

---

## Quick Deploy

### Step 1: Push to GitHub (Already Done)
Your code is live at: https://github.com/boswellmike68-bot/lovesfire-ai

### Step 2: Create Project on Your Container Host

1. Sign in to your deployment platform.
2. Create a new project.
3. Connect your GitHub repo: `boswellmike68-bot/lovesfire-ai`
4. The platform should auto-detect Node.js.

### Step 3: Set Environment Variables

In your deployment platform's dashboard, add:

```bash
PORT=3000
NODE_ENV=production
DATA_DIR=/data
CORS_ORIGIN=https://your-frontend-domain.com
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
ADMIN_KEY=your-super-secret-admin-key
VIDEO_BACKEND=mock
```

### Step 4: Deploy

The deployment platform will:
- Install dependencies and FFmpeg (ensure FFmpeg is available in your runtime environment)
- Run `npm install && npm run build`
- Start `node dist/api/http_server_monetized.js`
- Assign a public URL

**Your API is now live!**

**Note:** FFmpeg must be available in the runtime environment for video rendering. Configure your container or build system to include it.

---

## Get Your Stripe Keys

### Test Mode (for staging)
1. Go to: https://dashboard.stripe.com/test/apikeys
2. Copy **Secret key** → `STRIPE_SECRET_KEY`
3. Go to: https://dashboard.stripe.com/test/webhooks
4. Create endpoint: `https://YOUR_PRODUCTION_URL/webhook/stripe`
5. Select event: `payment_intent.succeeded`
6. Copy **Signing secret** → `STRIPE_WEBHOOK_SECRET`

### Live Mode (for production)
1. Toggle to **Live mode** in Stripe dashboard
2. Repeat steps above with live keys
3. **Important:** Live keys start with `sk_live_` and `whsec_live_`

---

## Post-Deployment Checklist

### Test Your Deployment

```bash
# 1. Health check
curl https://YOUR_PRODUCTION_URL/pricing

# 2. Create API key
curl -X POST "https://YOUR_PRODUCTION_URL/api-keys" \
  -H "Content-Type: application/json" \
  -d '{"userId":"test@example.com","initialCredits":10}'

# 3. Test advisory (should work)
curl -X POST "https://YOUR_PRODUCTION_URL/advisory" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input":"Scene 1\nVisual: Test.\nDuration: 5s"}'

# 4. Check admin revenue
curl "https://YOUR_PRODUCTION_URL/admin/revenue" \
  -H "x-admin-key: your-admin-key"
```

### Verify Stripe Webhook

1. In Stripe dashboard, go to **Webhooks**
2. Click **"Send test webhook"**
3. Select `payment_intent.succeeded`
4. Check server logs for: `[Stripe] Added X credits to...`

---

## Connect to Frontend

Update your Bozaboard or frontend to use the production API:

```javascript
// config.js
export const API_URL = 'https://YOUR_PRODUCTION_URL';

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

## Continuous Deployment

Configure your deployment platform to auto-deploy on every push to `main`:

```bash
# Make changes locally
git add .
git commit -m "Update pricing tiers"
git push origin main

# The deployment platform automatically:
# 1. Pulls latest code
# 2. Runs npm install && npm run build
# 3. Restarts server with zero downtime
```

---

## Monitoring & Logs

### Platform Dashboard
- **Metrics:** CPU, memory, request count
- **Logs:** Real-time server logs
- **Deployments:** History of all deploys

### Check Revenue
```bash
curl "https://YOUR_PRODUCTION_URL/admin/revenue" \
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

## Database Persistence

Configure a **persistent volume** on your deployment platform for SQLite:
- `data/credits.db` - Credit balances and transactions
- `data/audit.db` - Governance audit logs

**Backups:** Enable automatic backups on your persistent volume.

---

## Troubleshooting

### Server won't start
```bash
# Check server logs for errors
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
# 4. Check server logs for [Stripe] messages
```

### Database not persisting
```bash
# Ensure DATA_DIR env var points to a persistent volume
# Check your deployment platform's volume settings
# The volume should be mounted at the DATA_DIR path
```

---

## Production Optimizations

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

## Custom Domain

### Setup
1. Go to your deployment platform's **Domains** settings.
2. Add a custom domain or generate a platform domain.
3. Add CNAME record: `api.yourdomain.com` → your platform-assigned URL.
4. Update `CORS_ORIGIN` to match.

### SSL Certificate
Most deployment platforms auto-provision SSL certificates via Let's Encrypt.

---

## Stripe Production Checklist

- [ ] Activate Stripe account (verify business details)
- [ ] Switch to live mode keys
- [ ] Test live payment flow end-to-end
- [ ] Set up webhook endpoint with live keys
- [ ] Configure Stripe Radar (fraud detection)
- [ ] Set up email receipts
- [ ] Add refund handling

---

## Revenue Tracking

### Daily Revenue Check
```bash
# Add to cron job or scheduled task
curl "https://YOUR_PRODUCTION_URL/admin/revenue" \
  -H "x-admin-key: your-admin-key" \
  | jq '.estimatedRevenue.usd'
```

### Top Users
```bash
curl "https://YOUR_PRODUCTION_URL/admin/keys" \
  -H "x-admin-key: your-admin-key" \
  | jq 'sort_by(.credits) | reverse | .[0:5]'
```

---

## Launch Checklist

- [x] Code pushed to GitHub
- [ ] Deployment project created on container host
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

## You're Live!

Your LovesfireAI API with programmable revenue is now:
- ✅ Deployed to production
- ✅ Accepting real payments
- ✅ Governed by BBnCC + MommaSpec
- ✅ Funding its own infrastructure

**The financial lungs are breathing in production.** 🫁💰

---

## Support

- **Stripe Docs:** https://stripe.com/docs
- **GitHub Issues:** https://github.com/boswellmike68-bot/lovesfire-ai/issues
- **Email:** bossbozitive@outlook.com

# 🧪 LovesfireAI Monetization Test Commands

Quick reference for testing the programmable revenue system.

---

## 🔑 Create API Key

### PowerShell
```powershell
$body = @{
    userId = "mike@bozitive.com"
    initialCredits = 10
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri http://localhost:3000/api-keys `
  -ContentType 'application/json' -Body $body
```

### curl (Windows)
```bash
curl -X POST "http://localhost:3000/api-keys" ^
  -H "Content-Type: application/json" ^
  -d "{\"userId\":\"mike@bozitive.com\",\"initialCredits\":10}"
```

### curl (Linux/Mac)
```bash
curl -X POST "http://localhost:3000/api-keys" \
  -H "Content-Type: application/json" \
  -d '{"userId":"mike@bozitive.com","initialCredits":10}'
```

**Response:**
```json
{
  "apiKey": "lf_abc123def456...",
  "userId": "mike@bozitive.com",
  "credits": 10,
  "message": "API key created successfully"
}
```

---

## 💳 Check Credit Balance

### PowerShell
```powershell
$headers = @{
    "Authorization" = "Bearer lf_abc123def456..."
}

Invoke-RestMethod -Uri http://localhost:3000/credits -Headers $headers
```

### curl
```bash
curl -X GET "http://localhost:3000/credits" \
  -H "Authorization: Bearer lf_abc123def456..."
```

**Response:**
```json
{
  "apiKey": "lf_abc123def456...",
  "userId": "mike@bozitive.com",
  "balance": 10,
  "recentTransactions": []
}
```

---

## 🎬 Test Advisory (Costs 1 Credit)

### PowerShell
```powershell
$headers = @{
    "Authorization" = "Bearer lf_abc123def456..."
}

$body = @{
    input = "Scene 1`nVisual: A calm sunset over a lake.`nDuration: 5s"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri http://localhost:3000/advisory `
  -Headers $headers -ContentType 'application/json' -Body $body
```

### curl
```bash
curl -X POST "http://localhost:3000/advisory" \
  -H "Authorization: Bearer lf_abc123def456..." \
  -H "Content-Type: application/json" \
  -d '{"input":"Scene 1\nVisual: A calm sunset over a lake.\nDuration: 5s"}'
```

**Response:**
```json
{
  "success": true,
  "message": "Scene 1: A calm sunset over a lake.",
  "governanceStamp": "abc123...",
  "specVersion": "1.0.0",
  "sceneCount": 1,
  "warnings": [],
  "creditsCharged": 1,
  "creditsRemaining": 9
}
```

---

## 🎥 Test Render (Costs 5+ Credits)

### PowerShell
```powershell
$headers = @{
    "Authorization" = "Bearer lf_abc123def456..."
}

$body = @{
    script = "Scene 1`nVisual: Neon city lights with glitch effects.`nStyle: cyber fade`nMotion: zoom in`nBPM: 140`nIntensity: high`nDuration: 5s"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri http://localhost:3000/render `
  -Headers $headers -ContentType 'application/json' -Body $body
```

### curl
```bash
curl -X POST "http://localhost:3000/render" \
  -H "Authorization: Bearer lf_abc123def456..." \
  -H "Content-Type: application/json" \
  -d '{"script":"Scene 1\nVisual: Neon city lights.\nDuration: 5s"}'
```

**Response:**
```json
{
  "jobId": "uuid-here",
  "message": "Render queued successfully.",
  "governanceStamp": "abc123...",
  "specVersion": "1.0.0",
  "warnings": [],
  "creditsCharged": 7,
  "creditsRemaining": 2,
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

## 💰 Purchase Credits (Mock Mode)

### PowerShell
```powershell
$headers = @{
    "Authorization" = "Bearer lf_abc123def456..."
}

$body = @{
    package = "pro"  # starter | pro | steward
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri http://localhost:3000/credits/purchase `
  -Headers $headers -ContentType 'application/json' -Body $body
```

### curl
```bash
curl -X POST "http://localhost:3000/credits/purchase" \
  -H "Authorization: Bearer lf_abc123def456..." \
  -H "Content-Type: application/json" \
  -d '{"package":"pro"}'
```

**Response (Mock):**
```json
{
  "clientSecret": "pi_mock_abc123",
  "amount": 2500,
  "credits": 60,
  "package": "pro"
}
```

---

## 📊 View Pricing

### PowerShell
```powershell
Invoke-RestMethod -Uri http://localhost:3000/pricing
```

### curl
```bash
curl -X GET "http://localhost:3000/pricing"
```

**Response:**
```json
{
  "packages": {
    "starter": { "price": 500, "credits": 10 },
    "pro": { "price": 2500, "credits": 60 },
    "steward": { "price": 10000, "credits": 300 }
  },
  "costs": {
    "advisory": 1,
    "renderPerScene": 5,
    "renderPerSecond": 0.5
  }
}
```

---

## 🔐 Admin: List All API Keys

### PowerShell
```powershell
$headers = @{
    "x-admin-key" = "your-secret-admin-key"
}

Invoke-RestMethod -Uri http://localhost:3000/admin/keys -Headers $headers
```

### curl
```bash
curl -X GET "http://localhost:3000/admin/keys" \
  -H "x-admin-key: your-secret-admin-key"
```

**Response:**
```json
[
  {
    "key": "lf_abc123...",
    "userId": "mike@bozitive.com",
    "credits": 2,
    "createdAt": "2026-04-03T06:00:00.000Z",
    "lastUsedAt": "2026-04-03T06:30:00.000Z"
  }
]
```

---

## 💵 Admin: Check Revenue

### PowerShell
```powershell
$headers = @{
    "x-admin-key" = "your-secret-admin-key"
}

Invoke-RestMethod -Uri http://localhost:3000/admin/revenue -Headers $headers
```

### curl
```bash
curl -X GET "http://localhost:3000/admin/revenue" \
  -H "x-admin-key: your-secret-admin-key"
```

**Response:**
```json
{
  "totalCreditsPurchased": 70,
  "estimatedRevenue": {
    "usd": 35
  }
}
```

---

## 🚀 Full Test Flow

```powershell
# 1. Start the monetized server
npm run dev:monetized

# 2. Create API key
$response = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api-keys `
  -ContentType 'application/json' `
  -Body '{"userId":"test@example.com","initialCredits":20}'

$apiKey = $response.apiKey
Write-Host "API Key: $apiKey"

# 3. Check balance
$headers = @{ "Authorization" = "Bearer $apiKey" }
Invoke-RestMethod -Uri http://localhost:3000/credits -Headers $headers

# 4. Test advisory (1 credit)
$body = '{"input":"Scene 1\nVisual: Test scene.\nDuration: 3s"}'
Invoke-RestMethod -Method Post -Uri http://localhost:3000/advisory `
  -Headers $headers -ContentType 'application/json' -Body $body

# 5. Test render (7 credits)
$body = '{"script":"Scene 1\nVisual: Neon lights.\nDuration: 5s"}'
$job = Invoke-RestMethod -Method Post -Uri http://localhost:3000/render `
  -Headers $headers -ContentType 'application/json' -Body $body

# 6. Check remaining balance
Invoke-RestMethod -Uri http://localhost:3000/credits -Headers $headers
# Should show: balance = 12 (20 - 1 - 7)
```

---

## 🐛 Test Error Cases

### Insufficient Credits
```powershell
# Create key with only 1 credit
$response = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api-keys `
  -ContentType 'application/json' `
  -Body '{"userId":"broke@example.com","initialCredits":1}'

$apiKey = $response.apiKey
$headers = @{ "Authorization" = "Bearer $apiKey" }

# Try to render (costs 7 credits) - should fail with 402
$body = '{"script":"Scene 1\nVisual: Test.\nDuration: 5s"}'
Invoke-RestMethod -Method Post -Uri http://localhost:3000/render `
  -Headers $headers -ContentType 'application/json' -Body $body
```

**Expected Error:**
```json
{
  "error": "Insufficient credits",
  "required": 7,
  "balance": 1,
  "breakdown": {...},
  "hint": "Purchase more credits at /credits/purchase"
}
```

### Invalid API Key
```powershell
$headers = @{ "Authorization" = "Bearer lf_invalid_key" }
Invoke-RestMethod -Uri http://localhost:3000/credits -Headers $headers
```

**Expected Error:**
```json
{
  "error": "Invalid API key",
  "hint": "Get your API key from the dashboard or contact support"
}
```

### Missing Authorization Header
```powershell
Invoke-RestMethod -Uri http://localhost:3000/credits
```

**Expected Error:**
```json
{
  "error": "Missing or invalid Authorization header",
  "hint": "Include \"Authorization: Bearer YOUR_API_KEY\" in your request"
}
```

---

## 📝 Environment Variables

Before running `npm run dev:monetized`, set these:

```powershell
$env:STRIPE_SECRET_KEY = "sk_test_..."
$env:STRIPE_WEBHOOK_SECRET = "whsec_..."
$env:ADMIN_KEY = "super-secret-admin-key"
$env:CORS_ORIGIN = "http://localhost:8080"
$env:PORT = "3000"
```

---

**Your financial lungs are ready to breathe.** 🫁💰

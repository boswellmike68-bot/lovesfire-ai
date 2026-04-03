# LovesfireAI Smoke Test Script
# Run after every deploy to verify core monetization flows
# Usage: .\scripts\smoke-test.ps1 -BaseUrl "https://your-app.up.railway.app"

param(
    [string]$BaseUrl = "http://localhost:3000",
    [string]$AdminKey = "your-secret-admin-key"
)

$ErrorActionPreference = "Stop"
$pass = 0
$fail = 0

function Test($name, $block) {
    try {
        & $block
        Write-Host "  PASS: $name" -ForegroundColor Green
        $script:pass++
    } catch {
        Write-Host "  FAIL: $name - $_" -ForegroundColor Red
        $script:fail++
    }
}

Write-Host "`n=== LOVESFIRE SMOKE TEST ===" -ForegroundColor Cyan
Write-Host "Target: $BaseUrl`n"

# 1. Pricing endpoint (no auth)
Test "GET /pricing returns packages" {
    $r = Invoke-RestMethod -Uri "$BaseUrl/pricing"
    if (-not $r.packages.starter) { throw "Missing starter package" }
}

# 2. Create API key
$apiKey = $null
Test "POST /api-keys creates key with credits" {
    $body = '{"userId":"smoke-test","initialCredits":20}'
    $r = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api-keys" -ContentType 'application/json' -Body $body
    if (-not $r.apiKey) { throw "No apiKey returned" }
    $script:apiKey = $r.apiKey
}

# 3. Check balance
Test "GET /credits shows 20 credits" {
    $h = @{ "Authorization" = "Bearer $apiKey" }
    $r = Invoke-RestMethod -Uri "$BaseUrl/credits" -Headers $h
    if ($r.balance -ne 20) { throw "Expected 20, got $($r.balance)" }
}

# 4. Advisory (1 credit)
Test "POST /advisory deducts 1 credit" {
    $h = @{ "Authorization" = "Bearer $apiKey" }
    $b = '{"input":"Scene 1\nVisual: Test.\nDuration: 3s"}'
    $r = Invoke-RestMethod -Method Post -Uri "$BaseUrl/advisory" -Headers $h -ContentType 'application/json' -Body $b
    if ($r.creditsRemaining -ne 19) { throw "Expected 19, got $($r.creditsRemaining)" }
}

# 5. Render (costs credits)
Test "POST /render queues job and deducts credits" {
    $h = @{ "Authorization" = "Bearer $apiKey" }
    $b = '{"script":"Scene 1\nVisual: Neon city.\nDuration: 5s"}'
    $r = Invoke-RestMethod -Method Post -Uri "$BaseUrl/render" -Headers $h -ContentType 'application/json' -Body $b
    if (-not $r.jobId) { throw "No jobId returned" }
    if ($r.creditsCharged -lt 1) { throw "No credits charged" }
}

# 6. Zero-credit rejection
Test "POST /render rejects with 0 credits (HTTP 402)" {
    $body = '{"userId":"zero-smoke","initialCredits":0}'
    $r = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api-keys" -ContentType 'application/json' -Body $body
    $h = @{ "Authorization" = "Bearer $($r.apiKey)" }
    $b = '{"script":"Scene 1\nVisual: Test.\nDuration: 5s"}'
    try {
        Invoke-RestMethod -Method Post -Uri "$BaseUrl/render" -Headers $h -ContentType 'application/json' -Body $b
        throw "Should have failed"
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -ne 402) { throw "Expected 402, got $($_.Exception.Response.StatusCode.value__)" }
    }
}

# 7. Invalid API key
Test "Invalid API key returns 401" {
    $h = @{ "Authorization" = "Bearer lf_invalid_key" }
    try {
        Invoke-RestMethod -Uri "$BaseUrl/credits" -Headers $h
        throw "Should have failed"
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -ne 401) { throw "Expected 401" }
    }
}

# 8. Missing auth header
Test "Missing auth returns 401" {
    try {
        Invoke-RestMethod -Uri "$BaseUrl/credits"
        throw "Should have failed"
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -ne 401) { throw "Expected 401" }
    }
}

Write-Host "`n=== RESULTS ===" -ForegroundColor Cyan
Write-Host "  Passed: $pass" -ForegroundColor Green
Write-Host "  Failed: $fail" -ForegroundColor $(if ($fail -gt 0) { "Red" } else { "Green" })

if ($fail -gt 0) { exit 1 }
Write-Host "`nAll smoke tests passed!" -ForegroundColor Green

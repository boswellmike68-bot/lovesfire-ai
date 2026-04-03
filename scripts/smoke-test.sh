#!/usr/bin/env bash
# LovesfireAI Smoke Test (curl version)
# Usage: ./scripts/smoke-test.sh [BASE_URL]
# Default: http://localhost:3000

set -euo pipefail

BASE="${1:-http://localhost:3000}"
PASS=0
FAIL=0

green() { printf "\033[32m  PASS: %s\033[0m\n" "$1"; PASS=$((PASS+1)); }
red()   { printf "\033[31m  FAIL: %s — %s\033[0m\n" "$1" "$2"; FAIL=$((FAIL+1)); }

echo ""
echo "=== LOVESFIRE SMOKE TEST (curl) ==="
echo "Target: $BASE"
echo ""

# 1. Pricing (no auth)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/pricing")
[ "$STATUS" = "200" ] && green "GET /pricing" || red "GET /pricing" "HTTP $STATUS"

# 2. Create API key
RESP=$(curl -s -X POST "$BASE/api-keys" -H "Content-Type: application/json" -d '{"userId":"smoke-test","initialCredits":20}')
KEY=$(echo "$RESP" | grep -o '"apiKey":"[^"]*"' | cut -d'"' -f4)
[ -n "$KEY" ] && green "POST /api-keys" || red "POST /api-keys" "No key returned"

# 3. Check balance
BALANCE=$(curl -s "$BASE/credits" -H "Authorization: Bearer $KEY" | grep -o '"balance":[0-9]*' | cut -d: -f2)
[ "$BALANCE" = "20" ] && green "GET /credits (balance=20)" || red "GET /credits" "balance=$BALANCE"

# 4. Advisory (1 credit)
REMAINING=$(curl -s -X POST "$BASE/advisory" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"input":"Scene 1\nVisual: Test.\nDuration: 3s"}' | grep -o '"creditsRemaining":[0-9]*' | cut -d: -f2)
[ "$REMAINING" = "19" ] && green "POST /advisory (remaining=19)" || red "POST /advisory" "remaining=$REMAINING"

# 5. Render (costs credits)
JOB=$(curl -s -X POST "$BASE/render" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"script":"Scene 1\nVisual: Neon city.\nDuration: 5s"}' | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)
[ -n "$JOB" ] && green "POST /render (jobId=$JOB)" || red "POST /render" "No jobId"

# 6. Zero-credit rejection (402)
ZERO_RESP=$(curl -s -X POST "$BASE/api-keys" -H "Content-Type: application/json" -d '{"userId":"zero-smoke","initialCredits":0}')
ZERO_KEY=$(echo "$ZERO_RESP" | grep -o '"apiKey":"[^"]*"' | cut -d'"' -f4)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/render" -H "Authorization: Bearer $ZERO_KEY" \
  -H "Content-Type: application/json" -d '{"script":"Scene 1\nVisual: Test.\nDuration: 5s"}')
[ "$STATUS" = "402" ] && green "Zero-credit rejection (402)" || red "Zero-credit rejection" "HTTP $STATUS"

# 7. Invalid key (401)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/credits" -H "Authorization: Bearer lf_invalid")
[ "$STATUS" = "401" ] && green "Invalid key rejection (401)" || red "Invalid key" "HTTP $STATUS"

# 8. Missing auth (401)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/credits")
[ "$STATUS" = "401" ] && green "Missing auth rejection (401)" || red "Missing auth" "HTTP $STATUS"

echo ""
echo "=== RESULTS ==="
echo "  Passed: $PASS"
echo "  Failed: $FAIL"
[ "$FAIL" -gt 0 ] && exit 1
echo ""
echo "All smoke tests passed!"

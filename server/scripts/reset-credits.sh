#!/bin/bash

# Helper script to reset credits to 1000 for testing
# Usage: ./scripts/reset-credits.sh YOUR_USER_ID

if [ -z "$1" ]; then
  echo "Usage: ./scripts/reset-credits.sh YOUR_USER_ID"
  echo ""
  echo "Example: ./scripts/reset-credits.sh abc123xyz"
  exit 1
fi

USER_ID=$1
API_URL=${2:-"http://localhost:3001"}

echo "🔄 Resetting credits to 1000 for user: $USER_ID"
echo ""

curl -X POST "$API_URL/api/credits/reset-for-testing" \
  -H "Content-Type: application/json" \
  -d "{\"userId\": \"$USER_ID\"}" \
  | python3 -m json.tool || cat

echo ""
echo "✅ Done! Refresh your browser to see updated credits."

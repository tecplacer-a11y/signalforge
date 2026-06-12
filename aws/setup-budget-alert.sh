#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Cost guardrail: email alerts when monthly AWS spend crosses thresholds.
# Alerts at 80% actual, 100% actual, and 100% FORECAST of the budget —
# the forecast alert warns you mid-month before the money is spent.
#
# Note: a budget can't stop spending by itself, but this stack has no
# auto-scaling anywhere (ECS desired-count is fixed at 1), so costs are
# structurally flat; the alert catches surprises (data transfer, attacks).
#
# Usage (CloudShell):
#   ACCOUNT_ID=410883543761 EMAIL=vito@iconstafflabs.com LIMIT=100 \
#   ./aws/setup-budget-alert.sh
# ─────────────────────────────────────────────────────────────
set -euo pipefail

: "${ACCOUNT_ID:?set ACCOUNT_ID}"
: "${EMAIL:?set EMAIL (where alerts go)}"
: "${LIMIT:=100}"   # monthly budget in USD

NAME="signalforge-monthly"

if aws budgets describe-budget --account-id "$ACCOUNT_ID" --budget-name "$NAME" >/dev/null 2>&1; then
  echo "Budget '$NAME' already exists — leaving it as-is."
  echo "To change it: delete in Console → Billing → Budgets, then re-run."
  exit 0
fi

aws budgets create-budget --account-id "$ACCOUNT_ID" \
  --budget "{
    \"BudgetName\": \"$NAME\",
    \"BudgetLimit\": { \"Amount\": \"$LIMIT\", \"Unit\": \"USD\" },
    \"TimeUnit\": \"MONTHLY\",
    \"BudgetType\": \"COST\"
  }" \
  --notifications-with-subscribers "[
    { \"Notification\": { \"NotificationType\": \"ACTUAL\",     \"ComparisonOperator\": \"GREATER_THAN\", \"Threshold\": 80,  \"ThresholdType\": \"PERCENTAGE\" },
      \"Subscribers\": [{ \"SubscriptionType\": \"EMAIL\", \"Address\": \"$EMAIL\" }] },
    { \"Notification\": { \"NotificationType\": \"ACTUAL\",     \"ComparisonOperator\": \"GREATER_THAN\", \"Threshold\": 100, \"ThresholdType\": \"PERCENTAGE\" },
      \"Subscribers\": [{ \"SubscriptionType\": \"EMAIL\", \"Address\": \"$EMAIL\" }] },
    { \"Notification\": { \"NotificationType\": \"FORECASTED\", \"ComparisonOperator\": \"GREATER_THAN\", \"Threshold\": 100, \"ThresholdType\": \"PERCENTAGE\" },
      \"Subscribers\": [{ \"SubscriptionType\": \"EMAIL\", \"Address\": \"$EMAIL\" }] }
  ]"

echo "Budget '$NAME' created: \$$LIMIT/month, alerts to $EMAIL at 80%, 100%, and forecasted-100%."

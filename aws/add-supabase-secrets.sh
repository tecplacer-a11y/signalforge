#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Phase 1 rollout step: store Supabase Auth credentials, re-register the
# task definition (which now references them), and roll the ECS service.
# Run AFTER the Phase 1 image has deployed successfully with auth disabled.
#
# Usage (CloudShell, from the repo root):
#   ACCOUNT_ID=410883543761 REGION=us-east-1 \
#   SUPABASE_URL=https://xxxx.supabase.co \
#   SUPABASE_ANON_KEY=eyJ... \
#   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
#   ./aws/add-supabase-secrets.sh
#
# Values come from: Supabase dashboard → Project Settings → API
# Idempotent — safe to re-run (updates secret values in place).
# ─────────────────────────────────────────────────────────────
set -euo pipefail

: "${ACCOUNT_ID:?set ACCOUNT_ID}"
: "${REGION:=us-east-1}"
: "${SUPABASE_URL:?set SUPABASE_URL (https://<project>.supabase.co)}"
: "${SUPABASE_ANON_KEY:?set SUPABASE_ANON_KEY}"
: "${SUPABASE_SERVICE_ROLE_KEY:?set SUPABASE_SERVICE_ROLE_KEY}"
CLUSTER="${CLUSTER:-signalforge}"
SERVICE="${SERVICE:-signalforge}"

echo "==> [1/3] Store Supabase secrets in Secrets Manager"
put_secret() {
  local name="signalforge/$1" value="$2"
  if aws secretsmanager describe-secret --secret-id "$name" --region "$REGION" >/dev/null 2>&1; then
    aws secretsmanager put-secret-value --secret-id "$name" \
      --secret-string "$value" --region "$REGION" >/dev/null
    echo "    updated $name"
  else
    aws secretsmanager create-secret --name "$name" \
      --secret-string "$value" --region "$REGION" >/dev/null
    echo "    created $name"
  fi
}
put_secret SUPABASE_URL "$SUPABASE_URL"
put_secret SUPABASE_ANON_KEY "$SUPABASE_ANON_KEY"
put_secret SUPABASE_SERVICE_ROLE_KEY "$SUPABASE_SERVICE_ROLE_KEY"

echo "==> [2/3] Re-register task definition (now injects SUPABASE_* env)"
TMP_TD=$(mktemp)
sed -e "s|<ACCOUNT_ID>|${ACCOUNT_ID}|g" -e "s|<REGION>|${REGION}|g" \
  aws/ecs-task-def.json > "$TMP_TD"
aws ecs register-task-definition --cli-input-json "file://$TMP_TD" --region "$REGION" >/dev/null
rm -f "$TMP_TD"
echo "    registered new revision of family 'signalforge'"

echo "==> [3/3] Roll the service onto the new revision"
aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" \
  --task-definition signalforge --force-new-deployment --region "$REGION" >/dev/null
echo "    deployment started — watch: aws ecs describe-services --cluster $CLUSTER --services $SERVICE --region $REGION --query 'services[0].deployments'"

echo
echo "Done. When the new task is healthy, the app shows the login screen."
echo "Sign up your account in the UI, then link it to the default org so it"
echo "sees the existing data (see PHASE1-DEPLOY.md step 5)."

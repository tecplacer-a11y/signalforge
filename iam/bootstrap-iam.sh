#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# One-shot IAM bootstrap for SignalForge on AWS (ECS + GitHub OIDC).
# Creates: GitHub OIDC provider, deploy role, ECS execution role,
# ECS task role — with all policies attached.
# Run from repo root after editing the JSON placeholders OR pass vars:
#   ACCOUNT_ID=123456789012 REGION=us-east-1 \
#   GH_OWNER=vito GH_REPO=signalforge ./iam/bootstrap-iam.sh
# Idempotent: re-running updates policies, skips existing resources.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

: "${ACCOUNT_ID:?set ACCOUNT_ID}"
: "${REGION:=us-east-1}"
: "${GH_OWNER:?set GH_OWNER}"
: "${GH_REPO:?set GH_REPO}"

DIR="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Substitute placeholders into temp copies
render() {
  sed -e "s/<ACCOUNT_ID>/$ACCOUNT_ID/g" \
      -e "s/<REGION>/$REGION/g" \
      -e "s/<GH_OWNER>/$GH_OWNER/g" \
      -e "s/<GH_REPO>/$GH_REPO/g" "$1" > "$TMP/$(basename "$1")"
  echo "$TMP/$(basename "$1")"
}

echo "==> [1/4] GitHub OIDC provider"
OIDC_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_ARN" >/dev/null 2>&1; then
  echo "    exists, skipping"
else
  aws iam create-open-id-connect-provider \
    --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com \
    --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 >/dev/null
  echo "    created"
fi

create_role() {  # name  trust-file
  local name="$1" trust="$2"
  if aws iam get-role --role-name "$name" >/dev/null 2>&1; then
    aws iam update-assume-role-policy --role-name "$name" --policy-document "file://$trust" >/dev/null
    echo "    $name exists, trust updated"
  else
    aws iam create-role --role-name "$name" --assume-role-policy-document "file://$trust" >/dev/null
    echo "    $name created"
  fi
}

echo "==> [2/4] GitHub deploy role"
create_role signalforgeGitHubDeploy "$(render "$DIR/github-oidc-deploy-role-trust.json")"
aws iam put-role-policy --role-name signalforgeGitHubDeploy --policy-name deploy \
  --policy-document "file://$(render "$DIR/github-oidc-deploy-policy.json")" >/dev/null
echo "    deploy policy attached"

echo "==> [3/4] ECS execution role"
create_role signalforgeExecutionRole "$(render "$DIR/ecs-tasks-trust.json")"
aws iam attach-role-policy --role-name signalforgeExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy >/dev/null 2>&1 || true
aws iam put-role-policy --role-name signalforgeExecutionRole --policy-name secrets \
  --policy-document "file://$(render "$DIR/ecs-execution-policy.json")" >/dev/null
echo "    managed exec policy + secrets policy attached"

echo "==> [4/4] ECS task role"
create_role signalforgeTaskRole "$(render "$DIR/ecs-tasks-trust.json")"
aws iam put-role-policy --role-name signalforgeTaskRole --policy-name runtime \
  --policy-document "file://$(render "$DIR/ecs-task-policy.json")" >/dev/null
echo "    runtime policy attached"

echo ""
echo "Done. Set these in GitHub repo Settings → Actions:"
echo "  Secret  AWS_DEPLOY_ROLE_ARN = arn:aws:iam::${ACCOUNT_ID}:role/signalforgeGitHubDeploy"
echo "  Vars    AWS_REGION=${REGION}  AWS_ACCOUNT_ID=${ACCOUNT_ID}  ECR_REPOSITORY=signalforge"
echo "          DEPLOY_TARGET=ecs  ECS_CLUSTER=signalforge  ECS_SERVICE=signalforge"

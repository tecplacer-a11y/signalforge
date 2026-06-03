#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# SignalForge — build image, push to ECR. Run from repo root.
# Prereqs: aws CLI v2 configured (aws configure), Docker running.
# Usage:  ACCOUNT_ID=123456789012 REGION=us-east-1 ./aws/deploy.sh
# ─────────────────────────────────────────────────────────────
set -euo pipefail

: "${ACCOUNT_ID:?set ACCOUNT_ID}"
: "${REGION:=us-east-1}"
REPO="signalforge"
TAG="${TAG:-latest}"
ECR="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
IMAGE="${ECR}/${REPO}:${TAG}"

echo "==> Ensuring ECR repo ${REPO} exists"
aws ecr describe-repositories --repository-names "$REPO" --region "$REGION" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "$REPO" --region "$REGION" >/dev/null

echo "==> Logging Docker into ECR"
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$ECR"

echo "==> Building image (linux/amd64 for Fargate/App Runner)"
docker build --platform linux/amd64 -t "$IMAGE" .

echo "==> Pushing ${IMAGE}"
docker push "$IMAGE"

echo "==> Done. Image: ${IMAGE}"
echo "    Next: deploy via App Runner or ECS (see aws/README in AWS_DEPLOY.md)."

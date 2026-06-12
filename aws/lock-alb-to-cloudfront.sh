#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Close the http side door: restrict the ALB so ONLY CloudFront can reach
# it. Replaces the 0.0.0.0/0 port-80 ingress rule on the ALB's security
# group with the AWS-managed CloudFront origin-facing prefix list.
#
# After this runs, the old http://signalforge-alb-... URL stops responding
# for the public internet; all traffic must come through
# https://<dist>.cloudfront.net.
#
# Usage (CloudShell, from the repo root):
#   REGION=us-east-1 ./aws/lock-alb-to-cloudfront.sh
#
# Idempotent — safe to re-run. To UNDO (reopen the ALB):
#   aws ec2 authorize-security-group-ingress --group-id <SG_ID> \
#     --protocol tcp --port 80 --cidr 0.0.0.0/0 --region us-east-1
# ─────────────────────────────────────────────────────────────
set -euo pipefail

: "${REGION:=us-east-1}"
ALB_NAME="${ALB_NAME:-signalforge-alb}"

echo "==> [1/3] Find the ALB security group"
SG_ID=$(aws elbv2 describe-load-balancers --names "$ALB_NAME" \
  --query 'LoadBalancers[0].SecurityGroups[0]' --output text --region "$REGION")
echo "    ALB security group: $SG_ID"

echo "==> [2/3] Find CloudFront's origin-facing managed prefix list"
PL_ID=$(aws ec2 describe-managed-prefix-lists \
  --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing \
  --query 'PrefixLists[0].PrefixListId' --output text --region "$REGION")
echo "    prefix list: $PL_ID"

echo "==> [3/3] Swap ingress: allow CloudFront, drop 0.0.0.0/0"
# add CloudFront prefix list (idempotent: ignore duplicate-rule error)
aws ec2 authorize-security-group-ingress --group-id "$SG_ID" \
  --ip-permissions "IpProtocol=tcp,FromPort=80,ToPort=80,PrefixListIds=[{PrefixListId=${PL_ID},Description=CloudFront origin-facing only}]" \
  --region "$REGION" >/dev/null 2>&1 \
  && echo "    added CloudFront prefix-list rule" \
  || echo "    CloudFront prefix-list rule already present"

# remove the open-to-the-world rule (idempotent: ignore not-found error)
aws ec2 revoke-security-group-ingress --group-id "$SG_ID" \
  --protocol tcp --port 80 --cidr 0.0.0.0/0 --region "$REGION" >/dev/null 2>&1 \
  && echo "    removed 0.0.0.0/0 rule" \
  || echo "    0.0.0.0/0 rule was not present"

echo
echo "Done. Verify:"
echo "  curl -s -o /dev/null -w '%{http_code}\\n' --max-time 8 http://${ALB_NAME}-*.elb.amazonaws.com/healthz   # should TIME OUT"
echo "  https://<your-distribution>.cloudfront.net  # should work normally"

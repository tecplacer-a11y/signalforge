#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# HTTPS for SignalForge without a custom domain: CloudFront in front of
# the ALB. You get https://dXXXXXXXX.cloudfront.net with TLS at the edge
# (CloudFront default certificate). Also re-registers the task definition
# so the app trusts two proxy hops (CloudFront → ALB → app).
#
# Usage (CloudShell, from the repo root):
#   ACCOUNT_ID=410883543761 REGION=us-east-1 \
#   ALB_DNS=signalforge-alb-1486905421.us-east-1.elb.amazonaws.com \
#   ./aws/setup-cloudfront.sh
#
# Idempotent: if a distribution tagged for signalforge already exists,
# it is reused. Distribution deployment takes ~5-10 minutes.
# Custom domain later: add an ACM cert (us-east-1) + alias to this
# distribution, then CNAME your domain to the cloudfront.net address.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

: "${ACCOUNT_ID:?set ACCOUNT_ID}"
: "${REGION:=us-east-1}"
: "${ALB_DNS:?set ALB_DNS (the ALB hostname, no scheme)}"
CLUSTER="${CLUSTER:-signalforge}"
SERVICE="${SERVICE:-signalforge}"
COMMENT="signalforge-https"

# AWS managed policy IDs (global constants, same in every account):
CACHE_DISABLED="4135ea2d-6df8-44a3-9df3-4b5a84be39ad"       # CachingDisabled
CACHE_OPTIMIZED="658327ea-f89d-4fab-a63d-7e88639e58f6"      # CachingOptimized
ORP_ALL_VIEWER_CF="33f36d7e-f396-46d9-90e0-52428a34d9dc"    # AllViewerAndCloudFrontHeaders-2022-06

echo "==> [1/3] CloudFront distribution"
EXISTING=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='${COMMENT}'].[Id,DomainName,Status]" \
  --output text 2>/dev/null || true)

if [ -n "$EXISTING" ] && [ "$EXISTING" != "None" ]; then
  DIST_ID=$(echo "$EXISTING" | awk '{print $1}')
  DOMAIN=$(echo "$EXISTING" | awk '{print $2}')
  echo "    reusing existing distribution $DIST_ID ($DOMAIN)"
else
  CFG=$(mktemp)
  cat > "$CFG" << EOF
{
  "CallerReference": "signalforge-$(date +%s)",
  "Comment": "${COMMENT}",
  "Enabled": true,
  "PriceClass": "PriceClass_100",
  "HttpVersion": "http2and3",
  "Origins": {
    "Quantity": 1,
    "Items": [{
      "Id": "signalforge-alb",
      "DomainName": "${ALB_DNS}",
      "CustomOriginConfig": {
        "HTTPPort": 80,
        "HTTPSPort": 443,
        "OriginProtocolPolicy": "http-only",
        "OriginSslProtocols": { "Quantity": 1, "Items": ["TLSv1.2"] },
        "OriginReadTimeout": 60,
        "OriginKeepaliveTimeout": 5
      }
    }]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "signalforge-alb",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 7,
      "Items": ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"],
      "CachedMethods": { "Quantity": 2, "Items": ["GET","HEAD"] }
    },
    "Compress": true,
    "CachePolicyId": "${CACHE_DISABLED}",
    "OriginRequestPolicyId": "${ORP_ALL_VIEWER_CF}"
  },
  "CacheBehaviors": {
    "Quantity": 1,
    "Items": [{
      "PathPattern": "/assets/*",
      "TargetOriginId": "signalforge-alb",
      "ViewerProtocolPolicy": "redirect-to-https",
      "AllowedMethods": {
        "Quantity": 2,
        "Items": ["GET","HEAD"],
        "CachedMethods": { "Quantity": 2, "Items": ["GET","HEAD"] }
      },
      "Compress": true,
      "CachePolicyId": "${CACHE_OPTIMIZED}"
    }]
  }
}
EOF
  CREATED=$(aws cloudfront create-distribution --distribution-config "file://$CFG")
  rm -f "$CFG"
  DIST_ID=$(echo "$CREATED" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['Distribution']['Id'])")
  DOMAIN=$(echo "$CREATED" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['Distribution']['DomainName'])")
  echo "    created distribution $DIST_ID ($DOMAIN)"
fi

echo "==> [2/3] Re-register task definition (TRUST_PROXY_HOPS=2 for CF→ALB→app)"
TMP_TD=$(mktemp)
sed -e "s|<ACCOUNT_ID>|${ACCOUNT_ID}|g" -e "s|<REGION>|${REGION}|g" \
  aws/ecs-task-def.json > "$TMP_TD"
aws ecs register-task-definition --cli-input-json "file://$TMP_TD" --region "$REGION" >/dev/null
rm -f "$TMP_TD"
echo "    registered new revision"

echo "==> [3/3] Roll the ECS service"
aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" \
  --task-definition signalforge --force-new-deployment --region "$REGION" >/dev/null
echo "    deployment started"

echo
echo "HTTPS URL (live in ~5-10 min once Status=Deployed):"
echo "    https://${DOMAIN}"
echo "Check status:  aws cloudfront get-distribution --id ${DIST_ID} --query 'Distribution.Status' --output text"
echo
echo "Use the https:// URL from now on. The old http:// ALB URL keeps working"
echo "for now; lock it down later by restricting the ALB security group to"
echo "CloudFront's prefix list (com.amazonaws.global.cloudfront.origin-facing)."

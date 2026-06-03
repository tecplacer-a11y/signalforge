#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# One-shot ECS Fargate + ALB setup for SignalForge.
# Run AFTER iam/bootstrap-iam.sh and aws/provision-rds.sh.
# Creates: placeholder secrets, CloudWatch log group, ECR repo,
# task definition, ECS cluster, security group, ALB + target group
# + listener, and the ECS service. Idempotent — safe to re-run.
#
# Usage (single line in CloudShell):
#   ACCOUNT_ID=410883543761 REGION=us-east-1 VPC_SG_ID=sg-xxxx ./aws/setup-ecs.sh
#
# VPC_SG_ID = your default SG (the one RDS uses), so the task can reach RDS:5432.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

: "${ACCOUNT_ID:?set ACCOUNT_ID}"
: "${REGION:=us-east-1}"
: "${VPC_SG_ID:?set VPC_SG_ID (default SG that RDS uses)}"
CLUSTER="${CLUSTER:-signalforge}"
SERVICE="${SERVICE:-signalforge}"
ECR_REPO="${ECR_REPO:-signalforge}"
FAMILY="signalforge"
CONTAINER_PORT=5000

echo "==> [1/9] Placeholder secrets (so the task can start even if unused)"
for k in HUNTER_API_KEY ANTHROPIC_API_KEY SLACK_WEBHOOK_URL AIRTABLE_API_KEY; do
  aws secretsmanager create-secret --name "signalforge/$k" \
    --secret-string "REPLACE_ME" --region "$REGION" >/dev/null 2>&1 \
    && echo "    created signalforge/$k" \
    || echo "    signalforge/$k already exists (left as-is)"
done

echo "==> [2/9] CloudWatch log group"
aws logs create-log-group --log-group-name /ecs/signalforge --region "$REGION" >/dev/null 2>&1 \
  && echo "    created /ecs/signalforge" || echo "    /ecs/signalforge already exists"

echo "==> [3/9] ECR repository"
aws ecr create-repository --repository-name "$ECR_REPO" --region "$REGION" >/dev/null 2>&1 \
  && echo "    created $ECR_REPO" || echo "    $ECR_REPO already exists"

echo "==> [4/9] Ensure a bootstrap image exists in ECR (so the service can start before first push)"
# Push a tiny placeholder only if no :latest tag exists yet.
if ! aws ecr describe-images --repository-name "$ECR_REPO" --image-ids imageTag=latest \
      --region "$REGION" >/dev/null 2>&1; then
  echo "    no :latest image yet — service will be created with desired-count 0;"
  echo "    your first 'git push' to main builds + pushes the image, then scale up."
  BOOTSTRAP_DESIRED=0
else
  echo "    :latest image present"
  BOOTSTRAP_DESIRED=1
fi

echo "==> [5/9] Render + register task definition"
TMP_TD=$(mktemp)
sed -e "s|<ACCOUNT_ID>|${ACCOUNT_ID}|g" -e "s|<REGION>|${REGION}|g" \
  aws/ecs-task-def.json > "$TMP_TD"
aws ecs register-task-definition --cli-input-json "file://$TMP_TD" --region "$REGION" >/dev/null
echo "    registered task def family '$FAMILY'"
rm -f "$TMP_TD"

echo "==> [6/9] ECS cluster"
aws ecs create-cluster --cluster-name "$CLUSTER" --region "$REGION" >/dev/null 2>&1 \
  && echo "    created cluster $CLUSTER" || echo "    cluster $CLUSTER already exists"

echo "==> [7/9] Networking: default VPC, subnets, ALB security group"
VPC_ID=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true \
  --query 'Vpcs[0].VpcId' --output text --region "$REGION")
SUBNETS=$(aws ec2 describe-subnets --filters Name=vpc-id,Values="$VPC_ID" \
  --query 'Subnets[].SubnetId' --output text --region "$REGION")
SUBNET_CSV=$(echo "$SUBNETS" | tr '\t' ',')
echo "    VPC=$VPC_ID  subnets=$SUBNET_CSV"

# ALB security group (allow HTTP 80 from internet)
ALB_SG=$(aws ec2 describe-security-groups \
  --filters Name=group-name,Values=signalforge-alb-sg Name=vpc-id,Values="$VPC_ID" \
  --query 'SecurityGroups[0].GroupId' --output text --region "$REGION" 2>/dev/null)
if [ "$ALB_SG" = "None" ] || [ -z "$ALB_SG" ]; then
  ALB_SG=$(aws ec2 create-security-group --group-name signalforge-alb-sg \
    --description "SignalForge ALB" --vpc-id "$VPC_ID" \
    --query 'GroupId' --output text --region "$REGION")
  aws ec2 authorize-security-group-ingress --group-id "$ALB_SG" \
    --protocol tcp --port 80 --cidr 0.0.0.0/0 --region "$REGION" >/dev/null
  echo "    created ALB SG $ALB_SG (HTTP 80 open)"
else
  echo "    ALB SG $ALB_SG already exists"
fi

# Allow ALB SG -> task SG on container port (task uses the RDS default SG)
aws ec2 authorize-security-group-ingress --group-id "$VPC_SG_ID" \
  --protocol tcp --port "$CONTAINER_PORT" --source-group "$ALB_SG" \
  --region "$REGION" >/dev/null 2>&1 \
  && echo "    allowed ALB->task on $CONTAINER_PORT" \
  || echo "    ALB->task rule already present"

echo "==> [8/9] ALB + target group + listener"
ALB_ARN=$(aws elbv2 describe-load-balancers --names signalforge-alb \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text --region "$REGION" 2>/dev/null)
if [ "$ALB_ARN" = "None" ] || [ -z "$ALB_ARN" ]; then
  ALB_ARN=$(aws elbv2 create-load-balancer --name signalforge-alb \
    --subnets $SUBNETS --security-groups "$ALB_SG" --type application \
    --query 'LoadBalancers[0].LoadBalancerArn' --output text --region "$REGION")
  echo "    created ALB"
else
  echo "    ALB already exists"
fi

TG_ARN=$(aws elbv2 describe-target-groups --names signalforge-tg \
  --query 'TargetGroups[0].TargetGroupArn' --output text --region "$REGION" 2>/dev/null)
if [ "$TG_ARN" = "None" ] || [ -z "$TG_ARN" ]; then
  TG_ARN=$(aws elbv2 create-target-group --name signalforge-tg \
    --protocol HTTP --port "$CONTAINER_PORT" --vpc-id "$VPC_ID" \
    --target-type ip --health-check-path /healthz \
    --health-check-protocol HTTP --matcher HttpCode=200 \
    --query 'TargetGroups[0].TargetGroupArn' --output text --region "$REGION")
  echo "    created target group (health check /healthz)"
else
  echo "    target group already exists"
fi

LISTENER_ARN=$(aws elbv2 describe-listeners --load-balancer-arn "$ALB_ARN" \
  --query 'Listeners[?Port==`80`].ListenerArn' --output text --region "$REGION" 2>/dev/null)
if [ -z "$LISTENER_ARN" ] || [ "$LISTENER_ARN" = "None" ]; then
  aws elbv2 create-listener --load-balancer-arn "$ALB_ARN" \
    --protocol HTTP --port 80 \
    --default-actions Type=forward,TargetGroupArn="$TG_ARN" \
    --region "$REGION" >/dev/null
  echo "    created HTTP:80 listener -> target group"
else
  echo "    listener already exists"
fi

echo "==> [9/9] ECS service"
if aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" \
     --region "$REGION" --query 'services[0].status' --output text 2>/dev/null \
     | grep -q ACTIVE; then
  echo "    service exists — updating to use latest task def + target group"
  aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" \
    --task-definition "$FAMILY" --region "$REGION" >/dev/null
  echo "    updated."
else
  aws ecs create-service --cluster "$CLUSTER" --service-name "$SERVICE" \
    --task-definition "$FAMILY" --desired-count "$BOOTSTRAP_DESIRED" \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_CSV],securityGroups=[$VPC_SG_ID],assignPublicIp=ENABLED}" \
    --load-balancers "targetGroupArn=$TG_ARN,containerName=signalforge,containerPort=$CONTAINER_PORT" \
    --health-check-grace-period-seconds 60 \
    --region "$REGION" >/dev/null
  echo "    created service '$SERVICE' (desired-count $BOOTSTRAP_DESIRED)"
fi

ALB_DNS=$(aws elbv2 describe-load-balancers --load-balancer-arns "$ALB_ARN" \
  --query 'LoadBalancers[0].DNSName' --output text --region "$REGION")

echo ""
echo "──────────────────────────────────────────────────────────────"
echo "Done. App URL (live after first deploy): http://${ALB_DNS}"
echo ""
if [ "$BOOTSTRAP_DESIRED" = "0" ]; then
  echo "No image in ECR yet. Next:"
  echo "  1. git push origin main   (CI/CD builds + pushes image, then deploys)"
  echo "  2. If the service stays at 0 tasks, scale it up once:"
  echo "       aws ecs update-service --cluster $CLUSTER --service $SERVICE \\"
  echo "         --desired-count 1 --region $REGION"
fi
echo "Health check: http://${ALB_DNS}/healthz  -> should return 200"
echo "──────────────────────────────────────────────────────────────"

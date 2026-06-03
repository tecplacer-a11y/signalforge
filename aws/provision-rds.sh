#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Provision a Postgres instance on AWS RDS for SignalForge and
# store its connection string in Secrets Manager.
# Usage: REGION=us-east-1 DB_PASSWORD='choose-a-strong-pw' \
#        VPC_SG_ID=sg-xxxx SUBNET_GROUP=default ./aws/provision-rds.sh
# ─────────────────────────────────────────────────────────────
set -euo pipefail

: "${REGION:=us-east-1}"
: "${DB_PASSWORD:?set DB_PASSWORD}"
DB_ID="${DB_ID:-signalforge-db}"
DB_NAME="${DB_NAME:-signalforge}"
DB_USER="${DB_USER:-signalforge}"
CLASS="${CLASS:-db.t3.micro}"
STORAGE="${STORAGE:-20}"

echo "==> Creating RDS Postgres instance ${DB_ID} (this takes ~5-10 min)"
aws rds create-db-instance \
  --db-instance-identifier "$DB_ID" \
  --db-name "$DB_NAME" \
  --engine postgres \
  --engine-version 16 \
  --db-instance-class "$CLASS" \
  --allocated-storage "$STORAGE" \
  --master-username "$DB_USER" \
  --master-user-password "$DB_PASSWORD" \
  --backup-retention-period 7 \
  --no-publicly-accessible \
  ${VPC_SG_ID:+--vpc-security-group-ids "$VPC_SG_ID"} \
  --region "$REGION" >/dev/null

echo "==> Waiting for instance to become available..."
aws rds wait db-instance-available --db-instance-identifier "$DB_ID" --region "$REGION"

ENDPOINT=$(aws rds describe-db-instances --db-instance-identifier "$DB_ID" \
  --region "$REGION" --query 'DBInstances[0].Endpoint.Address' --output text)

DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${ENDPOINT}:5432/${DB_NAME}"

echo "==> Storing DATABASE_URL in Secrets Manager (signalforge/DATABASE_URL)"
aws secretsmanager create-secret --name signalforge/DATABASE_URL \
  --secret-string "$DATABASE_URL" --region "$REGION" >/dev/null 2>&1 \
  || aws secretsmanager put-secret-value --secret-id signalforge/DATABASE_URL \
       --secret-string "$DATABASE_URL" --region "$REGION" >/dev/null

echo "==> RDS endpoint: ${ENDPOINT}"
echo "==> DATABASE_URL stored in Secrets Manager."
echo "    NOTE: the app container must run in a subnet/SG that can reach RDS on 5432."

# SignalForge — AWS Production Deployment

This guide takes SignalForge from the repo to a running production service on AWS,
backed by **PostgreSQL on Amazon RDS**. Two container hosting options are covered:
**App Runner** (simplest) and **ECS Fargate** (more control). Pick one.

---

## 0. Architecture

```
        ┌──────────────┐        HTTPS         ┌─────────────────────────┐
 users ─┤ App Runner / ├──────────────────────┤  SignalForge container  │
        │  ALB + ECS   │   :5000  /healthz     │  (Node 20, dist/index)  │
        └──────────────┘                       └────────────┬────────────┘
                                                            │ 5432
                                                  ┌─────────▼──────────┐
                                                  │  Postgres on RDS    │
                                                  └─────────────────────┘
        Secrets (DATABASE_URL, HUNTER_API_KEY, ...) ── AWS Secrets Manager
```

- **One container image**, built from the repo `Dockerfile` (multi-stage: Vite client + esbuild server bundle → slim Node 20 runtime).
- **DATABASE_URL** and all provider keys come from **Secrets Manager** — nothing sensitive in code or task defs.
- Health check path: **`GET /healthz`** (returns `{ "status": "ok" }`, no DB dependency).
- App listens on **`PORT`** (default 5000).

---

## 1. Prerequisites

- AWS CLI v2 configured: `aws configure` (set your account + region).
- Docker installed and running.
- An ECR repo (the deploy script creates it for you).
- A VPC with private subnets for RDS; the app and DB must share network reachability on 5432.

Set common vars in your shell:

```bash
export ACCOUNT_ID=123456789012      # your AWS account id
export REGION=us-east-1
```

---

## 2. Provision Postgres (RDS)

```bash
DB_PASSWORD='choose-a-strong-password' \
VPC_SG_ID=sg-xxxxxxxx \              # SG that allows 5432 from the app
./aws/provision-rds.sh
```

This creates a `db.t3.micro` Postgres 16 instance (`signalforge-db`), waits for it,
builds the `DATABASE_URL`, and stores it in Secrets Manager as `signalforge/DATABASE_URL`.

> The app auto-creates its tables on first boot (`ensureSchema()` runs idempotent
> `CREATE TABLE IF NOT EXISTS` DDL), so no manual migration step is required.
> If you prefer managed migrations, run `npm run db:push` with `DATABASE_URL` set.

Store provider secrets too (only the ones you use):

```bash
for k in HUNTER_API_KEY ANTHROPIC_API_KEY SLACK_WEBHOOK_URL AIRTABLE_API_KEY; do
  aws secretsmanager create-secret --name "signalforge/$k" \
    --secret-string "REPLACE_ME" --region "$REGION" 2>/dev/null \
  || echo "secret signalforge/$k already exists — update via put-secret-value"
done
```

> Security: rotate the old Hunter key that was hardcoded in the n8n JSON before going live.

---

## 3. Build & push the image

```bash
ACCOUNT_ID=$ACCOUNT_ID REGION=$REGION ./aws/deploy.sh
```

Produces and pushes `…dkr.ecr.$REGION.amazonaws.com/signalforge:latest`
(built `--platform linux/amd64` for Fargate/App Runner).

---

## 4a. Deploy on App Runner (simplest)

Console path:
1. App Runner → Create service → Source: **Container registry** → your ECR image.
2. Deployment: Automatic (redeploys on new `:latest` push).
3. Port: **5000**. Health check: **HTTP**, path **`/healthz`**.
4. Environment variables: `NODE_ENV=production`, `PORT=5000`.
5. Add **DATABASE_URL** and provider keys as secrets referencing Secrets Manager.
6. Instance role must allow `secretsmanager:GetSecretValue` on `signalforge/*`.
7. Networking: attach a **VPC connector** in subnets that can reach RDS on 5432.

App Runner gives you an HTTPS URL on launch. Done.

---

## 4b. Deploy on ECS Fargate (more control)

```bash
# 1. Edit aws/ecs-task-def.json: replace <ACCOUNT_ID>, <REGION>, secret ARNs.
# 2. Register the task definition:
aws ecs register-task-definition --cli-input-json file://aws/ecs-task-def.json --region $REGION

# 3. Create a cluster (once):
aws ecs create-cluster --cluster-name signalforge --region $REGION

# 4. Create a service behind an ALB (target group health check path = /healthz, port 5000).
#    Use the console or `aws ecs create-service` with your subnets/SGs/target group.
```

IAM roles needed:
- **Execution role** (`signalforgeExecutionRole`): pull from ECR + read Secrets Manager + write CloudWatch logs.
- **Task role** (`signalforgeTaskRole`): any AWS APIs the app calls at runtime (usually none).

ALB health check: protocol HTTP, path `/healthz`, success code 200.

---

## 5. Seed demo data (optional)

The app boots empty (just schema). To load the 15-lead demo dataset in production,
run the seed once against the production DB from a trusted machine:

```bash
DATABASE_URL="$(aws secretsmanager get-secret-value --secret-id signalforge/DATABASE_URL \
  --region $REGION --query SecretString --output text)" \
npx tsx server/seed.ts
```

(Or skip seeding and start ingesting real leads via the configured intake sources.)

---

## 6. Smoke test

```bash
BASE=https://your-service-url
curl -s $BASE/healthz                 # {"status":"ok"}
curl -s $BASE/api/dashboard | jq .    # KPIs
curl -s $BASE/api/leads | jq 'length' # lead count
curl -s -X POST $BASE/api/runs -H 'content-type: application/json' -d '{"channel":"all"}'
```

---

## 7. Local production-parity (before AWS)

Verify the whole stack on your laptop with the same Postgres topology:

```bash
docker compose up --build      # app on :5000, Postgres on :5432
open http://localhost:5000
```

---

## 8. Updating the deployment

```bash
# rebuild + push a new image
ACCOUNT_ID=$ACCOUNT_ID REGION=$REGION TAG=latest ./aws/deploy.sh
# App Runner: auto-redeploys on push (if automatic).
# ECS: force a new deployment:
aws ecs update-service --cluster signalforge --service signalforge \
  --force-new-deployment --region $REGION
```

---

## 9. Cost & sizing notes

- `db.t3.micro` RDS + 1 small App Runner/Fargate task is a low-cost starting point.
- Scale RDS class and task CPU/memory as lead volume grows.
- Enable RDS automated backups (script sets 7-day retention) and Multi-AZ for HA when you go critical.

---

## 10. IAM roles (turnkey)

Three roles drive the whole flow. Create them all in one shot:

```bash
ACCOUNT_ID=$ACCOUNT_ID REGION=$REGION \
GH_OWNER=<your-gh-user-or-org> GH_REPO=signalforge \
./iam/bootstrap-iam.sh
```

This creates the GitHub OIDC provider + the roles below and prints the exact
GitHub repo Secrets/Variables to set. Details and a manual path are in `iam/README.md`.

| Role | Purpose |
|---|---|
| `signalforgeGitHubDeploy` | Assumed by GitHub Actions via OIDC — push to ECR, deploy ECS/App Runner |
| `signalforgeExecutionRole` | ECS pulls the image, reads `signalforge/*` secrets, writes logs |
| `signalforgeTaskRole` | The running app (minimal — no AWS APIs needed) |

The OIDC trust only allows `repo:<owner>/<repo>:ref:refs/heads/main` to assume the
deploy role, so no long-lived AWS keys ever live in GitHub.

---

## 11. CI/CD with GitHub Actions

The workflow at `.github/workflows/deploy.yml` runs on every push to `main`:

1. **CI** — `npm ci`, `tsc` typecheck, `npm run build` (also runs on PRs).
2. **Deploy** (main only) — assume the OIDC role, build the image, push to ECR
   (`:<git-sha>` + `:latest`), then either force a new ECS deployment (and wait
   until the service is stable) or trigger an App Runner deployment.

**Setup (one time):**

1. Run `./iam/bootstrap-iam.sh` (section 10).
2. In GitHub → repo **Settings → Secrets and variables → Actions**:
   - **Secret:** `AWS_DEPLOY_ROLE_ARN` = `arn:aws:iam::<ACCOUNT_ID>:role/signalforgeGitHubDeploy`
   - **Variables:** `AWS_REGION`, `AWS_ACCOUNT_ID`, `ECR_REPOSITORY=signalforge`,
     `DEPLOY_TARGET` (`ecs` or `apprunner`).
     - For ECS: also `ECS_CLUSTER=signalforge`, `ECS_SERVICE=signalforge`.
     - For App Runner: also `APPRUNNER_SERVICE_ARN`.
3. Push to `main` → the pipeline builds, pushes, and deploys automatically.
   You can also trigger it manually from the Actions tab (`workflow_dispatch`).

After CI/CD is wired, `aws/deploy.sh` is only needed for the very first manual
push (or local one-off builds); subsequent deploys happen on merge.

---

## 12. Environment variables reference

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string (from RDS) |
| `PORT` | no (default 5000) | HTTP port the server binds |
| `NODE_ENV` | yes (`production`) | Production mode |
| `HUNTER_API_KEY` | if Hunter active | Enrichment/verification/discovery |
| `ANTHROPIC_API_KEY` | if Claude extract active | Email lead extraction |
| `SLACK_WEBHOOK_URL` | if Slack alerts active | Hot/warm lead alerts |
| `AIRTABLE_API_KEY` | if Airtable tracking active | Lead sync to Airtable |

See `.env.example` for the full list and local defaults.

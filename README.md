# SignalForge

A commercial-grade BD signal pipeline — the production rewrite of the
"Phase 1 — BD Signal Pipeline v4" n8n workflow. SignalForge ingests leads from
many sources, dedupes and enriches them, scores them with the faithful v4 MEDDPICC
logic, explains *why* each lead scored as it did, and routes hot/warm leads into
outreach sequences — all behind a real-time dashboard with no-code configuration.

## Highlights

- **Faithful pipeline engine** — typed, testable rewrite of the n8n logic:
  deterministic `lead_id` dedup, role classification, channel-baseline scoring
  (A/B-Sig/B-Disc/C), role bonuses, confidence weighting, signal-age decay, tiers.
- **Lead rationale** — every lead carries a plain-English explanation + factor breakdown.
- **Pluggable providers** — enrichment (Hunter/Apollo/Clearbit/ZoomInfo), tracking/CRM
  (Airtable/HubSpot/Salesforce/Pipedrive/Notion/Sheets), alerts (Slack/Teams/Telegram/…),
  swappable from the UI. Custom HTTP adapter for anything else.
- **Multi-source intake** — email polling, Hunter signals/Discover, manual text,
  voice (browser speech-to-text), webhook, form, CSV — all converge on one pipeline.
- **Outreach & sequencing**, **no-code ICP/scoring config**, **multi-user roles**.

## Stack

React + Vite + Tailwind + shadcn/ui · Node/Express (TypeScript) · Drizzle ORM ·
**PostgreSQL** · esbuild bundle · Docker · AWS (ECS Fargate / App Runner + RDS).

## Quick start (local)

```bash
# 1. Postgres via Docker Compose (app + db)
docker compose up --build
# open http://localhost:5000

# — or — run against your own Postgres:
cp .env.example .env          # set DATABASE_URL
npm install
npm run dev                    # http://localhost:5000
```

The app auto-creates its tables on boot and seeds 15 demo leads when empty.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server (Vite + API) on :5000 |
| `npm run build` | Build client + server bundle into `dist/` |
| `npm start` | Run the production bundle (`dist/index.cjs`) |
| `npm run check` | TypeScript typecheck |
| `npm run db:generate` | Generate a new SQL migration from schema changes |
| `npm run db:migrate` | Apply pending migrations to the DB |

## Deployment

Production deploys to **AWS** (ECS Fargate or App Runner) with **Postgres on RDS**.
CI/CD is wired via GitHub Actions using OIDC (no long-lived AWS keys).

- Full runbook: [`AWS_DEPLOY.md`](./AWS_DEPLOY.md)
- IAM roles & bootstrap: [`iam/README.md`](./iam/README.md)
- API contract: [`API_SPEC.md`](./API_SPEC.md)

One-time bring-up:

```bash
ACCOUNT_ID=<acct> REGION=us-east-1 GH_OWNER=<you> GH_REPO=signalforge ./iam/bootstrap-iam.sh
DB_PASSWORD='strong-pw' VPC_SG_ID=sg-xxxx ./aws/provision-rds.sh
git push origin main      # GitHub Actions builds, pushes to ECR, deploys
```

## Security

All credentials are read from environment variables / AWS Secrets Manager — never
committed. `.env` and `data.db` are git-ignored. Rotate any keys that were exposed
in the original n8n export before going live.

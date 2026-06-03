# SignalForge — IAM roles & policies

These define the AWS identities for the CI/CD pipeline and the running app.
JSON files contain **no comments** (AWS rejects unknown keys) — usage is here.

## Fastest path: one-shot bootstrap

```bash
ACCOUNT_ID=123456789012 REGION=us-east-1 \
GH_OWNER=<your-github-user-or-org> GH_REPO=signalforge \
./iam/bootstrap-iam.sh
```

This creates the GitHub OIDC provider and all three roles with policies attached,
substituting the `<ACCOUNT_ID>` / `<REGION>` / `<GH_OWNER>` / `<GH_REPO>` placeholders
automatically. It is idempotent. At the end it prints the exact GitHub repo
Secrets/Variables to set.

## What gets created

| Role | Trust | Permissions | Used by |
|---|---|---|---|
| `signalforgeGitHubDeploy` | `github-oidc-deploy-role-trust.json` | `github-oidc-deploy-policy.json` | GitHub Actions (OIDC) — push to ECR, deploy ECS/App Runner, PassRole |
| `signalforgeExecutionRole` | `ecs-tasks-trust.json` | AWS-managed `AmazonECSTaskExecutionRolePolicy` + `ecs-execution-policy.json` | ECS agent — pull image, read `signalforge/*` secrets, write logs |
| `signalforgeTaskRole` | `ecs-tasks-trust.json` | `ecs-task-policy.json` (minimal) | Running app — no AWS APIs needed (talks to Postgres + 3rd-party HTTP) |

## Manual path (if you prefer explicit steps)

```bash
# 0. Render placeholders first, e.g.:
sed -e 's/<ACCOUNT_ID>/123456789012/g' -e 's/<REGION>/us-east-1/g' \
    -e 's/<GH_OWNER>/vito/g' -e 's/<GH_REPO>/signalforge/g' \
    iam/github-oidc-deploy-role-trust.json > /tmp/trust.json

# 1. OIDC provider (once per account)
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1

# 2. Deploy role
aws iam create-role --role-name signalforgeGitHubDeploy \
  --assume-role-policy-document file:///tmp/trust.json
aws iam put-role-policy --role-name signalforgeGitHubDeploy --policy-name deploy \
  --policy-document file:///tmp/deploy-policy.json   # render this one too

# 3. ECS execution role
aws iam create-role --role-name signalforgeExecutionRole \
  --assume-role-policy-document file://iam/ecs-tasks-trust.json
aws iam attach-role-policy --role-name signalforgeExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
aws iam put-role-policy --role-name signalforgeExecutionRole --policy-name secrets \
  --policy-document file:///tmp/exec-secrets.json    # render this one too

# 4. ECS task role
aws iam create-role --role-name signalforgeTaskRole \
  --assume-role-policy-document file://iam/ecs-tasks-trust.json
aws iam put-role-policy --role-name signalforgeTaskRole --policy-name runtime \
  --policy-document file://iam/ecs-task-policy.json
```

## Placeholders to replace

- `<ACCOUNT_ID>` — your 12-digit AWS account id
- `<REGION>` — e.g. `us-east-1`
- `<GH_OWNER>` / `<GH_REPO>` — your GitHub org/user and repo name

The OIDC trust restricts assumption to `repo:<GH_OWNER>/<GH_REPO>:ref:refs/heads/main`,
so only pushes to `main` in your repo can assume the deploy role.

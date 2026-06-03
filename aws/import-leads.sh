#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Import a CSV of leads into a running SignalForge instance.
# Each row is POSTed to /api/intake as a structured lead, so it
# runs the full classify -> score -> dedup -> route pipeline.
#
# CSV format (header row required, columns can be in any order;
# unknown columns are ignored). Recognized columns:
#   email, firstName, lastName, title, companyName, companyDomain,
#   linkedinUrl, phone, signalName
#
# Usage:
#   BASE=http://your-alb-dns ./aws/import-leads.sh leads.csv
#   (or set SOURCE=my_import to tag the source; defaults to csv_import)
# ─────────────────────────────────────────────────────────────
set -euo pipefail

: "${BASE:?set BASE to your app URL, e.g. http://signalforge-alb-xxxx.us-east-1.elb.amazonaws.com}"
CSV="${1:?usage: BASE=http://... ./aws/import-leads.sh leads.csv}"
SOURCE="${SOURCE:-csv_import}"

command -v python3 >/dev/null || { echo "python3 required"; exit 1; }

python3 - "$CSV" "$BASE" "$SOURCE" <<'PY'
import csv, json, sys, urllib.request

csv_path, base, source = sys.argv[1], sys.argv[2].rstrip("/"), sys.argv[3]
url = base + "/api/intake"
ok = dup = err = 0

with open(csv_path, newline="", encoding="utf-8-sig") as fh:
    reader = csv.DictReader(fh)
    # normalize header keys (strip + camel-tolerant)
    fieldmap = {}
    for h in (reader.fieldnames or []):
        k = h.strip()
        low = k.lower().replace("_", "").replace(" ", "")
        for want in ["email","firstname","lastname","title","companyname",
                     "companydomain","linkedinurl","phone","signalname"]:
            if low == want:
                fieldmap[h] = {
                    "firstname":"firstName","lastname":"lastName",
                    "companyname":"companyName","companydomain":"companyDomain",
                    "linkedinurl":"linkedinUrl","signalname":"signalName",
                }.get(want, want)
    for i, row in enumerate(reader, 1):
        lead = {}
        for raw, val in row.items():
            if raw in fieldmap and val and val.strip():
                lead[fieldmap[raw]] = val.strip()
        if not lead:
            continue
        payload = json.dumps({"source": source, "lead": lead}).encode()
        req = urllib.request.Request(url, data=payload,
              headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                resp = json.loads(r.read())
            if resp.get("deduped"):
                dup += 1; tag = "DEDUP"
            else:
                ok += 1; tag = "OK"
            lid = resp.get("lead", {}).get("leadId", "?")
            tier = resp.get("lead", {}).get("tier", "?")
            print(f"  [{i}] {tag}  {lead.get('email') or lead.get('companyName')}  -> tier {tier}  ({lid})")
        except urllib.error.HTTPError as e:
            err += 1
            print(f"  [{i}] ERR  {lead.get('email') or lead.get('companyName')}  {e.code} {e.read()[:120]}")
        except Exception as e:
            err += 1
            print(f"  [{i}] ERR  {lead.get('email') or lead.get('companyName')}  {e}")

print(f"\nDone. imported={ok}  deduped={dup}  errors={err}")
PY

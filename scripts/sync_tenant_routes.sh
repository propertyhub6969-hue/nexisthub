#!/usr/bin/env bash
# Regenerate router subdomain per-tenant Traefik dari DB. JALANKAN DI HOST VPS.
#   bash scripts/sync_tenant_routes.sh
# Traefik file-provider watch=true -> auto-reload, tak perlu restart.
# Tenant 'platform' (wadah super-admin) dikecualikan.
set -euo pipefail

OUT=/data/coolify/proxy/dynamic/nexisthub-tenants.yaml
SLUGS=$(docker exec nexisthub_db psql -U nexist_user -d nexisthub_db -tAc \
  "SELECT slug FROM tenants WHERE slug <> 'platform' ORDER BY slug;")

{
  echo "# AUTO-GENERATED oleh scripts/sync_tenant_routes.sh — JANGAN edit manual."
  echo "# Router <slug>.nexisthub.id -> app nexisthub (service & middleware dari nexisthub.yaml)."
  echo "http:"
  echo "  routers:"
  for s in $SLUGS; do
    echo "    tenant-${s}-http:"
    echo "      rule: \"Host(\`${s}.nexisthub.id\`)\""
    echo "      entryPoints: [http]"
    echo "      middlewares: [redirect-to-https]"
    echo "      service: nexisthub-svc"
    echo "      priority: 100"
    echo "    tenant-${s}-https:"
    echo "      rule: \"Host(\`${s}.nexisthub.id\`)\""
    echo "      entryPoints: [https]"
    echo "      service: nexisthub-svc"
    echo "      priority: 100"
    echo "      tls: { certResolver: letsencrypt }"
  done
} > "$OUT"

echo "OK -> $OUT"
echo "Subdomain aktif:"; for s in $SLUGS; do echo "  https://${s}.nexisthub.id"; done

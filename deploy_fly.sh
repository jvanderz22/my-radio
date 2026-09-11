#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Deploy my-radio to Fly.io using the repo's Dockerfile, fly.toml, and volume layout.

Usage:
  ./deploy_fly.sh
  ./deploy_fly.sh --secret STREAM_USER_AGENT="my-radio/0.2 (+me@example.com)"

Environment variables also work; put them in a gitignored .env next to this
script and they'll be picked up automatically (command-line flags win):
  APP_NAME=driftwave REGION=iad ./deploy_fly.sh

Optional:
  --app-name       default: driftwave    (must match fly.toml's `app`)
  --region         default: iad
  --volume-name    default: radio_data   (must match fly.toml's mount source)
  --volume-size    default: 1  (GB — the DB is tiny; bump only if you add track history)
  --secret KEY=VAL set a Fly secret (repeatable) — e.g. once auth is added
  --help

Steps:
  1. fly launch --no-deploy   (only if the app doesn't already exist)
  2. fly volumes create $VOLUME_NAME  (only if it doesn't already exist)
  3. fly secrets set ...      (only if --secret was given)
  4. fly scale count 1 --max-per-region 1   (SQLite = single writer, always)
  5. fly deploy

Budget note: this does NOT set the account spend limit. After the first deploy,
open Dashboard -> your org -> Billing -> Spend limits and set a hard monthly cap.
EOF
}

# Auto-load repo-local secrets (.env is gitignored) so --secret values don't
# have to be exported by hand. Command-line flags still override these.
if [[ -f "$(dirname "$0")/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$(dirname "$0")/.env"
  set +a
fi

APP_NAME="${APP_NAME:-driftwave}"
REGION="${REGION:-iad}"
VOLUME_NAME="${VOLUME_NAME:-radio_data}"
VOLUME_SIZE="${VOLUME_SIZE:-1}"
SECRETS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-name)
      APP_NAME="$2"
      shift 2
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    --volume-name)
      VOLUME_NAME="$2"
      shift 2
      ;;
    --volume-size)
      VOLUME_SIZE="$2"
      shift 2
      ;;
    --secret)
      SECRETS+=("$2")
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if ! command -v fly >/dev/null 2>&1 && ! command -v flyctl >/dev/null 2>&1; then
  echo "Fly CLI is not installed or not on PATH." >&2
  echo "Install it first: https://fly.io/docs/hands-on/install-flyctl/" >&2
  exit 1
fi
FLY_CMD="$(command -v fly || command -v flyctl)"

cd "$(dirname "$0")"

if [[ ! -f "fly.toml" ]]; then
  echo "fly.toml not found in $(pwd)." >&2
  exit 1
fi
if [[ ! -f "Dockerfile" ]]; then
  echo "Dockerfile not found in $(pwd)." >&2
  exit 1
fi

if "$FLY_CMD" status --app "$APP_NAME" >/dev/null 2>&1; then
  echo "==> App '$APP_NAME' already exists; skipping 'fly launch' (it would create a new, renamed app)"
else
  echo "==> Creating Fly app from fly.toml"
  "$FLY_CMD" launch --no-deploy --name "$APP_NAME" --region "$REGION" --copy-config --yes
fi

echo "==> Ensuring the persistent volume exists: $VOLUME_NAME"
# Fly volume names are labels, not unique keys: `fly volumes create` makes a brand
# new volume every time it runs. Only create one if none with this name exists,
# otherwise every deploy leaks another unattached (but billable) volume.
EXISTING_VOLUMES="$("$FLY_CMD" volumes list --app "$APP_NAME" 2>/dev/null | grep -cw -- "$VOLUME_NAME" || true)"
if [[ "${EXISTING_VOLUMES:-0}" -eq 0 ]]; then
  "$FLY_CMD" volumes create "$VOLUME_NAME" --app "$APP_NAME" --size "$VOLUME_SIZE" --region "$REGION" --yes
else
  echo "    volume '$VOLUME_NAME' already exists ($EXISTING_VOLUMES); skipping create"
fi

if [[ ${#SECRETS[@]} -gt 0 ]]; then
  echo "==> Setting deployment secrets"
  "$FLY_CMD" secrets set --app "$APP_NAME" "${SECRETS[@]}"
fi

echo "==> Pinning the machine count to 1 (SQLite has one writer, always)"
# Fly volumes don't replicate: a second machine would get its own empty volume
# and split-brain the database. With auto_stop_machines/min_machines_running=0
# in fly.toml, the single machine still scales to zero when idle.
"$FLY_CMD" scale count 1 --app "$APP_NAME" --max-per-region 1 --yes || \
  "$FLY_CMD" scale count 1 --app "$APP_NAME" --yes || true

echo "==> Deploying application"
"$FLY_CMD" deploy --app "$APP_NAME"

echo ""
echo "Deployment complete: https://$APP_NAME.fly.dev"
echo ""
echo "Verify the guards:"
echo "  $FLY_CMD scale show --app $APP_NAME"
echo "  $FLY_CMD machine list --app $APP_NAME"
echo ""
echo "IMPORTANT budget backstop (one-time, not scripted):"
echo "  Dashboard -> your org -> Billing -> Spend limits -> set a hard monthly cap."

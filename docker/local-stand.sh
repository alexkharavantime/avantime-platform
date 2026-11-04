#!/bin/sh
# Local DEV/staging stand on one workstation: the platform staging stack with the HTTPS edge and the
# Strapi CMS staging stack, both built from clean git worktrees under one persistent root. Layout:
#   $AVANTIME_STAND_ROOT/platform   worktree of this repository (build context, compose, Caddyfile)
#   $AVANTIME_STAND_ROOT/cms        worktree of the CMS repository
#   $AVANTIME_STAND_ROOT/secrets    platform.staging.env, cms.staging.env (never in git)
#   $AVANTIME_STAND_ROOT/ca         edge-root.crt, the public root of Caddy's internal CA
#   $AVANTIME_STAND_ROOT/backups    CMS backups
# Data lives in named Docker volumes of the projects avantime-staging and avantime-cms-staging and
# survives `down`, `up` and checkouts. See docs/CMS_STAGING.md ("Local stand").
set -eu

root="${AVANTIME_STAND_ROOT:?AVANTIME_STAND_ROOT is required}"
platform="$root/platform"
cms="$root/cms"
secrets="$root/secrets"
edge_network='avantime-staging-cms-edge'

platform_compose() {
  COMMIT_SHA="$(git -C "$platform" rev-parse --verify 'HEAD^{commit}')" \
    STAGING_ENV_FILE="$secrets/platform.staging.env" docker compose \
    --project-directory "$platform" \
    --env-file "$secrets/platform.staging.env" \
    -p avantime-staging \
    -f "$platform/docker-compose.staging.yml" \
    -f "$platform/docker-compose.staging.local.yml" \
    -f "$platform/docker-compose.staging.edge.yml" \
    -f "$platform/docker-compose.staging.edge-internal-ca.yml" \
    "$@"
}

cms_compose() {
  docker compose \
    --project-directory "$cms" \
    --env-file "$secrets/cms.staging.env" \
    -f "$cms/docker-compose.staging.yml" \
    "$@"
}

require_clean() {
  if [ -n "$(git -C "$1" status --porcelain)" ]; then
    printf '%s\n' "Refusing to build from a modified worktree: $1" >&2
    exit 1
  fi
}

export_ca() {
  mkdir -p "$root/ca"
  platform_compose exec -T reverse-proxy cat /data/caddy/pki/authorities/local/root.crt \
    >"$root/ca/edge-root.crt.tmp"
  mv "$root/ca/edge-root.crt.tmp" "$root/ca/edge-root.crt"
  printf '%s\n' "Public edge root: $root/ca/edge-root.crt"
}

case "${1:-}" in
  init)
    platform_repo="${2:?usage: init <platform-repo> <cms-repo> <platform-ref> <cms-ref>}"
    cms_repo="${3:?usage: init <platform-repo> <cms-repo> <platform-ref> <cms-ref>}"
    mkdir -p "$secrets" "$root/ca" "$root/backups/cms"
    [ -d "$platform" ] || git -C "$platform_repo" worktree add --detach "$platform" "${4:?platform ref}"
    [ -d "$cms" ] || git -C "$cms_repo" worktree add --detach "$cms" "${5:?cms ref}"
    ;;
  checkout)
    git -C "$platform" checkout --detach "${2:?usage: checkout <platform-ref> [cms-ref]}"
    if [ -n "${3:-}" ]; then git -C "$cms" checkout --detach "$3"; fi
    ;;
  up)
    require_clean "$platform"
    require_clean "$cms"
    docker network inspect "$edge_network" >/dev/null 2>&1 ||
      docker network create --internal "$edge_network" >/dev/null
    cms_compose up -d --build --wait
    platform_compose up -d --build --wait
    export_ca
    ;;
  down)
    platform_compose down
    cms_compose down
    ;;
  export-ca) export_ca ;;
  platform)
    shift
    platform_compose "$@"
    ;;
  cms)
    shift
    cms_compose "$@"
    ;;
  *)
    printf '%s\n' 'usage: local-stand.sh init|checkout|up|down|export-ca|platform <compose args>|cms <compose args>' >&2
    exit 2
    ;;
esac

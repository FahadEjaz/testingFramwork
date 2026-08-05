#!/usr/bin/env bash
# One-time host setup for Phase 12's egress firewall (see PLAN.md's gated "In-app AI debug
# terminal" + PROGRESS.md's debug-session entry for why this is a separate manual step).
#
# session.ts refuses to give a debug-session container any network access at all
# (`--network none`) unless this network already exists — failing closed by default, not open.
# Run this once, with sudo, before Phase 12 sessions can actually reach api.anthropic.com:
#
#   sudo bash scripts/setup-debug-session-network.sh
#
# What this does:
#   1. Creates a dedicated Docker bridge network (`tfv2-debug-net`) with no direct internet
#      route from containers on it.
#   2. Starts a tinyproxy forward proxy on that network, ACL'd via a Filter file to
#      api.anthropic.com only (FilterDefaultDeny — everything else is refused at the proxy).
#   3. Prints (but does not run) the `iptables DOCKER-USER` rule that blocks a debug-session
#      container from reaching the internet directly if it ignores HTTPS_PROXY/NO_PROXY (or a
#      prompt-injected `curl --noproxy` attempt) — modifying the host's shared Docker firewall
#      chain is exactly the kind of host-wide, hard-to-reverse change this project's own
#      operating guidelines say a human should run deliberately, not something automated
#      silently on your behalf.
set -euo pipefail

NETWORK_NAME="tfv2-debug-net"
PROXY_CONTAINER_NAME="tfv2-debug-proxy"
PROXY_IMAGE="vimagick/tinyproxy"
FILTER_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/debug-session-proxy-filter.txt"

if ! docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
  echo "Creating Docker network: $NETWORK_NAME (internal — no default route to the host's internet-facing interface)"
  docker network create --internal "$NETWORK_NAME"
else
  echo "Network $NETWORK_NAME already exists — skipping create."
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$PROXY_CONTAINER_NAME"; then
  echo "Starting forward proxy: $PROXY_CONTAINER_NAME (allow-listed to api.anthropic.com only)"
  # The proxy container itself needs a *second*, normal (non-internal) network interface to
  # actually reach api.anthropic.com — join the default bridge for egress, and tfv2-debug-net so
  # debug-session containers can reach it as their only route out.
  docker run -d --name "$PROXY_CONTAINER_NAME" \
    --network bridge \
    -v "$FILTER_FILE:/etc/tinyproxy/filter:ro" \
    "$PROXY_IMAGE"
  docker network connect "$NETWORK_NAME" "$PROXY_CONTAINER_NAME"
else
  echo "Proxy container $PROXY_CONTAINER_NAME already running — skipping."
fi

cat <<'EOF'

Network + proxy are up. session.ts will detect tfv2-debug-net automatically on the next debug
session and route it through the proxy via HTTPS_PROXY/NO_PROXY.

One step left, requiring root — this is NOT run automatically by this script or by the app:
blocking a debug-session container from reaching the internet directly (bypassing the proxy
entirely, whether by ignoring HTTPS_PROXY or a prompt-injected `curl --noproxy` attempt). Review
this rule, then run it yourself:

  sudo iptables -I DOCKER-USER -m addrtype ! --dst-type LOCAL \
    -i "br-$(docker network inspect tfv2-debug-net -f '{{.Id}}' | cut -c1-12)" \
    -j DROP

(The interface name is the network's own bridge — re-run `docker network inspect tfv2-debug-net`
if this network is ever recreated, since Docker assigns a fresh bridge each time.)
EOF

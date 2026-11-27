#!/bin/sh
# Starts a hosted server. Root for one moment, because a volume is root's when it is first mounted;
# the server itself runs as the user `game`.
set -eu
. /app/game/deploy/hosted.env
mkdir -p /data/live /data/runs /data/access
# The address players open, written once. For a domain of your own set PARTITION_PUBLIC_ORIGIN before
# the first start, or edit /data/hosting.json and restart.
if [ ! -f "$PARTITION_HOSTING" ]; then
  origin=${PARTITION_PUBLIC_ORIGIN:-https://${FLY_APP_NAME:?neither FLY_APP_NAME nor PARTITION_PUBLIC_ORIGIN is set}.fly.dev}
  sed "s#__PUBLIC_ORIGIN__#${origin}#" /app/game/deploy/hosting.hosted.json > "$PARTITION_HOSTING"
fi
[ -f "$PARTITION_LIVE_LIMITS" ] || cp /app/game/deploy/limits.hosted.json "$PARTITION_LIVE_LIMITS"
chown -R game:game /data
chmod 700 /data/live /data/access
exec setpriv --reuid game --regid game --init-groups node start-live.mjs

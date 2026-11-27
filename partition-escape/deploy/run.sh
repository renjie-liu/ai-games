#!/bin/sh
# Runs one command on a hosted server the way the server itself runs: the same settings, the same
# user, in the game's folder. A shell opened with `fly ssh console` has none of that by itself.
#
#   fly ssh console -C "/app/game/deploy/run.sh node invites.mjs list"
set -eu
. /app/game/deploy/hosted.env
cd /app/game
[ "$#" -gt 0 ] || { echo "usage: run.sh <command> [arguments]" >&2; exit 2; }
if [ "$(id -u)" = 0 ]; then exec setpriv --reuid game --regid game --init-groups "$@"; fi
exec "$@"

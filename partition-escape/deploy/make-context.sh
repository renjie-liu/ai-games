#!/bin/sh
# Puts together the folder a hosted server's image is built from (HOSTING.md):
#
#   sh deploy/make-context.sh /path/to/a/new/folder
#
#   <folder>/game      this game, as committed: only what git tracks at HEAD
#   <folder>/harness   the pinned harness named by PARTITION_HARNESS_ROOT (README, 本机启动)
#   <folder>/Dockerfile, <folder>/fly.toml
#
# The folder has to be outside every repository: the harness is private. What is only on this
# machine never goes in: the grant (.live), the run records (.runs), uncommitted changes.
set -eu
out=${1:?usage: sh deploy/make-context.sh <new folder outside any repository>}
harness=${PARTITION_HARNESS_ROOT:?set PARTITION_HARNESS_ROOT to the pinned harness (README)}
game=$(cd "$(dirname "$0")/.." && pwd)
if [ -e "$out" ] && [ -n "$(ls -A "$out")" ]; then echo "refused: $out is not empty" >&2; exit 1; fi
mkdir -p "$out"
out=$(cd "$out" && pwd)
if git -C "$out" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "refused: $out is inside a git repository, and the harness must not be copied into one" >&2; rmdir "$out" 2>/dev/null || true; exit 1
fi
if [ -n "$(git -C "$game" status --porcelain -- .)" ]; then echo "note: uncommitted changes in the game are NOT in the image; it is built from HEAD" >&2; fi
mkdir "$out/game" "$out/harness"
(cd "$game" && git archive HEAD .) | tar -x -C "$out/game"
for item in pyproject.toml uv.lock README.md src; do
  [ -e "$harness/$item" ] || { echo "refused: $harness has no $item; is it the pinned harness?" >&2; exit 1; }
  cp -R "$harness/$item" "$out/harness/"
done
[ -e "$harness/config" ] && cp -R "$harness/config" "$out/harness/"
find "$out/harness" -name __pycache__ -type d -prune -exec rm -r {} +
cp "$game/deploy/Dockerfile" "$game/deploy/fly.toml" "$out/"
echo "$out"

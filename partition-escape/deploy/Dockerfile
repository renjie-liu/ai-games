# The image of a hosted server (HOSTING.md): Node for the game, Python for the voice worker, and the
# pinned harness. It is built from the folder deploy/make-context.sh puts together (game/ and
# harness/ side by side), never from the repository: the harness is private and is not copied into it.
FROM node:20-bookworm-slim AS node

FROM python:3.12-slim-bookworm
COPY --from=node /usr/local/bin/node /usr/local/bin/node
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_LINK_MODE=copy
RUN pip install --no-cache-dir uv && useradd --create-home --uid 1000 game
WORKDIR /app

# The harness first, by its own lock file, as README's local setup does; then what the voice worker adds.
COPY harness/ /app/harness/
RUN uv sync --frozen --no-dev --project /app/harness
COPY game/requirements-live.txt /app/game/requirements-live.txt
RUN uv pip install --python /app/harness/.venv/bin/python -r /app/game/requirements-live.txt

COPY game/ /app/game/
# What has to outlive a deploy is on the volume fly.toml mounts at /data: the grant and its ledger,
# the invitations, the run records. The game looks for the first and the last beside itself.
RUN ln -s /data/live /app/game/.live && ln -s /data/runs /app/game/.runs \
    && chmod +x /app/game/deploy/entrypoint.sh /app/game/deploy/run.sh

# Where the server finds its parts is in deploy/hosted.env, read by the start script.
WORKDIR /app/game
EXPOSE 8080
ENTRYPOINT ["/app/game/deploy/entrypoint.sh"]

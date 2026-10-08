# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS voice
RUN apt-get update && apt-get install -y --no-install-recommends python3-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY scripts/voice-requirements.txt scripts/download-voice.py /tmp/voice/
RUN --mount=type=secret,id=proxy_bundle \
    if [ -f /run/secrets/proxy_bundle ]; then export PIP_CERT=/run/secrets/proxy_bundle SSL_CERT_FILE=/run/secrets/proxy_bundle; fi; \
    python3 -m venv /opt/voice-env \
    && /opt/voice-env/bin/pip install --no-cache-dir -r /tmp/voice/voice-requirements.txt \
    && /opt/voice-env/bin/python /tmp/voice/download-voice.py /opt/storymotion-voices

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --strict-ssl=true
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium ffmpeg fonts-liberation ca-certificates tini gosu python3 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=10000 \
    CHROME_EXECUTABLE=/usr/bin/chromium \
    STORYMOTION_DATA_DIR=/var/data/storymotion \
    STORYMOTION_RENDER_CONCURRENCY=1 \
    STORYMOTION_VOICE_PYTHON=/opt/voice-env/bin/python \
    STORYMOTION_VOICE_MODEL=/opt/storymotion-voices/es_MX-ald-medium.onnx \
    PYTHONDONTWRITEBYTECODE=1
COPY --from=voice /opt/voice-env /opt/voice-env
COPY --from=voice /opt/storymotion-voices /opt/storymotion-voices
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json /app/tsconfig.json /app/next.config.ts ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/docs/VOICE.md ./docs/VOICE.md
COPY --chmod=755 scripts/docker-entrypoint.sh /usr/local/bin/storymotion-entrypoint
RUN mkdir -p /var/data/storymotion && chown -R node:node /var/data /app
EXPOSE 10000
ENTRYPOINT ["/usr/local/bin/storymotion-entrypoint"]
CMD ["node", "--import", "tsx", "scripts/start.ts"]

FROM node:22.19.0-bookworm-slim@sha256:4a4884e8a44826194dff92ba316264f392056cbe243dcc9fd3551e71cea02b90
RUN apt-get update && apt-get install -y --no-install-recommends git python3 ca-certificates ripgrep && rm -rf /var/lib/apt/lists/*
COPY vendor/opencode /usr/local/bin/opencode
RUN test "$(opencode --version)" = "1.18.31" && mkdir -p /workspace/project /state /trusted && chown -R node:node /workspace /state
ENV HOME=/state XDG_DATA_HOME=/state/data XDG_CONFIG_HOME=/state/config XDG_CACHE_HOME=/state/cache
ENV OPENCODE_CONFIG=/trusted/opencode.json OPENCODE_DISABLE_PROJECT_CONFIG=true OPENCODE_DISABLE_AUTOUPDATE=true OPENCODE_DISABLE_DEFAULT_PLUGINS=true
USER node
WORKDIR /workspace/project
CMD ["opencode", "serve", "--hostname", "0.0.0.0", "--port", "4096"]

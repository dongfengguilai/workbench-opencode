FROM node:22.19.0-bookworm-slim@sha256:4a4884e8a44826194dff92ba316264f392056cbe243dcc9fd3551e71cea02b90
COPY vendor/build-ca.crt /etc/ssl/certs/ca-certificates.crt
RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources && apt-get -o Acquire::https::Timeout=30 -o Acquire::Retries=1 update && apt-get -o Acquire::https::Timeout=30 -o Acquire::Retries=1 install -y --no-install-recommends git python3 ca-certificates ripgrep iptables && rm -rf /var/lib/apt/lists/*
COPY vendor/opencode /usr/local/bin/opencode
COPY vendor/librust_pty.so /usr/local/lib/librust_pty.so
ENV BUN_PTY_LIB=/usr/local/lib/librust_pty.so
RUN test "$(opencode --version)" = "1.18.31" && mkdir -p /workspace/project /state /trusted/user-config/opencode && touch /trusted/user-config/opencode/.gitignore && chown -R node:node /workspace /state
ENV HOME=/home/node XDG_DATA_HOME=/state/data XDG_STATE_HOME=/state/local-state XDG_CONFIG_HOME=/trusted/user-config XDG_CACHE_HOME=/state/cache NPM_CONFIG_CACHE=/state/npm-cache
ENV OPENCODE_CONFIG=/trusted/opencode.json OPENCODE_DISABLE_PROJECT_CONFIG=true OPENCODE_DISABLE_AUTOUPDATE=true OPENCODE_DISABLE_DEFAULT_PLUGINS=true OPENCODE_PURE=true OPENCODE_DISABLE_EXTERNAL_SKILLS=true OPENCODE_DISABLE_MODELS_FETCH=true
USER node
WORKDIR /workspace/project
CMD ["opencode", "serve", "--hostname", "0.0.0.0", "--port", "4096"]

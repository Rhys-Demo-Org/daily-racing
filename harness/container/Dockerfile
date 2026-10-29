# Pinned toolchain for every pnpm/node/Playwright/Claude Code command (HANDOVER §3, §8).
# Owner-maintained: only the owner changes versions here (and in harness/config.env).
# Build: harness/container/build.sh    Run: harness/scripts/in-container.sh

# Playwright 1.64.1 on Ubuntu 24.04, pinned by digest; ships Chromium 1248 + system deps.
FROM mcr.microsoft.com/playwright:v1.64.1-noble@sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea

ARG NODE_VERSION=24.22.2
ARG NODE_SHA256=361718c444e49af2ca5a110c83ba6a8901143f23ab285ebbef0341f391f482a9
ARG PNPM_VERSION=12.16.1
ARG CLAUDE_CODE_VERSION=2.1.304

# Replace the image's Node with the pinned release, verified by checksum.
RUN set -eux; \
    apt-get purge -y nodejs; rm -rf /usr/lib/node_modules; \
    curl -fsSLo /tmp/node.tar.gz "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.gz"; \
    echo "${NODE_SHA256}  /tmp/node.tar.gz" | sha256sum -c -; \
    tar -xzf /tmp/node.tar.gz -C /usr/local --strip-components=1 --no-same-owner; \
    rm /tmp/node.tar.gz; \
    node --version | grep -qx "v${NODE_VERSION}"

# pnpm via corepack, downloaded now so runs need no network.
ENV COREPACK_HOME=/opt/corepack \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    COREPACK_ENABLE_AUTO_PIN=0
RUN set -eux; \
    corepack enable; \
    corepack prepare "pnpm@${PNPM_VERSION}" --activate; \
    chmod -R a+rX /opt/corepack; \
    pnpm --version | grep -qx "${PNPM_VERSION}"

# Claude Code, pinned; never auto-updates.
ENV DISABLE_AUTOUPDATER=1 \
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
RUN set -eux; \
    npm install -g --no-fund --no-audit "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}"; \
    claude --version | grep -q "${CLAUDE_CODE_VERSION}"

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PNPM_STORE_DIR=/pnpm-store \
    CI=1
WORKDIR /repo

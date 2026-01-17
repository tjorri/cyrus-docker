# Cyrus Production Docker Image
#
# This image contains Claude Code CLI and Cyrus CLI pre-installed,
# ready to run with environment variables for configuration.
#
# Build: docker build -t cyrus-ai/cyrus:latest .
# Run:   docker-compose up -d

FROM node:20-bookworm

LABEL org.opencontainers.image.title="Cyrus"
LABEL org.opencontainers.image.description="Linear + Claude Code automation agent"
LABEL org.opencontainers.image.source="https://github.com/ceedaragents/cyrus"

# Environment defaults
ENV NODE_ENV=production
ENV CYRUS_HOME=/root/.cyrus
ENV CYRUS_SERVER_PORT=3456
ENV CYRUS_HOST_EXTERNAL=true

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    jq \
    curl \
    ca-certificates \
    gnupg \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI (gh)
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | \
    gpg --dearmor -o /etc/apt/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] \
    https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && apt-get install -y gh && \
    rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI and Cyrus CLI globally
RUN npm install -g @anthropic-ai/claude-code@latest cyrus-ai@latest

# Create Cyrus directories
RUN mkdir -p /root/.cyrus/{repos,worktrees,mcp-configs,logs,state}

# Copy scripts
COPY entrypoint.sh healthcheck.sh /
RUN chmod +x /entrypoint.sh /healthcheck.sh

# Expose the Cyrus server port
EXPOSE 3456

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD /healthcheck.sh

# Working directory
WORKDIR /root/.cyrus

# Entrypoint handles env setup, then runs the command
ENTRYPOINT ["/entrypoint.sh"]
CMD ["cyrus", "start"]

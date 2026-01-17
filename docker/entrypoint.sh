#!/bin/bash
# Cyrus Container Entrypoint
#
# This script prepares the container environment before starting Cyrus:
# 1. Validates required environment variables
# 2. Configures git identity and safe directories
# 3. Sets up SSH keys if mounted
# 4. Authenticates GitHub CLI if token provided
# 5. Writes ~/.cyrus/.env from environment variables
#
# Exit on error
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[entrypoint]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[entrypoint]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[entrypoint]${NC} $1"
}

log_error() {
    echo -e "${RED}[entrypoint]${NC} $1"
}

# -----------------------------------------------------------------------------
# 1. Validate required environment variables
# -----------------------------------------------------------------------------
log_info "Validating environment variables..."

# Check for Claude authentication (one of these must be set)
if [ -z "$ANTHROPIC_API_KEY" ] && [ -z "$CLAUDE_CODE_OAUTH_TOKEN" ]; then
    log_error "Missing Claude authentication!"
    log_error "Set either ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN"
    exit 1
fi

if [ -n "$ANTHROPIC_API_KEY" ]; then
    log_success "Using ANTHROPIC_API_KEY for Claude authentication"
else
    log_success "Using CLAUDE_CODE_OAUTH_TOKEN for Claude authentication"
fi

# Check for Linear credentials (required for self-hosted mode)
if [ "$LINEAR_DIRECT_WEBHOOKS" = "true" ]; then
    if [ -z "$LINEAR_CLIENT_ID" ]; then
        log_warn "LINEAR_CLIENT_ID not set (required for self-hosted mode)"
    fi
    if [ -z "$LINEAR_CLIENT_SECRET" ]; then
        log_warn "LINEAR_CLIENT_SECRET not set (required for self-hosted mode)"
    fi
    if [ -z "$LINEAR_WEBHOOK_SECRET" ]; then
        log_warn "LINEAR_WEBHOOK_SECRET not set (recommended for webhook security)"
    fi
fi

# -----------------------------------------------------------------------------
# 2. Configure git
# -----------------------------------------------------------------------------
log_info "Configuring git..."

# Set git identity if provided
if [ -n "$GIT_USER_NAME" ]; then
    git config --global user.name "$GIT_USER_NAME"
    log_success "Set git user.name: $GIT_USER_NAME"
fi

if [ -n "$GIT_USER_EMAIL" ]; then
    git config --global user.email "$GIT_USER_EMAIL"
    log_success "Set git user.email: $GIT_USER_EMAIL"
fi

# Mark common directories as safe for git
git config --global --add safe.directory '*'
log_success "Configured git safe.directory for all paths"

# Set default branch name
git config --global init.defaultBranch main

# -----------------------------------------------------------------------------
# 3. Setup SSH keys (if mounted)
# -----------------------------------------------------------------------------
if [ -d "/root/.ssh" ] && [ -n "$(ls -A /root/.ssh 2>/dev/null)" ]; then
    log_info "SSH directory detected, configuring..."

    # Fix permissions (mounted volumes may have wrong perms)
    chmod 700 /root/.ssh 2>/dev/null || true
    chmod 600 /root/.ssh/* 2>/dev/null || true
    chmod 644 /root/.ssh/*.pub 2>/dev/null || true
    chmod 644 /root/.ssh/known_hosts 2>/dev/null || true
    chmod 644 /root/.ssh/config 2>/dev/null || true

    # Start ssh-agent if not running
    if [ -z "$SSH_AUTH_SOCK" ]; then
        eval "$(ssh-agent -s)" > /dev/null

        # Add keys (skip .pub files and config)
        for key in /root/.ssh/id_*; do
            if [ -f "$key" ] && [[ ! "$key" == *.pub ]]; then
                ssh-add "$key" 2>/dev/null || true
            fi
        done
        log_success "SSH agent started and keys loaded"
    fi

    # Add common hosts to known_hosts if not present
    if [ ! -f "/root/.ssh/known_hosts" ]; then
        mkdir -p /root/.ssh
        ssh-keyscan github.com gitlab.com bitbucket.org >> /root/.ssh/known_hosts 2>/dev/null || true
        log_success "Added common git hosts to known_hosts"
    fi
else
    log_info "No SSH keys mounted (git will use HTTPS)"
fi

# -----------------------------------------------------------------------------
# 4. Verify GitHub CLI authentication (if token provided)
# -----------------------------------------------------------------------------
if [ -n "$GITHUB_TOKEN" ]; then
    log_info "Verifying GitHub CLI authentication..."
    # GITHUB_TOKEN env var is automatically used by gh CLI - no login needed
    if timeout 10 gh auth status &>/dev/null; then
        log_success "GitHub CLI authenticated via GITHUB_TOKEN"
    else
        log_warn "GitHub CLI authentication failed - check your token"
    fi
else
    log_info "GITHUB_TOKEN not set (gh commands may be limited)"
fi

# -----------------------------------------------------------------------------
# 5. Write ~/.cyrus/.env from environment variables
# -----------------------------------------------------------------------------
log_info "Writing Cyrus environment file..."

CYRUS_ENV_FILE="${CYRUS_HOME:=/root/.cyrus}/.env"
mkdir -p "$(dirname "$CYRUS_ENV_FILE")"

# Start fresh env file
cat > "$CYRUS_ENV_FILE" << EOF
# Cyrus Environment Configuration
# Auto-generated by Docker entrypoint on $(date -u +"%Y-%m-%dT%H:%M:%SZ")

EOF

# Helper function to write env var if set
write_env() {
    local var_name="$1"
    local var_value="${!var_name}"
    if [ -n "$var_value" ]; then
        echo "${var_name}=${var_value}" >> "$CYRUS_ENV_FILE"
    fi
}

# Claude authentication
write_env "ANTHROPIC_API_KEY"
write_env "CLAUDE_CODE_OAUTH_TOKEN"

# Linear OAuth
write_env "LINEAR_CLIENT_ID"
write_env "LINEAR_CLIENT_SECRET"
write_env "LINEAR_WEBHOOK_SECRET"
write_env "LINEAR_DIRECT_WEBHOOKS"

# Tunnel/external URL
write_env "CYRUS_BASE_URL"
write_env "NGROK_AUTHTOKEN"

# Server config
write_env "CYRUS_SERVER_PORT"

# GitHub
write_env "GITHUB_TOKEN"

# Set secure permissions
chmod 600 "$CYRUS_ENV_FILE"
log_success "Cyrus environment file written: $CYRUS_ENV_FILE"

# -----------------------------------------------------------------------------
# 6. Display status
# -----------------------------------------------------------------------------
echo ""
log_info "=== Container Ready ==="
log_info "CYRUS_HOME: ${CYRUS_HOME}"
log_info "Server port: ${CYRUS_SERVER_PORT:-3456}"

if [ -n "$CYRUS_BASE_URL" ]; then
    log_info "External URL: ${CYRUS_BASE_URL}"
else
    log_warn "CYRUS_BASE_URL not set - run ngrok on host and update"
fi

echo ""

# -----------------------------------------------------------------------------
# Execute the main command
# -----------------------------------------------------------------------------
exec "$@"

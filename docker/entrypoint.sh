#!/bin/bash
# Cyrus Container Entrypoint
#
# This script prepares the container environment before starting Cyrus:
# 1. Validates required environment variables
# 2. Creates symlink for host path compatibility
# 3. Configures git identity and safe directories
# 4. Sets up SSH keys if mounted
# 5. Authenticates GitHub CLI if token provided
# 6. Writes ~/.cyrus/.env from environment variables
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
# 2. Create symlink for host path compatibility
# -----------------------------------------------------------------------------
# Cyrus config.json stores absolute host paths (e.g., /Users/ttj/.cyrus/repos/infra)
# but inside the container ~/.cyrus is mounted at /root/.cyrus.
# This symlink makes host paths resolve correctly without modifying config.
if [ -n "$CYRUS_HOST_PATH" ] && [ "$CYRUS_HOST_PATH" != "/root/.cyrus" ]; then
    log_info "Setting up path compatibility symlinks..."

    HOST_PARENT_DIR=$(dirname "$CYRUS_HOST_PATH")

    if [ ! -d "$HOST_PARENT_DIR" ]; then
        mkdir -p "$HOST_PARENT_DIR"
    fi

    # Symlink for .cyrus directory
    if [ ! -e "$CYRUS_HOST_PATH" ]; then
        ln -s /root/.cyrus "$CYRUS_HOST_PATH"
        log_success "Created symlink: $CYRUS_HOST_PATH -> /root/.cyrus"
    elif [ -L "$CYRUS_HOST_PATH" ]; then
        log_info "Symlink already exists: $CYRUS_HOST_PATH"
    fi

    # Symlink for .ssh directory (SSH configs often have absolute IdentityFile paths)
    HOST_SSH_PATH="$HOST_PARENT_DIR/.ssh"
    if [ ! -e "$HOST_SSH_PATH" ]; then
        ln -s /root/.ssh "$HOST_SSH_PATH"
        log_success "Created symlink: $HOST_SSH_PATH -> /root/.ssh"
    elif [ -L "$HOST_SSH_PATH" ]; then
        log_info "Symlink already exists: $HOST_SSH_PATH"
    fi
fi

# -----------------------------------------------------------------------------
# 3. Configure git
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
# 4. Setup SSH keys (if mounted)
# -----------------------------------------------------------------------------
# SSH is mounted to /root/.ssh-host (read-only) to allow creating a compatible config.
# macOS SSH configs often contain options like UseKeychain that Linux doesn't support.
if [ -d "/root/.ssh-host" ] && [ -n "$(ls -A /root/.ssh-host 2>/dev/null)" ]; then
    log_info "SSH directory detected, configuring..."

    # Create the actual .ssh directory
    mkdir -p /root/.ssh
    chmod 700 /root/.ssh

    # Symlink key files (not config or known_hosts, we handle those specially)
    for file in /root/.ssh-host/*; do
        filename=$(basename "$file")
        case "$filename" in
            config|known_hosts)
                # Handle these separately
                ;;
            *)
                # Symlink everything else (keys, etc.)
                if [ ! -e "/root/.ssh/$filename" ]; then
                    ln -s "$file" "/root/.ssh/$filename"
                fi
                ;;
        esac
    done

    # Create a config that ignores macOS-specific options and includes the original
    if [ -f "/root/.ssh-host/config" ]; then
        cat > /root/.ssh/config << 'SSHCONFIG'
# Auto-generated SSH config for Linux compatibility
# Ignores macOS-specific options like UseKeychain, AddKeysToAgent
IgnoreUnknown UseKeychain,AddKeysToAgent

# Include the original config
Include /root/.ssh-host/config
SSHCONFIG
        chmod 644 /root/.ssh/config
        log_success "Created SSH config with macOS compatibility"
    fi

    # Copy known_hosts if it exists, or create with common hosts
    if [ -f "/root/.ssh-host/known_hosts" ]; then
        cp /root/.ssh-host/known_hosts /root/.ssh/known_hosts
        chmod 644 /root/.ssh/known_hosts
    else
        ssh-keyscan github.com gitlab.com bitbucket.org >> /root/.ssh/known_hosts 2>/dev/null || true
        log_success "Added common git hosts to known_hosts"
    fi

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
else
    log_info "No SSH keys mounted (git will use HTTPS)"
fi

# -----------------------------------------------------------------------------
# 5. Verify GitHub CLI authentication (if token provided)
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
# 6. Write ~/.cyrus/.env from environment variables
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
# 7. Display status
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

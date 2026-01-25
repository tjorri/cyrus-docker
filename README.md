# cyrus-docker

A CLI tool for managing Docker-based [Cyrus](https://github.com/ceedaragents/cyrus) deployments with automatic ngrok tunnel management.

Cyrus is an AI agent that integrates Linear's issue tracking with Claude Code to automate software development tasks. This tool simplifies running Cyrus in a Docker container with all the necessary infrastructure.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (with Docker Compose)
- [ngrok](https://ngrok.com/download) (for exposing Cyrus to Linear webhooks)
- [Node.js](https://nodejs.org/) 22+

## Installation

```bash
npm install -g cyrus-docker
```

Or install from source:

```bash
git clone https://github.com/tjorri/cyrus-docker.git
cd cyrus-docker
npm install
npm run build
npm link
```

## Quick Start

```bash
# 1. Run the setup wizard
cyrus-docker init

# 2. Start Cyrus (launches ngrok + Docker container)
cyrus-docker start

# 3. Configure Linear OAuth app with the URLs shown
#    Go to: linear.app/settings/api/applications
#    Set Callback URL and Webhook URL

# 4. Authenticate with Linear
cyrus-docker auth

# 5. Add a repository
cyrus-docker add-repo https://github.com/your/repo.git
```

## Commands

| Command | Description |
|---------|-------------|
| `cyrus-docker init` | Interactive setup wizard for credentials |
| `cyrus-docker start [-d] [-b]` | Start ngrok tunnel and Docker container |
| `cyrus-docker stop` | Stop container and tunnel |
| `cyrus-docker restart` | Restart only the container (keeps ngrok tunnel) |
| `cyrus-docker status` | Show container and tunnel status |
| `cyrus-docker logs [-f]` | Show container logs (`-f` to follow) |
| `cyrus-docker shell` | Open bash shell in the container |
| `cyrus-docker auth` | Run Linear OAuth authentication |
| `cyrus-docker add-repo <url>` | Add a repository to Cyrus |
| `cyrus-docker tools` | Configure development tools in the container |
| `cyrus-docker build [-f]` | Build the Docker image (for debugging/CI) |

### Start Options

- `-d, --detach` - Run in detached mode (don't follow logs)
- `-b, --build` - Force rebuild of the Docker image

### Build Options

- `-f, --force` - Force rebuild even if image is up-to-date

## Configuration

The `init` command creates a `.env.docker` file with your credentials:

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes* | Anthropic API key (from console.anthropic.com) |
| `CLAUDE_CODE_OAUTH_TOKEN` | Yes* | Claude Code OAuth token (alternative to API key) |
| `LINEAR_CLIENT_ID` | Yes | Linear OAuth app client ID |
| `LINEAR_CLIENT_SECRET` | Yes | Linear OAuth app client secret |
| `LINEAR_WEBHOOK_SECRET` | Recommended | Secret for webhook verification |
| `GIT_USER_NAME` | Optional | Git commit author name |
| `GIT_USER_EMAIL` | Optional | Git commit author email |
| `GITHUB_TOKEN` | Optional | For private repo access |
| `NGROK_AUTHTOKEN` | Optional | ngrok authentication token |

*One of `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` is required.

### Linear OAuth Setup

1. Go to [Linear API Applications](https://linear.app/settings/api/applications)
2. Create a new OAuth application
3. After running `cyrus-docker start`, set:
   - **Callback URL**: `https://<your-ngrok-url>/callback`
   - **Webhook URL**: `https://<your-ngrok-url>/webhook`

### Container Tools Configuration

Customize development tools in the container without Docker expertise using `cyrus-docker tools`.

#### Using the wizard

```bash
$ cyrus-docker tools
? Select tool presets:
  [x] Python - Python 3, pip, venv, pytest, black, ruff
  [ ] Rust - Rust toolchain + cargo
  [x] AWS CLI - AWS CLI v2
? Additional APT packages? vim, tree
Configuration saved to ~/.cyrus-docker/tools.yml

$ cyrus-docker start
Building custom image with tools...
```

#### Available presets

| Preset | Description |
|--------|-------------|
| `python` | Python 3, pip, venv, pytest, black, ruff |
| `rust` | Rust toolchain + cargo |
| `go` | Go programming language |
| `ruby` | Ruby + Bundler |
| `java` | OpenJDK 17 + Maven |
| `aws` | AWS CLI v2 |
| `k8s` | kubectl + helm |
| `terraform` | HashiCorp Terraform |

#### Manual configuration

Edit `~/.cyrus-docker/tools.yml` directly for advanced options:

```yaml
presets:
  - python
  - rust
apt:
  - vim
  - htop
npm:
  - typescript
pip:
  - poetry
```

Configuration is applied automatically when running `cyrus-docker start`.

#### Smart Image Caching

The CLI automatically detects when a rebuild is needed by hashing your tools configuration:

- **First run**: Builds the image with your configured tools
- **Subsequent runs**: Skips build if configuration hasn't changed
- **Configuration changed**: Automatically rebuilds with new tools
- **Force rebuild**: Use `cyrus-docker start --build` or `cyrus-docker build --force`

## How It Works

1. **`cyrus-docker start`** launches an ngrok tunnel on port 3456
2. The tunnel URL is written to `.env.docker` as `CYRUS_BASE_URL`
3. Docker Compose builds and starts the Cyrus container
4. The container runs `cyrus start` which listens for Linear webhooks
5. When issues are assigned to Cyrus in Linear, it processes them with Claude

## Data Storage

- **State**: `~/.cyrus-docker/state.json` - CLI state (tunnel PID, URLs)
- **Cyrus Data**: `~/.cyrus/` - Mounted into container (repos, config, logs)
- **SSH Keys**: `~/.ssh/` - Mounted read-only for git operations

## Troubleshooting

### Container health check fails
The container may take up to 60 seconds to become healthy. Check logs:
```bash
cyrus-docker logs -f
```

### ngrok tunnel not starting
Ensure no other ngrok process is running:
```bash
pkill ngrok
cyrus-docker start
```

### Permission errors with git
Ensure your SSH keys are accessible and have correct permissions:
```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/id_*
```

## Contributing

### Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/) to automate versioning and changelog generation.

Format: `<type>: <description>`

| Type | Description | Version Bump |
|------|-------------|--------------|
| `fix` | Bug fixes | Patch (0.0.x) |
| `feat` | New features | Minor (0.x.0) |
| `feat!` | Breaking changes | Major (x.0.0) |
| `docs` | Documentation only | No release |
| `chore` | Maintenance tasks | No release |
| `refactor` | Code refactoring | No release |
| `test` | Adding/updating tests | No release |

Examples:
```bash
git commit -m "fix: resolve tunnel connection timeout"
git commit -m "feat: add support for custom ports"
git commit -m "feat!: change config file format"
```

### Development

```bash
git clone https://github.com/tjorri/cyrus-docker.git
cd cyrus-docker
npm install
npm run dev      # Watch mode
npm run test     # Run tests
npm run typecheck
```

## Release Process

Releases are automated via [semantic-release](https://github.com/semantic-release/semantic-release) when changes are merged to `main`:

1. Commits are analyzed to determine the next version
2. `CHANGELOG.md` is generated/updated
3. `package.json` version is bumped
4. A git tag and GitHub release are created
5. The package is published to npm

No manual version bumping is required.

## License

Apache-2.0 - see [LICENSE](LICENSE) for details.

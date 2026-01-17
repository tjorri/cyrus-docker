#!/bin/bash
# Cyrus Container Health Check
#
# Checks if the Cyrus server is running and responding.
# Used by Docker HEALTHCHECK directive.
#
# Exit codes:
#   0 - healthy (server is responding)
#   1 - unhealthy (server not responding or error)

CYRUS_PORT="${CYRUS_SERVER_PORT:-3456}"
HEALTHCHECK_URL="http://localhost:${CYRUS_PORT}/version"

# Attempt to reach the /version endpoint
# - timeout: 5 seconds
# - fail silently (-f), no output (-s), follow redirects (-L)
response=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 5 "$HEALTHCHECK_URL" 2>/dev/null)

if [ "$response" = "200" ]; then
    exit 0
else
    exit 1
fi

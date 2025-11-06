#!/bin/bash
# Utility functions for NEAR test suite

# Execute near-cli command with retry logic
near_cli_exec() {
    local max_retries=3
    local retry_delay=2
    local cmd="$@"
    local attempt=1
    
    while [ $attempt -le $max_retries ]; do
        if eval "$cmd"; then
            return 0
        fi
        
        if [ $attempt -lt $max_retries ]; then
            echo "Attempt $attempt failed, retrying in ${retry_delay}s..." >&2
            sleep $retry_delay
            attempt=$((attempt + 1))
        else
            return 1
        fi
    done
}

# Parse JSON response from near-cli
parse_near_response() {
    local response="$1"
    local field="$2"
    
    if command -v jq &> /dev/null; then
        echo "$response" | jq -r "$field // empty"
    else
        # Fallback: simple grep/awk parsing
        echo "$response" | grep -o "\"$field\":[^,}]*" | cut -d: -f2 | tr -d ' "'
    fi
}

# Validate RPC endpoint is accessible
validate_rpc_endpoint() {
    local rpc_url="$1"
    local timeout=5
    
    if curl -s --max-time "$timeout" "$rpc_url/status" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Get NEAR account balance
get_account_balance() {
    local rpc_url="$1"
    local account_id="$2"
    
    local response=$(near --nodeUrl "$rpc_url" view-account "$account_id" 2>&1)
    parse_near_response "$response" ".amount"
}

# Check if account exists
account_exists() {
    local rpc_url="$1"
    local account_id="$2"
    
    if near --nodeUrl "$rpc_url" view-account "$account_id" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}


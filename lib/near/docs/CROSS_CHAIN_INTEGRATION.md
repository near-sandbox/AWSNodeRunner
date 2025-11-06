# Cross-Chain Simulator Integration Guide

This guide explains how to integrate the NEAR localnet node runner with the `@near-sandbox/cross-chain-simulator` NPM package.

## Overview

The NEAR localnet node runner deploys a fully functional NEAR blockchain node on AWS and exposes an RPC endpoint. The `cross-chain-simulator` package consumes this RPC endpoint to provide Chain Signatures functionality.

## Architecture

```
┌──────────────────────────────────────────┐
│  cross-chain-simulator                   │
│  • Imports NEAR node deployment          │
│  • Orchestrates MPC network              │
│  • Provides RPC endpoints                │
└──────────────┬───────────────────────────┘
               │
               │ consumes RPC URL
               ▼
┌──────────────────────────────────────────┐
│  AWS NEAR Node Runner                   │
│  • Deploys NEAR localnet                 │
│  • Exposes RPC endpoint                  │
│  • Exports configuration                 │
└──────────────────────────────────────────┘
```

## Prerequisites

1. Deploy NEAR localnet node runner (see main README.md)
2. Install `@near-sandbox/cross-chain-simulator`:

```bash
npm install @near-sandbox/cross-chain-simulator
```

## Step 1: Deploy NEAR Node

Deploy the NEAR localnet node runner:

```bash
cd lib/near
npm install
npm run deploy
```

Wait for all stacks to complete (~22 minutes).

## Step 2: Export Configuration

After deployment, export the configuration:

```bash
npm run build
node dist/scripts/export-config.js
```

This generates:
- `localnet-config.json`: Complete configuration object
- `.env.localnet`: Environment variables

## Step 3: Configure cross-chain-simulator

### Option A: Environment Variables

Set environment variables from the exported `.env.localnet`:

```bash
export NEAR_RPC_URL=$(grep NEAR_RPC_URL .env.localnet | cut -d '=' -f2)
export NEAR_NETWORK_ID=$(grep NEAR_NETWORK_ID .env.localnet | cut -d '=' -f2)
```

### Option B: Direct Configuration

Read configuration from `localnet-config.json`:

```typescript
import * as fs from "fs";
import * as path from "path";

const configPath = path.join(__dirname, "../lib/near/localnet-config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

// Use config.rpcUrl and config.networkId
```

### Option C: Manual Configuration

Get RPC URL from CloudFormation outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name near-localnet-sync \
  --profile shai-sandbox-profile \
  --query "Stacks[0].Outputs[?OutputKey=='near-rpc-url'].OutputValue" \
  --output text
```

## Step 4: Use in cross-chain-simulator

According to the cross-chain-simulator architecture, you need to create a `LocalnetConfig`:

```typescript
import { LocalnetConfig } from '@near-sandbox/cross-chain-simulator';

const config: LocalnetConfig = {
  rpcUrl: process.env.NEAR_RPC_URL || 'http://10.0.1.5:3030',
  networkId: 'localnet',
  mpcContractId: 'v1.signer-dev.testnet',
  mpcNodes: [
    // MPC node endpoints (if deploying MPC network)
    // 'http://localhost:3000',
    // 'http://localhost:3001',
    // 'http://localhost:3002',
  ],
  headers: {
    // Optional headers for RPC requests
  }
};

// Use config with cross-chain-simulator
const simulator = createChainSignaturesClient(config);
```

## Example Integration

### Complete Example

```typescript
// In your application
import { LocalnetConfig } from '@near-sandbox/cross-chain-simulator';
import * as fs from 'fs';
import * as path from 'path';

// Load configuration from exported file
function loadNearConfig(): LocalnetConfig {
  const configPath = path.join(__dirname, '../lib/near/localnet-config.json');
  
  if (!fs.existsSync(configPath)) {
    throw new Error(
      'NEAR localnet configuration not found. ' +
      'Run: cd lib/near && node dist/scripts/export-config.js'
    );
  }
  
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  return {
    rpcUrl: config.rpcUrl,
    networkId: config.networkId,
    mpcContractId: 'v1.signer-dev.testnet',
    mpcNodes: [], // Add MPC nodes if deploying MPC network
  };
}

// Use configuration
const nearConfig = loadNearConfig();
console.log(`Connecting to NEAR localnet at: ${nearConfig.rpcUrl}`);

// Initialize cross-chain-simulator with NEAR config
// (Implementation depends on cross-chain-simulator API)
```

## Configuration Properties

### From NEAR Node Runner

- **rpcUrl**: `http://{instance-private-ip}:3030`
  - Example: `http://10.0.1.5:3030`
  - This is the private IP of the EC2 instance
  - Accessible from within the VPC or via VPN/SSM

- **networkId**: `"localnet"`
  - Fixed value for localnet deployments

### Additional Configuration Needed

- **mpcContractId**: `"v1.signer-dev.testnet"`
  - Chain Signatures contract ID
  - For localnet, use testnet contract or deploy locally

- **mpcNodes**: `string[]`
  - Array of MPC node endpoints
  - Required for Chain Signatures functionality
  - See [NEAR MPC Repository](https://github.com/near/mpc)

## Network Access

### VPC Access

The RPC endpoint is accessible from:
- Lambda functions in the same VPC
- EC2 instances in the same VPC
- VPN-connected clients
- Systems with VPC peering

### External Access

For external access (outside VPC), consider:
1. **API Gateway**: Create a REST API that proxies to the RPC endpoint
2. **ALB**: Application Load Balancer with target group
3. **SSM Port Forwarding**: Forward port via SSM Session Manager

Example SSM port forwarding:

```bash
aws ssm start-session \
  --target $(aws cloudformation describe-stacks \
    --stack-name near-localnet-infrastructure \
    --profile shai-sandbox-profile \
    --query "Stacks[0].Outputs[?OutputKey=='near-instance-id'].OutputValue" \
    --output text) \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["3030"],"localPortNumber":["3030"]}' \
  --profile shai-sandbox-profile
```

Then access via `http://localhost:3030`

## Validation

### Test RPC Endpoint

Verify RPC endpoint is accessible:

```bash
# From within VPC or via SSM port forwarding
curl http://10.0.1.5:3030/status

# Expected response:
# {
#   "version": {...},
#   "chain_id": "localnet",
#   "sync_info": {...}
# }
```

### Test cross-chain-simulator Connection

```typescript
import { createChainSignaturesClient } from '@near-sandbox/cross-chain-simulator';

const client = createChainSignaturesClient({
  rpcUrl: 'http://10.0.1.5:3030',
  networkId: 'localnet',
  // ... other config
});

// Test connection
const status = await client.getStatus();
console.log('NEAR node status:', status);
```

## Troubleshooting

### RPC URL Not Accessible

1. **Check VPC connectivity**: Ensure you're in the same VPC or have VPN access
2. **Verify security group**: RPC port 3030 should allow traffic from your source
3. **Check instance status**: Verify EC2 instance is running
4. **Test from instance**: SSH/SSM into instance and test locally:
   ```bash
   curl http://127.0.0.1:3030/status
   ```

### Configuration Not Found

If `export-config.js` fails:

1. **Verify stacks deployed**: All 4 stacks must be deployed
2. **Check AWS credentials**: Ensure `shai-sandbox-profile` is configured
3. **Verify stack names**: Check stack names match expected values

### cross-chain-simulator Connection Issues

1. **Validate RPC URL format**: Must be `http://{ip}:3030`
2. **Check network ID**: Must be exactly `"localnet"`
3. **Verify CORS**: If accessing from browser, ensure CORS is configured
4. **Test with curl**: Verify RPC endpoint responds before using in code

## Next Steps

1. **Deploy MPC Network**: Set up MPC nodes for Chain Signatures (see [NEAR MPC](https://github.com/near/mpc))
2. **Configure MPC Nodes**: Add MPC node endpoints to `mpcNodes` array
3. **Integrate Chain Signatures**: Use `cross-chain-simulator` for Chain Signatures functionality
4. **Test End-to-End**: Run Chain Signatures tests against localnet

## References

- [cross-chain-simulator Architecture](../ARCHITECTURE.md)
- [NEAR MPC Repository](https://github.com/near/mpc)
- [NEAR Chain Signatures Documentation](https://docs.near.org/concepts/abstraction/chain-signatures)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)


# NEAR Localnet Node Runner

AWS CDK deployment for NEAR Protocol localnet nodes. This module provides a standalone, production-ready deployment of NEAR localnet nodes on AWS infrastructure.

## Overview

This CDK application deploys a NEAR localnet node using a multi-stack architecture following AWS best practices:

- **Common Stack**: VPC, IAM roles, security groups
- **Infrastructure Stack**: EC2 instance with cfn-signal
- **Install Stack**: Validates NEAR installation completion
- **Sync Stack**: Validates service and exposes RPC endpoint

## Architecture

```
┌──────────────────────────────────────────┐
│  Common Stack                             │
│  • VPC (2 AZs, 1 NAT Gateway)            │
│  • Security Groups                        │
│  • IAM Roles                              │
│  • SSM VPC Endpoints                      │
└──────────────┬───────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│  Infrastructure Stack                    │
│  • EC2 Instance (T3.LARGE)              │
│  • Ubuntu 24.04 LTS                      │
│  • 30GB GP3 Volume                       │
│  • UserData: Compile & Install NEAR     │
└──────────────┬───────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│  Install Stack                           │
│  • Validate Installation                 │
│  • SSM Document Execution                │
└──────────────┬───────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│  Sync Stack                              │
│  • Validate Service Running              │
│  • Expose RPC Endpoint                   │
│  • CloudWatch Dashboard                  │
└──────────────────────────────────────────┘
```

## Prerequisites

- AWS CLI configured with a profile (set via `AWS_PROFILE` environment variable)
- Node.js 18+ and npm
- AWS CDK v2 installed (`npm install -g aws-cdk`)
- TypeScript (`npm install -g typescript`)

**Configuration:**
```bash
# Set AWS profile via environment variable (recommended)
export AWS_PROFILE=your-profile-name

# Or add to .env file (not tracked in git)
echo "AWS_PROFILE=your-profile-name" >> .env
```

## Installation

```bash
cd lib/near
npm install
```

## Configuration

Configuration is managed in `lib/config/localnet-config.ts`. Default values:

- **Instance Type**: `t3.large` (2 vCPU, 8GB RAM)
- **Architecture**: `x86_64` (required for NEAR)
- **Network**: `localnet`
- **NEAR Version**: `2.2.0`
- **Volume Size**: 30GB GP3
- **RPC Port**: 3030

Environment variables can override defaults:

```bash
export AWS_PROFILE=your-profile-name  # Required: AWS CLI profile
export AWS_ACCOUNT_ID=123456789012
export AWS_REGION=us-east-1
export NEAR_NETWORK=localnet
export NEAR_VERSION=2.2.0
```

**Note**: The `AWS_PROFILE` environment variable is required for all CDK commands and scripts. Add it to `.env` (not tracked in git) for convenience.

## Deployment

### Deploy All Stacks

```bash
npm run deploy
```

Or manually (ensure `AWS_PROFILE` is set):

```bash
cdk deploy --all
```

### Deploy Individual Stacks

```bash
# Deploy in order (AWS_PROFILE must be set)
cdk deploy near-localnet-common
cdk deploy near-localnet-infrastructure
cdk deploy near-localnet-install
cdk deploy near-localnet-sync
```

## Deployment Timeline

- **Common Stack**: ~2 minutes
- **Infrastructure Stack**: ~5 minutes (includes cfn-signal)
- **Install Stack**: ~15 minutes (validates UserData completion)
- **Sync Stack**: ~immediate (service validation)

**Total**: ~22 minutes (excluding NEAR compilation time which happens in UserData)

## Outputs

After deployment, the sync stack exports:

- `NearLocalnetRpcUrl`: RPC endpoint URL (e.g., `http://10.0.1.5:3030`)
- `NearLocalnetNetworkId`: Network identifier (`localnet`)

View outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name near-localnet-sync \
  --profile ${AWS_PROFILE} \
  --query "Stacks[0].Outputs"
```

## Export Configuration for cross-chain-simulator

After deployment, export configuration:

```bash
npm run build
node dist/scripts/export-config.js
```

This generates:
- `localnet-config.json`: JSON configuration
- `.env.localnet`: Environment variables

## Testing

Run Jest tests:

```bash
npm test
```

## Monitoring

### CloudWatch Dashboard

A CloudWatch dashboard is automatically created in the sync stack:
- Instance CPU utilization
- Network I/O
- Service health

Access via AWS Console → CloudWatch → Dashboards → `near-localnet-{stack-name}`

### SSM Session Manager

Connect to the instance for debugging:

```bash
aws ssm start-session \
  --target $(aws cloudformation describe-stacks \
    --stack-name near-localnet-infrastructure \
    --profile ${AWS_PROFILE} \
    --query "Stacks[0].Outputs[?OutputKey=='near-instance-id'].OutputValue" \
    --output text) \
  --profile ${AWS_PROFILE}
```

### Logs

NEAR setup logs:
```bash
sudo tail -f /var/log/near-setup.log
```

nearup logs:
```bash
sudo tail -f /var/log/nearup.log
```

## Cleanup

Destroy all stacks:

```bash
npm run destroy
```

Or manually:

```bash
cdk destroy --all
```

**Note**: Destroy stacks in reverse order (sync → install → infrastructure → common)

## Integration with cross-chain-simulator

See [CROSS_CHAIN_INTEGRATION.md](./docs/CROSS_CHAIN_INTEGRATION.md) for detailed integration instructions.

## Localnet Account Services (Helper, Faucet, Implicit Accounts)

To mirror testnet/mainnet onboarding on localnet and keep upper layers free of L1 primitives, implement the local Helper/Faucet services and implicit account flow described in:

- [LOCALNET_SERVICES.md](./docs/LOCALNET_SERVICES.md)

## Troubleshooting

### cfn-signal Failures

If infrastructure stack fails to signal:

1. Check SSM Session Manager access
2. Review `/var/log/infrastructure-bootstrap.log` on instance
3. Verify IAM role has `cloudformation:SignalResource` permission

### NEAR Installation Timeout

If install stack times out:

1. Check UserData script execution: `/var/log/near-setup.log`
2. Verify Rust compilation completed: `ls ~ubuntu/nearcore/target/release/neard`
3. Check nearup installation: `~ubuntu/.local/bin/nearup --version`

### RPC Endpoint Not Available

If sync stack reports RPC unavailable:

1. Verify nearup is running: `pgrep -f nearup`
2. Check RPC endpoint: `curl http://127.0.0.1:3030/status`
3. Review nearup logs: `/var/log/nearup.log`

## Configuration Reference

### Instance Configuration

- **Type**: T3.LARGE (recommended for Rust compilation)
- **OS**: Ubuntu 24.04 LTS
- **Volume**: 30GB GP3 (required for compilation artifacts)
- **Subnet**: Public (for package downloads)

### Network Configuration

- **VPC**: Custom VPC with 2 AZs
- **NAT Gateway**: 1 (for private subnet internet access)
- **Security Group**: RPC port 3030 (VPC-only), SSH port 22 (public)

### NEAR Configuration

- **Version**: 2.2.0 (from nearcore git tag)
- **Network**: localnet (via nearup)
- **RPC Port**: 3030
- **Binary Path**: `~/nearcore/target/release`

## Development

### Build

```bash
npm run build
```

### Watch Mode

```bash
npm run watch
```

### Synthesize CloudFormation

```bash
npm run synth
```

## Resources

- [NEAR Documentation](https://docs.near.org/)
- [nearcore GitHub](https://github.com/near/nearcore)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [nearup Documentation](https://github.com/near/nearup)

## License

MIT


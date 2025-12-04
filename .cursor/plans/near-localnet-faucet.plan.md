# NEAR Localnet Faucet Service

## Overview

Foundational service for funding NEAR accounts on localnet. Provides HTTP API and CLI wrapper for programmatic token distribution with rate limiting and monitoring.

## Repository Structure

**Location**: `/Users/Shai.Perednik/Documents/code_workspace/near_mobile/near-localnet-faucet`

```
near-localnet-faucet/
├── bin/
│   ├── app.ts                      # CDK application entry point
│   └── faucet.sh                   # CLI wrapper (based on chain-mobil/faucet.sh)
├── lib/
│   └── faucet-stack.ts            # Faucet Lambda stack with DynamoDB
├── assets/
│   └── faucet/
│       ├── package.json
│       ├── tsconfig.json
│       ├── build.sh
│       └── handler.ts              # Lambda handler (~100 lines)
├── scripts/
│   ├── extract-sponsor-key.ts      # Extract node0 key to Secrets Manager
│   └── setup-localnet.sh           # Configure near-cli for localnet
├── test/
│   └── faucet-stack.test.ts       # Jest unit tests
├── package.json                    # Root package.json
├── tsconfig.json                   # TypeScript config
├── cdk.json                        # CDK configuration
└── README.md                       # Deployment modes + usage docs
```

## Deployment Modes

### Mode 1: Standalone (Existing Localnet)

**Use Case**: You have a localnet already running (local machine, existing AWS deployment, etc.)

**Prerequisites**:
- NEAR RPC URL accessible (e.g., `http://localhost:3030` or private IP)
- Sponsor account key stored in AWS Secrets Manager
- AWS credentials configured

**Environment Variables**:
```bash
export NEAR_RPC_URL=http://10.0.1.5:3030
export SPONSOR_ACCOUNT_KEY_ARN=arn:aws:secretsmanager:us-east-1:123456789012:secret:near-sponsor-key
export SPONSOR_ACCOUNT_ID=node0
```

**Deployment**:
```bash
cd near-localnet-faucet
cdk deploy --all --profile shai-sandbox-profile \
  -c mode=standalone \
  -c rpcUrl=$NEAR_RPC_URL \
  -c sponsorKeyArn=$SPONSOR_ACCOUNT_KEY_ARN
```

**What Gets Deployed**:
- Lambda function (standalone, no VPC)
- DynamoDB table for rate limiting
- Lambda Function URL (HTTPS endpoint)
- CloudWatch alarms
- Secrets Manager access via IAM

### Mode 2: Integrated (with AWSNodeRunner)

**Use Case**: Deploy faucet alongside NEAR node from AWSNodeRunner

**Prerequisites**:
- AWSNodeRunner deployed (`near-localnet-*` stacks)
- CloudFormation exports available

**Deployment**:
```bash
# 1. Deploy AWSNodeRunner first
cd /Users/Shai.Perednik/Documents/code_workspace/near_mobile/AWSNodeRunner/lib/near
npm run deploy

# 2. Extract sponsor key and store in Secrets Manager
npm run build
node dist/scripts/fetch-validator-keys.js
# Then manually create Secrets Manager secret with the key

# 3. Deploy faucet (auto-imports from AWSNodeRunner)
cd /Users/Shai.Perednik/Documents/code_workspace/near_mobile/near-localnet-faucet
cdk deploy --all --profile shai-sandbox-profile -c mode=integrated
```

**What Gets Deployed**:
- Lambda function in VPC (same as NEAR node)
- DynamoDB table for rate limiting
- Lambda Function URL (internal VPC endpoint)
- CloudWatch alarms
- Auto-imports: `NearLocalnetRpcUrl`, `NearLocalnetVpcId`, `NearLocalnetSecurityGroupId`

## Implementation Steps

### Step 1: Initialize Repository

1. **Create package.json**
   - Dependencies: `aws-cdk-lib@^2.140.0`, `constructs@^10.3.0`, `cdk-nag@^2.27.0`
   - Dev dependencies: `typescript@^5.3.3`, `@types/node@^20.10.0`, `jest@^29.7.0`, `ts-jest@^29.1.0`, `ts-node@^10.9.2`
   - Scripts: `build`, `watch`, `test`, `synth`, `deploy`, `destroy`

2. **Create tsconfig.json**
   - Match AWSNodeRunner patterns (strict TypeScript, ES2020 target, commonjs module)
   - Include: `bin/`, `lib/`, `test/`
   - Exclude: `node_modules/`, `cdk.out/`, `assets/`

3. **Create cdk.json**
   - App entry: `bin/app.ts`
   - Match AWSNodeRunner CDK configuration

### Step 2: CDK Application (bin/app.ts)

**Mode Detection**:
```typescript
const mode = process.env.NEAR_RPC_URL ? 'standalone' : 'integrated';
```

**Stack Initialization**:
```typescript
import { FaucetStack } from '../lib/faucet-stack';
import * as cdk from 'aws-cdk-lib';
import * as nag from 'cdk-nag';

const app = new cdk.App();
cdk.Tags.of(app).add('Project', 'NearLocalnetFaucet');

const mode = app.node.tryGetContext('mode') || 
  (process.env.NEAR_RPC_URL ? 'standalone' : 'integrated');

const faucetStack = new FaucetStack(app, 'near-localnet-faucet', {
  stackName: 'near-localnet-faucet',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT || '311843862895',
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  mode: mode as 'standalone' | 'integrated',
  rpcUrl: app.node.tryGetContext('rpcUrl') || process.env.NEAR_RPC_URL,
  sponsorKeyArn: app.node.tryGetContext('sponsorKeyArn') || process.env.SPONSOR_ACCOUNT_KEY_ARN,
  sponsorAccountId: process.env.SPONSOR_ACCOUNT_ID || 'node0',
});

// Apply CDK Nag checks
cdk.Aspects.of(app).add(new nag.AwsSolutionsChecks({ verbose: true }));
```

### Step 3: Faucet Stack (lib/faucet-stack.ts)

**Interface**:
```typescript
export interface FaucetStackProps extends cdk.StackProps {
  mode: 'standalone' | 'integrated';
  rpcUrl?: string;
  sponsorKeyArn?: string;
  sponsorAccountId?: string;
  vpcId?: string;
  securityGroupId?: string;
}
```

**Key Resources**:

1. **DynamoDB Table for Rate Limiting** (following jelilat/near-faucet pattern)
   ```typescript
   const rateLimitTable = new dynamodb.Table(this, 'RateLimitTable', {
     partitionKey: { name: 'accountId', type: dynamodb.AttributeType.STRING },
     sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
     billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
     timeToLiveAttribute: 'ttl',
   });
   ```

2. **Lambda Function**
   - Runtime: Node.js 20.x
   - Handler: `handler.handler`
   - Timeout: 30 seconds
   - Memory: 512 MB
   - VPC: Only for Mode 2 (integrated)
   - Environment variables:
     - `NEAR_RPC_URL`
     - `NEAR_NETWORK_ID=localnet`
     - `SPONSOR_ACCOUNT_ID`
     - `SPONSOR_KEY_ARN`
     - `RATE_LIMIT_TABLE`
     - `MAX_AMOUNT_PER_REQUEST=100`
     - `RATE_LIMIT_WINDOW=86400` (24 hours)

3. **Lambda Function URL**
   - Auth: `NONE` (or `AWS_IAM` for security)
   - CORS: Allow POST from any origin
   - Returns HTTPS URL for invocation

4. **CloudWatch Alarms**
   - Errors metric with threshold of 5
   - Throttles metric
   - Duration metric for performance monitoring

5. **IAM Permissions**
   - DynamoDB read/write on rate limit table
   - Secrets Manager read on sponsor secret

### Step 4: Lambda Handler (assets/faucet/handler.ts)

**Reference Implementation**: Based on [jelilat/near-faucet](https://github.com/jelilat/near-faucet) patterns

**Key Functions**:

1. **getSponsorKey()** - Fetch and cache sponsor key from Secrets Manager
2. **checkRateLimit(accountId)** - Query DynamoDB for recent requests
3. **recordRequest(accountId)** - Store request in DynamoDB with TTL
4. **handler(event)** - Main Lambda handler

**Logic Flow**:
```typescript
1. Parse request body (accountId, amount)
2. Validate input
3. Check rate limit (DynamoDB query)
4. Validate amount against MAX_AMOUNT_PER_REQUEST
5. Get sponsor key from Secrets Manager (cached)
6. Connect to NEAR using near-api-js
7. Send money via account.sendMoney()
8. Record request in DynamoDB
9. Return success response with txHash
```

**Dependencies** (assets/faucet/package.json):
- `near-api-js@^6.5.0`
- `@aws-sdk/client-secrets-manager@^3.650.0`
- `@aws-sdk/client-dynamodb@^3.650.0`

**Build Process** (assets/faucet/build.sh):
```bash
#!/bin/bash
set -e
cd "$(dirname "$0")"
npm install
npx tsc
rm -rf dist-package
mkdir -p dist-package
cp dist/handler.js dist-package/
cp -r node_modules dist-package/
```

### Step 5: CLI Wrapper (bin/faucet.sh)

**Reference**: Based on `/Users/Shai.Perednik/Documents/code_workspace/near_mobile/chain-mobil/faucet.sh`

**Features**:
- Auto-discovers faucet URL from CloudFormation outputs
- Colorized output
- Error handling
- Support for both single and batch transfers (optional)

**Usage**:
```bash
./faucet.sh <account-id> <amount>
./faucet.sh alice.test.near 5.0
```

**Implementation**:
```bash
#!/bin/bash
set -e

PROFILE="${AWS_PROFILE:-shai-sandbox-profile}"
FAUCET_URL="${FAUCET_URL:-$(aws cloudformation describe-stacks \
  --stack-name near-localnet-faucet \
  --query 'Stacks[0].Outputs[?OutputKey==`FaucetUrl`].OutputValue' \
  --output text \
  --profile $PROFILE)}"

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <account-id> <amount>"
  exit 1
fi

ACCOUNT_ID="$1"
AMOUNT="$2"

echo "Sending $AMOUNT NEAR to $ACCOUNT_ID..."

RESPONSE=$(curl -s -X POST "$FAUCET_URL" \
  -H "Content-Type: application/json" \
  -d "{\"accountId\": \"$ACCOUNT_ID\", \"amount\": \"$AMOUNT\"}")

SUCCESS=$(echo "$RESPONSE" | jq -r '.success')

if [ "$SUCCESS" == "true" ]; then
  TX_HASH=$(echo "$RESPONSE" | jq -r '.txHash')
  echo "✅ Success! TX: $TX_HASH"
else
  ERROR=$(echo "$RESPONSE" | jq -r '.error')
  echo "❌ Error: $ERROR"
  exit 1
fi
```

### Step 6: Extract Sponsor Key Script (scripts/extract-sponsor-key.ts)

**Purpose**: Extract node0 validator key from deployed NEAR node and store in Secrets Manager

**Pattern**: Similar to `fetch-validator-keys.ts` from AWSNodeRunner

**Implementation**:
```typescript
import { execSync } from 'child_process';
import { SecretsManagerClient, CreateSecretCommand } from '@aws-sdk/client-secrets-manager';

const PROFILE = 'shai-sandbox-profile';
const SECRET_NAME = 'near-localnet-sponsor-key';

// Get instance ID from CloudFormation
const instanceId = execSync(
  `aws cloudformation describe-stacks \
    --stack-name near-localnet-infrastructure \
    --query 'Stacks[0].Outputs[?OutputKey==\`near-instance-id\`].OutputValue' \
    --output text \
    --profile ${PROFILE}`,
  { encoding: 'utf8' }
).trim();

// Read validator key via SSM
const commandId = execSync(
  `aws ssm send-command \
    --instance-ids ${instanceId} \
    --document-name "AWS-RunShellScript" \
    --parameters 'commands=["cat /home/ubuntu/.near/localnet/node0/validator_key.json"]' \
    --profile ${PROFILE} \
    --query "Command.CommandId" \
    --output text`,
  { encoding: 'utf8' }
).trim();

// Wait and get output
await new Promise(resolve => setTimeout(resolve, 5000));

const output = execSync(
  `aws ssm get-command-invocation \
    --command-id ${commandId} \
    --instance-id ${instanceId} \
    --profile ${PROFILE} \
    --query "StandardOutputContent" \
    --output text`,
  { encoding: 'utf8' }
);

const validatorKey = JSON.parse(output);

// Store in Secrets Manager
const secretsClient = new SecretsManagerClient({});
await secretsClient.send(new CreateSecretCommand({
  Name: SECRET_NAME,
  SecretString: JSON.stringify({
    accountId: 'node0',
    privateKey: validatorKey.secret_key || validatorKey.private_key,
  }),
}));

console.log(`✅ Sponsor key stored in Secrets Manager: ${SECRET_NAME}`);
```

### Step 7: Testing (test/faucet-stack.test.ts)

**Unit Tests**:
```typescript
import { FaucetStack } from '../lib/faucet-stack';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';

describe('FaucetStack', () => {
  test('Mode 1: Standalone deployment', () => {
    const app = new cdk.App();
    const stack = new FaucetStack(app, 'TestStack', {
      mode: 'standalone',
      rpcUrl: 'http://localhost:3030',
      sponsorKeyArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:test',
    });
    
    const template = Template.fromStack(stack);
    
    // Should create DynamoDB table
    template.resourceCountIs('AWS::DynamoDB::Table', 1);
    
    // Should create Lambda function
    template.resourceCountIs('AWS::Lambda::Function', 1);
    
    // Should NOT be in VPC (standalone mode)
    template.hasResourceProperties('AWS::Lambda::Function', {
      VpcConfig: cdk.Match.absent(),
    });
  });
  
  test('Mode 2: Integrated deployment', () => {
    const app = new cdk.App();
    const stack = new FaucetStack(app, 'TestStack', {
      mode: 'integrated',
      sponsorKeyArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:test',
    });
    
    const template = Template.fromStack(stack);
    
    // Should import RPC URL from CloudFormation
    // Should be in VPC
  });
});
```

### Step 8: Documentation (README.md)

**Sections**:
1. Overview and features
2. Prerequisites
3. Deployment modes comparison table
4. Mode 1: Standalone deployment guide
5. Mode 2: Integrated deployment guide
6. CLI usage examples
7. API documentation
8. Rate limiting details
9. Troubleshooting
10. Integration with near-cli
11. Security considerations

**near-cli Integration Examples**:
```bash
# Create account with near-cli
near account create-account fund-myself alice.test.near '1 NEAR' \
  autogenerate-new-keypair save-to-keychain \
  network-config localnet

# Then fund via faucet
./bin/faucet.sh alice.test.near 10.0
```

## Dependencies on AWSNodeRunner

**Mode 2 requires these CloudFormation exports**:
- `NearLocalnetRpcUrl` (from sync-stack)
- `NearLocalnetVpcId` (from common-stack)
- `NearLocalnetSecurityGroupId` (from common-stack)
- `NearLocalnetInstanceId` (for key extraction)

**No changes needed to AWSNodeRunner** - these exports already exist.

## Key Implementation Patterns

1. **Follow test-stack.ts patterns** from AWSNodeRunner for Lambda + VPC
2. **Rate limiting** follows jelilat/near-faucet DynamoDB pattern
3. **CLI wrapper** follows chain-mobil/faucet.sh patterns
4. **Lambda Function URL** simpler than API Gateway for internal/VPC use
5. **Two-mode CDK** follows cross-chain-simulator DEPLOYMENT_MODES.md
6. **Secrets Manager caching** for performance (singleton pattern)
7. **CloudFormation imports** via `cdk.Fn.importValue()` for Mode 2

## AWS & NEAR Best Practices

**AWS**:
- ✅ DynamoDB for serverless rate limiting
- ✅ Lambda Function URL for simple HTTP access
- ✅ Secrets Manager for key storage (not SSM Parameter Store)
- ✅ VPC integration for Mode 2 (private subnet with egress)
- ✅ CloudWatch alarms for monitoring
- ✅ IAM least privilege (scoped permissions)
- ✅ CDK Nag security checks

**NEAR**:
- ✅ Uses official near-api-js library
- ✅ Supports both named and implicit accounts
- ✅ Proper yoctoNEAR conversion
- ✅ Transaction hash returned for verification
- ✅ Compatible with near-cli workflows

## Acceptance Criteria

- [ ] Repository initialized with correct structure
- [ ] Supports Mode 1: Standalone deployment
- [ ] Supports Mode 2: Integrated with AWSNodeRunner
- [ ] DynamoDB rate limiting works (24-hour window)
- [ ] Lambda Function URL provides HTTP API
- [ ] CLI wrapper (`bin/faucet.sh`) functional
- [ ] CloudWatch alarms configured
- [ ] Extract sponsor key script works
- [ ] Unit tests pass
- [ ] Documentation complete for both modes
- [ ] CDK synthesizes without errors
- [ ] Manual testing successful
- [ ] Rate limiting prevents abuse
- [ ] Error handling robust

## To-dos

- [ ] Initialize repository structure
- [ ] Create package.json with dependencies
- [ ] Create tsconfig.json and cdk.json
- [ ] Implement bin/app.ts with mode detection
- [ ] Implement lib/faucet-stack.ts with DynamoDB
- [ ] Implement assets/faucet/handler.ts with near-api-js
- [ ] Create assets/faucet/build.sh
- [ ] Implement bin/faucet.sh CLI wrapper
- [ ] Implement scripts/extract-sponsor-key.ts
- [ ] Write test/faucet-stack.test.ts unit tests
- [ ] Write comprehensive README.md
- [ ] Test Mode 1 deployment
- [ ] Test Mode 2 deployment
- [ ] Verify rate limiting works
- [ ] Verify CloudWatch alarms trigger




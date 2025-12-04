# NEAR Localnet Account Helper Service

## Overview

Foundational service for creating NEAR accounts on localnet. Provides HTTP API and CLI wrapper for implicit and named account creation with automatic funding via faucet service. Emulates `helper.testnet.near.org` behavior for localnet development.

## Repository Structure

**Location**: `/Users/Shai.Perednik/Documents/code_workspace/near_mobile/near-localnet-helper`

```
near-localnet-helper/
├── bin/
│   ├── app.ts                      # CDK application entry point
│   └── create-account.sh           # CLI wrapper
├── lib/
│   └── helper-stack.ts            # Helper Lambda stack
├── assets/
│   └── helper/
│       ├── package.json
│       ├── tsconfig.json
│       ├── build.sh
│       └── handler.ts              # Lambda handler (~150 lines)
├── scripts/
│   ├── test-helper.sh              # Integration test script
│   └── setup-near-cli.sh           # Configure near-cli for localnet
├── test/
│   └── helper-stack.test.ts       # Jest unit tests
├── package.json                    # Root package.json
├── tsconfig.json                   # TypeScript config
├── cdk.json                        # CDK configuration
└── README.md                       # Usage docs + near-cli examples
```

## Deployment Modes

### Mode 1: Standalone (Existing Localnet + Faucet)

**Use Case**: You have localnet and faucet running, want to add account helper

**Prerequisites**:
- NEAR localnet node running with accessible RPC
- Faucet service deployed and accessible
- Sponsor account key in Secrets Manager
- AWS credentials configured

**Environment Variables**:
```bash
export NEAR_RPC_URL=http://10.0.1.5:3030
export SPONSOR_ACCOUNT_KEY_ARN=arn:aws:secretsmanager:us-east-1:123456789012:secret:near-sponsor-key
export FAUCET_URL=https://xyz.lambda-url.us-east-1.on.aws
export SPONSOR_ACCOUNT_ID=node0
```

**Deployment**:
```bash
cd near-localnet-helper
cdk deploy --all --profile shai-sandbox-profile \
  -c mode=standalone \
  -c rpcUrl=$NEAR_RPC_URL \
  -c faucetUrl=$FAUCET_URL \
  -c sponsorKeyArn=$SPONSOR_ACCOUNT_KEY_ARN
```

**What Gets Deployed**:
- Lambda function (standalone, no VPC)
- Lambda Function URL
- CloudWatch alarms
- IAM role with Secrets Manager access

### Mode 2: Integrated (with AWSNodeRunner + Faucet)

**Use Case**: Complete stack deployment with NEAR node, faucet, and helper

**Prerequisites**:
- AWSNodeRunner deployed
- Faucet service deployed (near-localnet-faucet)
- CloudFormation exports available

**Deployment**:
```bash
# 1. Deploy AWSNodeRunner
cd /Users/Shai.Perednik/Documents/code_workspace/near_mobile/AWSNodeRunner/lib/near
npm run deploy

# 2. Deploy Faucet
cd /Users/Shai.Perednik/Documents/code_workspace/near_mobile/near-localnet-faucet
cdk deploy --all --profile shai-sandbox-profile -c mode=integrated

# 3. Deploy Helper (auto-imports from AWSNodeRunner + Faucet)
cd /Users/Shai.Perednik/Documents/code_workspace/near_mobile/near-localnet-helper
cdk deploy --all --profile shai-sandbox-profile -c mode=integrated
```

**What Gets Deployed**:
- Lambda function in VPC (same as NEAR node)
- Lambda Function URL (internal)
- CloudWatch alarms
- Auto-imports:
  - `NearLocalnetRpcUrl` (from AWSNodeRunner)
  - `NearLocalnetFaucetUrl` (from Faucet service)
  - `NearLocalnetVpcId` (from AWSNodeRunner)
  - `NearLocalnetSecurityGroupId` (from AWSNodeRunner)

## Why Account Helper vs near-cli?

**near-cli limitations for automation**:
- Requires CLI tool installed on user machine
- Interactive prompts not suitable for programmatic use
- No HTTP API for automation

**Helper service benefits**:
1. **HTTP API** - Programmatic access for scripts, tests, CDK stacks
2. **Automatic funding** - Creates + funds account in one call
3. **Implicit account support** - Derives ID from public key without near-cli
4. **Testnet-like UX** - Matches `helper.testnet.near.org` behavior for localnet
5. **CDK integration** - Other stacks can create accounts programmatically

**Use Cases**:
- Integration tests that need fresh accounts
- CI/CD pipelines creating test accounts
- CDK stacks that deploy contracts to new accounts
- Scripts that automate account creation
- Applications that onboard users to localnet

## Implementation Steps

### Step 1: Initialize Repository

1. **Create package.json**
   - Dependencies: `aws-cdk-lib@^2.140.0`, `constructs@^10.3.0`, `cdk-nag@^2.27.0`
   - Dev dependencies: `typescript@^5.3.3`, `@types/node@^20.10.0`, `jest@^29.7.0`, `ts-jest@^29.1.0`
   - Scripts: `build`, `watch`, `test`, `synth`, `deploy`, `destroy`

2. **Create tsconfig.json**
   - Match AWSNodeRunner patterns
   - Include: `bin/`, `lib/`, `test/`
   - Exclude: `node_modules/`, `cdk.out/`, `assets/`

3. **Create cdk.json**
   - App entry: `bin/app.ts`

### Step 2: CDK Application (bin/app.ts)

**Mode Detection**:
```typescript
const mode = app.node.tryGetContext('mode') || 
  (process.env.NEAR_RPC_URL ? 'standalone' : 'integrated');
```

**Stack Initialization**:
```typescript
import { HelperStack } from '../lib/helper-stack';
import * as cdk from 'aws-cdk-lib';
import * as nag from 'cdk-nag';

const app = new cdk.App();
cdk.Tags.of(app).add('Project', 'NearLocalnetHelper');

const helperStack = new HelperStack(app, 'near-localnet-helper', {
  stackName: 'near-localnet-helper',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT || '311843862895',
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  mode: mode as 'standalone' | 'integrated',
  rpcUrl: app.node.tryGetContext('rpcUrl') || process.env.NEAR_RPC_URL,
  faucetUrl: app.node.tryGetContext('faucetUrl') || process.env.FAUCET_URL,
  sponsorKeyArn: app.node.tryGetContext('sponsorKeyArn') || process.env.SPONSOR_ACCOUNT_KEY_ARN,
  sponsorAccountId: process.env.SPONSOR_ACCOUNT_ID || 'node0',
});

cdk.Aspects.of(app).add(new nag.AwsSolutionsChecks({ verbose: true }));
```

### Step 3: Helper Stack (lib/helper-stack.ts)

**Interface**:
```typescript
export interface HelperStackProps extends cdk.StackProps {
  mode: 'standalone' | 'integrated';
  rpcUrl?: string;
  faucetUrl?: string;
  sponsorKeyArn?: string;
  sponsorAccountId?: string;
  vpcId?: string;
  securityGroupId?: string;
}
```

**Key Resources**:

1. **Lambda Function**
   - Runtime: Node.js 20.x
   - Handler: `handler.handler`
   - Timeout: 60 seconds (longer than faucet for account creation)
   - Memory: 512 MB
   - VPC: Only for Mode 2
   - Environment variables:
     - `NEAR_RPC_URL`
     - `NEAR_NETWORK_ID=localnet`
     - `SPONSOR_ACCOUNT_ID`
     - `SPONSOR_KEY_ARN`
     - `FAUCET_URL`
     - `DEFAULT_FUNDING_AMOUNT=10`

2. **Lambda Function URL**
   - Auth: `NONE` (or `AWS_IAM`)
   - CORS: Allow POST from any origin

3. **CloudWatch Alarms**
   - Errors metric
   - Duration metric
   - Throttles metric

4. **IAM Permissions**
   - Secrets Manager read on sponsor secret
   - Lambda invoke permission for calling faucet (if internal)

**Implementation**:
```typescript
export class HelperStack extends cdk.Stack {
  public readonly helperUrl: string;
  
  constructor(scope: Construct, id: string, props: HelperStackProps) {
    super(scope, id, props);
    
    const { mode } = props;
    
    // Import or use provided values
    const rpcUrl = mode === 'integrated'
      ? cdk.Fn.importValue('NearLocalnetRpcUrl')
      : props.rpcUrl!;
    
    const faucetUrl = mode === 'integrated'
      ? cdk.Fn.importValue('NearLocalnetFaucetUrl')
      : props.faucetUrl!;
    
    const sponsorSecret = secretsmanager.Secret.fromSecretArn(
      this, 'SponsorSecret', props.sponsorKeyArn!
    );
    
    // Lambda function
    const helperLambda = new lambda.Function(this, 'HelperFunction', {
      functionName: 'near-localnet-helper',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset('assets/helper/dist-package'),
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      environment: {
        NEAR_RPC_URL: rpcUrl,
        NEAR_NETWORK_ID: 'localnet',
        SPONSOR_ACCOUNT_ID: props.sponsorAccountId || 'node0',
        SPONSOR_KEY_ARN: props.sponsorKeyArn!,
        FAUCET_URL: faucetUrl,
        DEFAULT_FUNDING_AMOUNT: '10',
      },
      ...(mode === 'integrated' && {
        vpc: ec2.Vpc.fromLookup(this, 'Vpc', {
          vpcId: cdk.Fn.importValue('NearLocalnetVpcId'),
        }),
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        securityGroups: [
          ec2.SecurityGroup.fromSecurityGroupId(
            this, 'SecurityGroup',
            cdk.Fn.importValue('NearLocalnetSecurityGroupId')
          ),
        ],
      }),
    });
    
    // Permissions
    sponsorSecret.grantRead(helperLambda);
    
    // Function URL
    const functionUrl = helperLambda.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.POST],
      },
    });
    
    this.helperUrl = functionUrl.url;
    
    // CloudWatch Alarms
    new cloudwatch.Alarm(this, 'HelperErrorAlarm', {
      metric: helperLambda.metricErrors(),
      threshold: 5,
      evaluationPeriods: 1,
      alarmDescription: 'Helper Lambda errors exceed threshold',
    });
    
    // Outputs
    new cdk.CfnOutput(this, 'HelperUrl', {
      value: this.helperUrl,
      exportName: 'NearLocalnetHelperUrl',
    });
  }
}
```

### Step 4: Lambda Handler (assets/helper/handler.ts)

**Key Functions**:

1. **deriveImplicitAccountId(publicKey)** - Convert ED25519 public key to 64-hex implicit ID
2. **fundAccount(accountId, amount)** - Call faucet service to fund account
3. **createNamedAccount(accountId, publicKey, amount)** - Use sponsor to create subaccount
4. **handler(event)** - Main Lambda handler supporting both modes

**Implementation**:
```typescript
import { connect, keyStores, KeyPair, utils } from 'near-api-js';
import { PublicKey } from 'near-api-js/lib/utils';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// Cached sponsor key
let sponsorKeyPair: KeyPair | null = null;

async function getSponsorKey(): Promise<KeyPair> {
  if (sponsorKeyPair) return sponsorKeyPair;
  
  const secret = await new SecretsManagerClient({}).send(
    new GetSecretValueCommand({ SecretId: process.env.SPONSOR_KEY_ARN })
  );
  const { privateKey } = JSON.parse(secret.SecretString!);
  sponsorKeyPair = KeyPair.fromString(privateKey);
  return sponsorKeyPair;
}

function deriveImplicitAccountId(publicKeyStr: string): string {
  const publicKey = PublicKey.fromString(publicKeyStr);
  return Buffer.from(publicKey.data).toString('hex');
}

async function fundAccount(accountId: string, amount: string): Promise<string> {
  const response = await fetch(process.env.FAUCET_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId, amount }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Faucet error: ${error.error || response.statusText}`);
  }
  
  const result = await response.json();
  if (!result.success) {
    throw new Error(`Faucet error: ${result.error}`);
  }
  
  return result.txHash;
}

async function createNamedAccount(
  accountId: string,
  publicKeyStr: string,
  amount: string
): Promise<{ accountId: string; txHash: string }> {
  // Get sponsor key
  const keyPair = await getSponsorKey();
  const keyStore = new keyStores.InMemoryKeyStore();
  await keyStore.setKey('localnet', process.env.SPONSOR_ACCOUNT_ID!, keyPair);
  
  // Connect to NEAR
  const near = await connect({
    networkId: 'localnet',
    keyStore,
    nodeUrl: process.env.NEAR_RPC_URL!,
  });
  
  const sponsorAccount = await near.account(process.env.SPONSOR_ACCOUNT_ID!);
  
  // Create account
  const amountYocto = utils.format.parseNearAmount(amount)!;
  const newPublicKey = PublicKey.fromString(publicKeyStr);
  
  const result = await sponsorAccount.createAccount(
    accountId,
    newPublicKey,
    BigInt(amountYocto)
  );
  
  return {
    accountId,
    txHash: result.transaction.hash,
  };
}

export async function handler(event: any) {
  try {
    const body = JSON.parse(event.body || '{}');
    const { mode, publicKey, accountId, initialAmount } = body;
    
    if (!mode || !['implicit', 'named'].includes(mode)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'mode must be "implicit" or "named"' }),
      };
    }
    
    if (!publicKey) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'publicKey required' }),
      };
    }
    
    const amount = initialAmount || process.env.DEFAULT_FUNDING_AMOUNT!;
    
    if (mode === 'implicit') {
      // Derive implicit account ID from public key
      const implicitAccountId = deriveImplicitAccountId(publicKey);
      
      // Fund via faucet
      const txHash = await fundAccount(implicitAccountId, amount);
      
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          mode: 'implicit',
          accountId: implicitAccountId,
          funded: true,
          amount: `${amount} NEAR`,
          txHash,
        }),
      };
      
    } else {
      // Named account creation
      if (!accountId) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'accountId required for named mode' }),
        };
      }
      
      const result = await createNamedAccount(accountId, publicKey, amount);
      
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          mode: 'named',
          accountId: result.accountId,
          funded: true,
          amount: `${amount} NEAR`,
          txHash: result.txHash,
        }),
      };
    }
    
  } catch (error: any) {
    console.error('Helper error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: error.message,
      }),
    };
  }
}
```

**Dependencies** (assets/helper/package.json):
- `near-api-js@^6.5.0`
- `@aws-sdk/client-secrets-manager@^3.650.0`
- `node-fetch@^3.3.0` (for calling faucet)

### Step 5: CLI Wrapper (bin/create-account.sh)

**Usage**:
```bash
# Create implicit account
./create-account.sh implicit ed25519:ABC... [amount]

# Create named account
./create-account.sh named ed25519:ABC... alice.test.near [amount]
```

**Implementation**:
```bash
#!/bin/bash
set -e

PROFILE="${AWS_PROFILE:-shai-sandbox-profile}"
HELPER_URL="${HELPER_URL:-$(aws cloudformation describe-stacks \
  --stack-name near-localnet-helper \
  --query 'Stacks[0].Outputs[?OutputKey==`HelperUrl`].OutputValue' \
  --output text \
  --profile $PROFILE)}"

MODE="$1"
PUBLIC_KEY="$2"
ACCOUNT_ID="$3"
AMOUNT="${4:-10}"

if [ "$MODE" != "implicit" ] && [ "$MODE" != "named" ]; then
  echo "Usage: $0 <implicit|named> <public-key> [account-id] [amount]"
  echo ""
  echo "Examples:"
  echo "  $0 implicit ed25519:ABC123..."
  echo "  $0 named ed25519:ABC123... alice.test.near 5.0"
  exit 1
fi

if [ "$MODE" == "implicit" ]; then
  echo "Creating implicit account..."
  PAYLOAD="{\"mode\": \"implicit\", \"publicKey\": \"$PUBLIC_KEY\", \"initialAmount\": \"$AMOUNT\"}"
else
  if [ -z "$ACCOUNT_ID" ]; then
    echo "Error: account-id required for named mode"
    exit 1
  fi
  echo "Creating named account: $ACCOUNT_ID..."
  PAYLOAD="{\"mode\": \"named\", \"accountId\": \"$ACCOUNT_ID\", \"publicKey\": \"$PUBLIC_KEY\", \"initialAmount\": \"$AMOUNT\"}"
fi

RESPONSE=$(curl -s -X POST "$HELPER_URL" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

SUCCESS=$(echo "$RESPONSE" | jq -r '.success')

if [ "$SUCCESS" == "true" ]; then
  CREATED_ACCOUNT_ID=$(echo "$RESPONSE" | jq -r '.accountId')
  TX_HASH=$(echo "$RESPONSE" | jq -r '.txHash')
  FUNDED_AMOUNT=$(echo "$RESPONSE" | jq -r '.amount')
  echo "✅ Account created: $CREATED_ACCOUNT_ID"
  echo "   Funded: $FUNDED_AMOUNT"
  echo "   TX: $TX_HASH"
else
  ERROR=$(echo "$RESPONSE" | jq -r '.error')
  echo "❌ Error: $ERROR"
  exit 1
fi
```

### Step 6: Integration Test Script (scripts/test-helper.sh)

**Purpose**: End-to-end test of helper service

```bash
#!/bin/bash
set -e

echo "Testing NEAR Account Helper Service"
echo ""

# Generate test keypair
TEST_KEYPAIR=$(near generate-key --saveImplicit)
PUBLIC_KEY=$(echo "$TEST_KEYPAIR" | grep "Public key:" | awk '{print $3}')

echo "Test 1: Create implicit account"
./bin/create-account.sh implicit "$PUBLIC_KEY"

echo ""
echo "Test 2: Create named account"
TEST_ACCOUNT="test-$(date +%s).test.near"
./bin/create-account.sh named "$PUBLIC_KEY" "$TEST_ACCOUNT" 5.0

echo ""
echo "✅ All tests passed!"
```

### Step 7: near-cli Setup Script (scripts/setup-near-cli.sh)

**Purpose**: Configure near-cli to work with localnet

```bash
#!/bin/bash
# Configure near-cli for localnet

NEAR_ENV=localnet

# Get RPC URL from CloudFormation
RPC_URL=$(aws cloudformation describe-stacks \
  --stack-name near-localnet-sync \
  --query 'Stacks[0].Outputs[?OutputKey==`near-rpc-url`].OutputValue' \
  --output text \
  --profile shai-sandbox-profile)

echo "Configuring near-cli for localnet..."
echo "RPC URL: $RPC_URL"

# Create near-cli config
mkdir -p ~/.near-cli
cat > ~/.near-cli/config.json <<EOF
{
  "localnet": {
    "networkId": "localnet",
    "nodeUrl": "$RPC_URL",
    "helperUrl": "http://localhost:3000",
    "walletUrl": "http://localhost:4000"
  }
}
EOF

echo "✅ near-cli configured for localnet"
echo ""
echo "Usage:"
echo "  near account create-account fund-myself alice.test.near '1 NEAR' \\"
echo "    autogenerate-new-keypair save-to-keychain \\"
echo "    network-config localnet"
```

### Step 8: Testing (test/helper-stack.test.ts)

```typescript
import { HelperStack } from '../lib/helper-stack';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';

describe('HelperStack', () => {
  test('Mode 1: Standalone deployment', () => {
    const app = new cdk.App();
    const stack = new HelperStack(app, 'TestStack', {
      mode: 'standalone',
      rpcUrl: 'http://localhost:3030',
      faucetUrl: 'https://faucet.example.com',
      sponsorKeyArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:test',
    });
    
    const template = Template.fromStack(stack);
    
    template.resourceCountIs('AWS::Lambda::Function', 1);
    template.hasResourceProperties('AWS::Lambda::Function', {
      VpcConfig: cdk.Match.absent(),
    });
  });
  
  test('Mode 2: Integrated deployment', () => {
    // Test CloudFormation imports
  });
});
```

### Step 9: Documentation (README.md)

**Sections**:
1. Overview - Why use helper vs near-cli
2. Prerequisites
3. Deployment modes comparison
4. Mode 1: Standalone guide
5. Mode 2: Integrated guide
6. API documentation
7. CLI usage examples
8. Integration with near-cli
9. Integration with faucet service
10. Troubleshooting
11. Security considerations

**API Examples**:
```bash
# Implicit account creation
curl -X POST $HELPER_URL \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "implicit",
    "publicKey": "ed25519:ABC123...",
    "initialAmount": "10"
  }'

# Named account creation
curl -X POST $HELPER_URL \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "named",
    "accountId": "alice.test.near",
    "publicKey": "ed25519:ABC123...",
    "initialAmount": "5"
  }'
```

## Dependencies

**On Faucet Service**:
- Requires faucet service deployed and accessible
- Uses `FAUCET_URL` to fund newly created implicit accounts

**On AWSNodeRunner (Mode 2 only)**:
- `NearLocalnetRpcUrl`
- `NearLocalnetVpcId`
- `NearLocalnetSecurityGroupId`

**On Faucet Service (Mode 2 only)**:
- `NearLocalnetFaucetUrl`

## Key Implementation Patterns

1. **Implicit account ID derivation** - Buffer.from(publicKey.data).toString('hex')
2. **Integration with faucet** - HTTP POST for funding
3. **Named account creation** - near-api-js createAccount()
4. **Two-mode deployment** - Follows cross-chain-simulator pattern
5. **Secrets caching** - Singleton pattern for sponsor key
6. **Error handling** - Try/catch with descriptive errors

## AWS & NEAR Best Practices

**AWS**:
- ✅ Lambda Function URL for simple access
- ✅ Secrets Manager for key storage
- ✅ VPC integration for Mode 2
- ✅ CloudWatch alarms
- ✅ IAM least privilege
- ✅ CDK Nag checks

**NEAR**:
- ✅ Official near-api-js library
- ✅ Proper implicit account derivation
- ✅ Support for both implicit and named accounts
- ✅ Automatic funding via faucet
- ✅ Compatible with near-cli workflows

## Acceptance Criteria

- [ ] Repository initialized
- [ ] Mode 1: Standalone deployment works
- [ ] Mode 2: Integrated deployment works
- [ ] Implicit account creation functional
- [ ] Named account creation functional
- [ ] Integration with faucet works
- [ ] CLI wrapper functional
- [ ] near-cli setup script works
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Documentation complete
- [ ] Error handling robust
- [ ] CloudWatch alarms configured

## To-dos

- [ ] Initialize repository structure
- [ ] Create package.json with dependencies
- [ ] Create tsconfig.json and cdk.json
- [ ] Implement bin/app.ts with mode detection
- [ ] Implement lib/helper-stack.ts
- [ ] Implement assets/helper/handler.ts
- [ ] Implement implicit account derivation logic
- [ ] Implement named account creation logic
- [ ] Implement faucet integration
- [ ] Create assets/helper/build.sh
- [ ] Implement bin/create-account.sh CLI wrapper
- [ ] Implement scripts/test-helper.sh
- [ ] Implement scripts/setup-near-cli.sh
- [ ] Write test/helper-stack.test.ts
- [ ] Write comprehensive README.md
- [ ] Test Mode 1 deployment
- [ ] Test Mode 2 deployment
- [ ] Verify implicit account creation
- [ ] Verify named account creation
- [ ] Verify faucet integration




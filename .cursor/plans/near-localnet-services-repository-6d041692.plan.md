<!-- 6d041692-4b9d-4a7a-9f6a-718e0d7ff639 3a721a06-ac9b-46dd-93f6-d5545f41d91d -->
# NEAR Localnet Faucet Service

## Repository Structure

Create new repository at `/Users/Shai.Perednik/Documents/code_workspace/near_mobile/near-localnet-services` with simplified structure:

```
near-localnet-services/
├── bin/
│   ├── app.ts                      # CDK application entry point
│   └── faucet.sh                   # CLI wrapper (like chain-mobil/faucet.sh)
├── lib/
│   └── faucet-stack.ts            # Single Lambda stack
├── assets/
│   └── faucet/                     # Faucet Lambda function
│       ├── package.json
│       ├── tsconfig.json
│       ├── build.sh
│       └── handler.ts              # Lambda handler (~50 lines)
├── scripts/
│   ├── extract-sponsor-key.ts      # Extract node0 key to Secrets Manager
│   └── setup-near-cli.sh           # Configure near-cli for localnet
├── test/
│   └── faucet-stack.test.ts       # Jest unit tests
├── package.json                    # Root package.json
├── tsconfig.json                   # TypeScript config
├── cdk.json                        # CDK configuration
└── README.md                       # Main README + near-cli docs
```

## Implementation Steps

### Step 1: Initialize Repository Structure

1. **Create root package.json**

   - Dependencies: `aws-cdk-lib@^2.140.0`, `constructs@^10.3.0`, `cdk-nag@^2.27.0`
   - Dev dependencies: `typescript@^5.3.3`, `@types/node@^20.10.0`, `jest@^29.7.0`, `ts-jest@^29.1.0`, `ts-node@^10.9.2`
   - Scripts: `build`, `watch`, `test`, `synth`, `deploy`, `destroy`

2. **Create tsconfig.json**

   - Match patterns from node runner repo (strict TypeScript, ES2020 target, commonjs module)
   - Include: `bin/`, `lib/`, `test/`
   - Exclude: `node_modules/`, `cdk.out/`, `assets/`

3. **Create cdk.json**

   - Configuration similar to node runner
   - App entry: `bin/app.ts`

### Step 2: Create CDK Application (bin/app.ts)

- Import `services-stack.ts`
- Configure same AWS profile pattern: `--profile shai-sandbox-profile`
- Apply CDK Nag checks (following node runner patterns)
- Stack name: `near-localnet-services`
- Same env config pattern (accountId/region from env vars or defaults)

### Step 3: Implement Services Stack (lib/services-stack.ts)

**Stack Pattern:**

- Follow `test-stack.ts` architecture patterns
- Import values via `cdk.Fn.importValue()`:
  - `NearLocalnetRpcUrl` (from sync stack)
  - `NearLocalnetVpcId` (from common stack)
  - `NearLocalnetSecurityGroupId` (from common stack)
  - `NearLocalnetInstanceId` (from infrastructure stack)
  - `NearLocalnetNetworkId` (from sync stack)

**VPC Import:**

- Use `ec2.Vpc.fromLookup()` with imported VPC ID (requires environment context)
- OR pass VPC via props if deploying in same CDK app context

**Secrets Manager:**

- Create secret for sponsor key (`node0` full-access key)
- Secret name: `near-localnet-sponsor-key`
- Secret structure: `{ "accountId": "node0", "privateKey": "ed25519:..." }`

**IAM Roles:**

- Faucet Lambda role: VPC access + Secrets Manager read (scoped to sponsor secret)
- Helper Lambda role: Same permissions as Faucet
- Both use: `AWSLambdaVPCAccessExecutionRole` managed policy
- Both grant: `secretsmanager:GetSecretValue` on sponsor secret ARN

**Security Groups:**

- Create Lambda security group (allow outbound, ingress from VPC CIDR)
- Ensure Lambda can access NEAR RPC endpoint (port 3030) within VPC

**Lambda Functions:**

- **Faucet Lambda** (`assets/faucet-service/`):
  - Runtime: `NODEJS_20_X`
  - Handler: `handler.handler`
  - Timeout: 30 seconds
  - Memory: 512 MB
  - VPC: Private subnets with egress
  - Environment: `NEAR_RPC_URL`, `NEAR_NETWORK_ID`, `SPONSOR_ACCOUNT_ID`, `SPONSOR_KEY_ARN`, `FAUCET_MAX_PER_CALL`

- **Helper Lambda** (`assets/helper-service/`):
  - Same configuration as Faucet
  - Environment: `NEAR_RPC_URL`, `NEAR_NETWORK_ID`, `SPONSOR_ACCOUNT_ID`, `SPONSOR_KEY_ARN`

**HTTP API Gateway:**

- Create `apigatewayv2.HttpApi` (private or public, based on requirement)
- Routes:
  - `POST /faucet` → Faucet Lambda integration
  - `POST /account` → Helper Lambda integration
  - `GET /health` → Optional health check route
- Configure throttling: Default burst 100, rate 50/second
- CORS: Configure if needed for browser access

**CloudWatch:**

- Log groups for both Lambda functions
- Optional: CloudWatch dashboard for service metrics
- Alarms: Error rate thresholds

**Stack Outputs:**

- `NearLocalnetFaucetUrl` (API Gateway endpoint + `/faucet`)
- `NearLocalnetHelperUrl` (API Gateway endpoint + `/account`)
- `NearLocalnetSponsorAccountId` (node0)
- `NearLocalnetSponsorKeyArn` (Secrets Manager ARN)

### Step 4: Faucet Service Lambda (assets/faucet-service/)

**package.json:**

- Dependencies: `near-api-js@^6.5.0`, `@aws-sdk/client-secrets-manager@^3.650.0`
- Dev dependencies: `typescript@^5.3.3`, `@types/node@^20.10.0`

**handler.ts Implementation:**

- Import `APIGatewayProxyEvent`, `APIGatewayProxyResult` from `aws-lambda`
- Import `connect`, `keyStores`, `KeyPair`, `Account` from `near-api-js`
- Import `SecretsManagerClient`, `GetSecretValueCommand` from AWS SDK

**Function Logic:**

1. Parse request body: `{ accountId: string, amountNear: string }`
2. Get sponsor key from Secrets Manager using `SPONSOR_KEY_ARN` env var
3. Create KeyPair from sponsor private key
4. Connect to NEAR using `connect()` with RPC URL from env
5. Get sponsor Account object
6. Validate `amountNear` (check against `FAUCET_MAX_PER_CALL` limit)
7. Call `account.sendMoney(receiverId: accountId, amount: amountNear)`
8. Return: `{ success: true, txHash: string }` or `{ success: false, error: string }`

**Error Handling:**

- Try/catch around all operations
- Return 400 for invalid requests
- Return 500 for server errors
- Log errors to CloudWatch

**build.sh:**

- Copy pattern from `test-suite/build.sh`
- Install dependencies, compile TypeScript, create `dist-package/` with handler.js + node_modules

### Step 5: Helper Service Lambda (assets/helper-service/)

**package.json:**

- Same dependencies as Faucet

**handler.ts Implementation:**

- Parse request body: `{ mode: "implicit" | "named", publicKey?: string, accountId?: string, initialAmountNear?: string }`

**For Implicit Mode:**

1. Validate `publicKey` exists and is ED25519 format
2. Derive implicit account ID (64-hex from public key)
3. If `initialAmountNear` provided, call Faucet logic to fund account
4. Return: `{ success: true, accountId: <implicitId>, funded: boolean, txHash?: string }`

**For Named Mode (Optional):**

1. Validate `accountId` and `publicKey` exist
2. Use sponsor account to create subaccount (if parent ownership desired)
3. Fund if `initialAmountNear` provided
4. Return: `{ success: true, accountId: <namedId>, funded: boolean, txHash?: string }`

**Helper Functions:**

- `deriveImplicitAccountId(publicKey: string): string` - Convert ED25519 public key to 64-hex implicit ID
- Reuse Faucet funding logic as shared utility if possible

### Step 6: Sponsor Key Extraction Script (scripts/extract-sponsor-key.ts)

**Purpose:** Extract `node0` full-access key from deployed NEAR node and store in Secrets Manager

**Implementation:**

- Use AWS CLI/SSM commands (similar to `fetch-validator-keys.ts` pattern)
- Read validator key from `/home/ubuntu/.near/localnet/node0/validator_key.json`
- Check for `full_access_key.json` if it exists
- Store in Secrets Manager secret created by stack
- Command: `aws secretsmanager put-secret-value` or update existing secret

**Usage:**

- Run after node runner deployment completes
- Script reads instance ID from CloudFormation export
- Requires AWS profile: `shai-sandbox-profile`

### Step 7: Testing Infrastructure

**Unit Tests (test/services-stack.test.ts):**

- Test stack synthesis without errors
- Verify Lambda functions created with correct config
- Check API Gateway routes configured
- Validate CloudFormation outputs exported

**Integration Testing:**

- Manual testing guide in README
- Test `/faucet` endpoint with implicit account
- Test `/account` endpoint with implicit mode
- Validate sponsor key retrieval

### Step 8: Documentation

**README.md (root):**

- Overview of services (Faucet + Helper)
- Prerequisites: NEAR node runner must be deployed first
- Deployment instructions
- Configuration via CloudFormation exports
- API documentation (endpoints, request/response formats)
- Sponsor key setup instructions

**docs/README.md:**

- Detailed architecture diagram
- Integration with node runner
- Security considerations
- Rate limiting configuration
- Troubleshooting guide

**assets/*/README.md:**

- Service-specific documentation
- Handler implementation details
- Environment variables reference

### Step 9: Build Integration

**Root build.sh or npm script:**

- Build TypeScript: `npx tsc`
- Build Lambda packages: Run `build.sh` in each `assets/*` directory
- Sequence: `cd assets/faucet-service && bash build.sh && cd ../helper-service && bash build.sh`

**Package Scripts:**

- `build`: Compile TS + build Lambda assets
- `synth`: `cdk synth`
- `deploy`: `cdk deploy --all --profile shai-sandbox-profile`
- `destroy`: `cdk destroy --all --profile shai-sandbox-profile`

## Dependencies on Node Runner

The services stack depends on these CloudFormation exports from node runner:

- `NearLocalnetRpcUrl` (required)
- `NearLocalnetVpcId` (required)
- `NearLocalnetSecurityGroupId` (required)
- `NearLocalnetInstanceId` (required for key extraction)
- `NearLocalnetNetworkId` (optional, defaults to "localnet")

These are exported by existing stacks (no changes needed to node runner).

## Key Implementation Patterns

1. **Follow test-stack.ts patterns** for Lambda + VPC setup
2. **Use CloudFormation exports** via `cdk.Fn.importValue()` (same pattern as sync-stack imports)
3. **Secrets Manager integration** matches AWS best practices
4. **HTTP API Gateway** uses `HttpLambdaIntegration` pattern
5. **TypeScript/Node.js** follows existing Lambda handler patterns
6. **Build process** mirrors `test-suite/build.sh` approach

## Acceptance Criteria

- [ ] Repository created with complete structure
- [ ] Services stack synthesizes without errors
- [ ] Lambda functions build and package correctly
- [ ] Faucet endpoint funds implicit accounts
- [ ] Helper endpoint creates implicit accounts
- [ ] Sponsor key stored securely in Secrets Manager
- [ ] API Gateway routes configured with throttling
- [ ] CloudFormation outputs exported for cross-repo consumption
- [ ] Documentation complete with deployment guide
- [ ] Unit tests pass
- [ ] Manual integration tests successful
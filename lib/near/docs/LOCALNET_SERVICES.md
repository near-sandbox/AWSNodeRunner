# NEAR Localnet Account Services (Helper, Faucet, Implicit Accounts)

Purpose: give localnet the same “anyone can create an account and deploy” ergonomics you get on public networks. This allows upper layers (e.g., chain-signature-simulator) to avoid L1 primitives entirely.

## Goals
- Provide a funded “sponsor” identity managed by this stack (no external keys needed at higher layers)
- Expose two minimal services:
  1) Helper-like account creation (sponsored)
  2) Faucet (funding)
- Support implicit accounts as a default, testnet-like onboarding path
- Export clean outputs (URLs, ARNs) that downstream stacks consume

## Components

### 1) Sponsor Account
- A funded localnet account used to sponsor onboarding and funding (analogous to testnet helper + faucet backing funds)
- Recommended: use `node0` (genesis-funded) for localnet; store its full-access key securely
- Storage: AWS Secrets Manager (preferred) or SSM Parameter Store
- IAM: grant read access only to service task roles (not to higher layers)

Exports:
- `NearLocalnetSponsorAccountId`
- `NearLocalnetSponsorKeyArn` (if stored in Secrets Manager)

### 2) Faucet Service
Purpose: send small amounts of NEAR to requested accounts (including implicit accounts) to bootstrap usage

- API
  - POST /faucet
    - Request: `{ accountId: string, amountNear: string }`
      - `accountId` can be named or implicit (64-hex)
    - Response: `{ success: boolean, txHash?: string, error?: string }`
- Internals
  - Uses near-api-js
  - Decrypts sponsor key from Secrets Manager/SSM
  - Sends `amountNear` from sponsor → target
- Non-goals
  - No public internet exposure; keep VPC/internal with ALB + SG allowlist
  - Basic rate limiting (API Gateway throttling or custom)

Exports:
- `NearLocalnetFaucetUrl`

### 3) Helper-like Account Service
Purpose: emulate `helper.testnet.near.org` behavior for localnet so near-cli-rs-style flows work locally without a master key

- API
  - POST /account
    - Create implicit (preferred):
      - Request: `{ mode: "implicit", publicKey: "ed25519:...", initialAmountNear?: string }`
      - Behavior: derive 64-hex implicit ID from `publicKey`; faucet funds it using sponsor; returns the ID
    - Create named (optional):
      - Request: `{ mode: "named", accountId: string, publicKey: "ed25519:...", initialAmountNear?: string }`
      - Behavior: create subaccount from a configured parent (only if parent ownership is explicitly desired); otherwise prefer implicit
    - Response: `{ success: boolean, accountId: string, funded: boolean, txHash?: string, error?: string }`
- Internals
  - Uses near-api-js; for named accounts, requires parent’s full-access key (use sponsor or configured parent)
  - For implicit accounts: no parent key needed; just fund and return

Exports:
- `NearLocalnetHelperUrl`

### 4) Implicit Accounts (Recommended Default)
- Client generates ED25519 keypair (near-api-js or near-cli-rs)
- Derive implicit ID (64-hex of public key)
- Request funding from Faucet (or Helper `/account?mode=implicit`)
- Deploy contracts or transact with the implicit account’s private key

This removes the need for any “master” or parent account in upper layers.

## Architecture Additions (CDK)
- IAM/Secrets
  - Secrets Manager secret for sponsor private key
  - Task roles (Fargate or EC2) with `secretsmanager:GetSecretValue` (scoped to sponsor secret)
- Services
  - ECS Fargate services (or EC2 systemd) for Faucet and Helper
  - Internal ALB with SG allowlist; optional API Gateway
- Configuration
  - `NEAR_RPC_URL`, `NEAR_NETWORK_ID=localnet`
  - `SPONSOR_ACCOUNT_ID`, `SPONSOR_KEY_ARN`
  - `FAUCET_MAX_PER_CALL`, `FAUCET_RATE_LIMIT`
- Outputs
  - `NearLocalnetRpcUrl`
  - `NearLocalnetSponsorAccountId`
  - `NearLocalnetSponsorKeyArn`
  - `NearLocalnetFaucetUrl`
  - `NearLocalnetHelperUrl`

## Reference Flows

### A) Create and Use an Implicit Account (No Parent Key)
1. Client generates keypair
2. Compute implicit account ID (64-hex of public key)
3. Call Faucet:
   - `POST /faucet { accountId: "<implicitId>", amountNear: "1" }`
4. Use near-cli-rs to deploy/call with `sign-with-plaintext-private-key`

near-cli-rs example (adjust network config for localnet):
```
near contract deploy \
  --wasm-file ./out/contract.wasm \
  --account-id <implicitId> \
  network-config localnet \
  sign-with-plaintext-private-key \
  --signer-private-key ed25519:...
```

### B) Helper-style Create Account
1. Client generates keypair
2. Call Helper:
   - `POST /account { mode: "implicit", publicKey: "ed25519:...", initialAmountNear: "1" }`
3. Use returned account ID for subsequent operations

## near-cli-rs and Localnet
- Install: see [near/near-cli-rs](https://github.com/near/near-cli-rs)
- Configure a `localnet` network in near-cli-rs (RPC URL from `NearLocalnetRpcUrl`)
- Prefer implicit accounts with faucet/Helper to avoid parent/master management
- Test flows: deploy code, call functions with `sign-with-plaintext-private-key`

## Security & Operational Notes
- Keep services private (VPC-only) unless explicitly required
- Rate-limit faucet and helper endpoints; add basic auth or IP allowlisting
- Separate IAM for services; upper layers should never read sponsor key directly
- Centralize logging (CloudWatch), alarms on error rates and throttles

## Hand-off to Chain-Signature-Simulator
Upper layers should receive only:
- `NearLocalnetRpcUrl`
- `NearLocalnetHelperUrl` (optional) / `NearLocalnetFaucetUrl`
- Contract/account IDs as needed (or let the simulator deploy to an implicit account provided by the app)

They should NOT need:
- Any sponsor/master keys
- L1 account creation logic

## Acceptance Criteria (Dev Team)
- [ ] CDK provisions Secrets Manager, IAM, ECS, ALB for both services
- [ ] Sponsor key securely stored and only readable by service task roles
- [ ] Faucet POST /faucet funds both named and implicit accounts
- [ ] Helper POST /account supports `mode=implicit` (and optional `mode=named`)
- [ ] near-cli-rs localnet config documented; sample commands verified
- [ ] CloudFormation outputs exported and documented in README
- [ ] Basic rate limiting and logs/alarms configured

---

With these in place, localnet mirrors testnet/mainnet UX: “anyone can create an account and deploy” without upper layers managing master keys. The Node Runner delivers a production-shaped base that chain-signature-simulator can consume directly.


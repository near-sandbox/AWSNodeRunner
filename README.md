# AWS NEAR Node Runner - Development Notes

## Overview

This directory tracks the development of NEAR blockchain node deployment via AWS CDK, which will be integrated into the `cross-chain-simulator` module.

## Current Status

### Working Implementation
- **Location**: `/Users/Shai.Perednik/Documents/code_workspace/near_mobile/chain-mobil/cdk`
- **Status**: ✅ Functional localnet node deployment
- **Integration**: Currently coupled with chain-mobile app
- **Next Step**: Decouple and extract into standalone module

### Target Implementation
- **Repository**: [aws-blockchain-node-runners](https://github.com/shaiss/aws-blockchain-node-runners)
- **Branch**: `near` 
- **Location**: `lib/near/`
- **Status**: ✅ Complete - Multi-stack CDK implementation ready for use

## Integration Architecture

```
┌──────────────────────────────────────────┐
│  cross-chain-simulator                   │
│  • Imports NEAR node deployment          │
│  • Orchestrates MPC network              │
│  • Provides RPC endpoints                │
└──────────────┬───────────────────────────┘
               │
               │ imports
               ▼
┌──────────────────────────────────────────┐
│  aws-blockchain-node-runners             │
│  • NEAR node CDK stack                   │
│  • Localnet configuration                │
│  • Node runner blueprints                │
└──────────────┬───────────────────────────┘
               │
               │ deploys
               ▼
┌──────────────────────────────────────────┐
│  AWS Infrastructure                      │
│  • EC2/ECS for NEAR node                 │
│  • RPC endpoint on localhost:3030        │
│  • Real nearcore blockchain              │
└──────────────────────────────────────────┘
```

## Development Tasks

### Phase 1: Extract Working Code
- [ ] Copy working CDK code from `/chain-mobil/cdk`
- [ ] Remove chain-mobile specific dependencies
- [ ] Create standalone NEAR node runner CDK stack
- [ ] Test deployment in isolation

### Phase 2: Integrate with aws-blockchain-node-runners
- [ ] Fix issues in `lib/near/` on `near` branch
- [ ] Align with aws-blockchain-node-runners patterns
- [ ] Add proper documentation
- [ ] Create deployment examples

### Phase 3: Integration with cross-chain-simulator
- [ ] Import NEAR node runner from aws-blockchain-node-runners
- [ ] Configure RPC endpoints for MPC network
- [ ] Test with full simulator stack
- [ ] Document integration points

## Key Components

### NEAR Node Deployment (CDK)
- **Purpose**: Deploy real nearcore node on AWS
- **Infrastructure**: EC2 or ECS
- **Configuration**: Localnet settings
- **Outputs**: RPC URL (http://localhost:3030)

### RPC Configuration
- **Endpoint**: Exposed via cross-chain-simulator
- **Network**: Localnet
- **Protocol**: HTTP/WebSocket
- **Usage**: Real NEAR RPC calls from simulator

### Integration Points

#### From aws-blockchain-node-runners
```typescript
// Export from aws-blockchain-node-runners
export class NearNodeStack extends Stack {
  public readonly rpcUrl: string;
  public readonly networkId: string;
  
  constructor(scope: Construct, id: string, props: NearNodeProps) {
    // Deploy NEAR node
    // Expose RPC endpoint
  }
}
```

#### To cross-chain-simulator
```typescript
// Import in cross-chain-simulator
import { NearNodeStack } from 'aws-blockchain-node-runners/lib/near';

export class CrossChainSimulator {
  private nearNode: NearNodeStack;
  
  constructor() {
    this.nearNode = new NearNodeStack(/* ... */);
    // Use this.nearNode.rpcUrl for configuration
  }
}
```

## Working Directory Structure

```
/chain-mobil/cdk/
├── lib/
│   ├── near-node-stack.ts        # ← Extract this
│   ├── near-node-config.ts       # ← Extract this
│   └── constructs/
│       └── near-node.ts          # ← Extract this
├── bin/
│   └── near-deploy.ts            # ← Extract this
└── cdk.json
```

## Target Directory Structure

```
aws-blockchain-node-runners/
└── lib/
    └── near/
        ├── lib/
        │   ├── near-node-stack.ts
        │   ├── config/
        │   │   └── localnet.ts
        │   └── constructs/
        │       └── near-rpc-node.ts
        ├── bin/
        │   └── app.ts
        ├── README.md
        └── package.json
```

## Dependencies

### Current (in chain-mobil)
- AWS CDK v2
- @aws-cdk/aws-ec2
- @aws-cdk/aws-ecs
- nearcore (containerized)

### Target (aws-blockchain-node-runners)
- Same CDK dependencies
- Follow aws-blockchain-node-runners patterns
- Use their construct library
- Align with other blockchain blueprints

## Testing Strategy

### Localnet Testing
1. Deploy NEAR node via CDK
2. Verify RPC endpoint accessibility
3. Test basic NEAR transactions
4. Validate nearcore is running correctly

### Integration Testing
1. Import into cross-chain-simulator
2. Deploy full stack (NEAR + MPC)
3. Run NEAR Intents simulator tests
4. Verify end-to-end flow

## Notes

- **Modular Design**: NEAR node runner should be standalone and reusable
- **Configuration-Driven**: Environment (localnet/testnet/mainnet) via config
- **AWS Best Practices**: Follow aws-blockchain-node-runners patterns
- **Documentation**: Clear setup and deployment instructions

## Resources

- [AWS Blockchain Node Runners](https://github.com/aws-samples/aws-blockchain-node-runners)
- [NEAR Documentation](https://docs.near.org/)
- [nearcore GitHub](https://github.com/near/nearcore)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)

## Timeline

**Target**: Complete by Q2 2025
- **Week 1-2**: Extract and clean up code from chain-mobil
- **Week 3-4**: Fix aws-blockchain-node-runners integration
- **Week 5-6**: Integration testing with cross-chain-simulator
- **Week 7-8**: Documentation and examples

## Contact

For questions or collaboration on NEAR node runner development, see the main project documentation.


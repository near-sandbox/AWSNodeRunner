#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as nag from "cdk-nag";
import * as config from "./lib/config/localnet-config";

import { NearCommonStack } from "./lib/common-stack";
import { NearInfrastructureStack } from "./lib/infrastructure-stack";
import { NearInstallStack } from "./lib/install-stack";
import { NearSyncStack } from "./lib/sync-stack";
import { NearTestStack } from "./lib/test-stack";

/**
 * NEAR Localnet Multi-Stack Application
 * 
 * This implements a multi-stack architecture following AWS best practices:
 * 
 * Stack Progression:
 * 1. Common Stack - VPC, IAM roles, security groups (~2 min)
 * 2. Infrastructure Stack - EC2 instance, cfn-signal (~5 min)
 * 3. Install Stack - Validate NEAR installation (~15 min)
 * 4. Sync Stack - Validate service running and expose RPC (~immediate)
 */

const app = new cdk.App();
cdk.Tags.of(app).add("Project", "AWSNearLocalnet");
cdk.Tags.of(app).add("Architecture", "MultiStack");

// Phase 1: Common resources (VPC, IAM roles, security groups)
const commonStack = new NearCommonStack(app, "near-common", {
    stackName: `near-localnet-common`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    description: "NEAR Localnet Common Stack - VPC, IAM roles and security groups",
});

// Phase 2: Infrastructure Stack - EC2 instance with cfn-signal
const infrastructureStack = new NearInfrastructureStack(app, "near-infrastructure", {
    stackName: `near-localnet-infrastructure`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    description: "NEAR Localnet Infrastructure Stack - EC2 instance with cfn-signal",
    instanceType: config.localnetConfig.instanceType,
    instanceCpuType: config.localnetConfig.instanceCpuType,
    nearNetwork: config.localnetConfig.nearNetwork,
    nearVersion: config.localnetConfig.nearVersion,
    dataVolume: config.localnetConfig.dataVolume,
    limitOutTrafficMbps: config.localnetConfig.limitOutTrafficMbps,
    vpc: commonStack.vpc,
    securityGroup: commonStack.securityGroup,
    instanceRole: commonStack.instanceRole,
});

// Explicit dependency on common stack
infrastructureStack.addDependency(commonStack);

// Phase 3: Install Stack - Validate NEAR installation
const installStack = new NearInstallStack(app, "near-install", {
    stackName: `near-localnet-install`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    description: "NEAR Localnet Install Stack - Validate installation completion",
    nearNetwork: config.localnetConfig.nearNetwork,
    nearVersion: config.localnetConfig.nearVersion,
});

// Install stack depends on infrastructure being ready
installStack.addDependency(infrastructureStack);

// Phase 4: Sync Stack - Validate service and expose RPC endpoint
const syncStack = new NearSyncStack(app, "near-sync", {
    stackName: `near-localnet-sync`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    description: "NEAR Localnet Sync Stack - Validate service and expose RPC endpoint",
    nearNetwork: config.localnetConfig.nearNetwork,
    nearVersion: config.localnetConfig.nearVersion,
});

// Sync stack depends on installation being complete
syncStack.addDependency(installStack);

// Phase 5: Test Stack - Functional test suite
const testStack = new NearTestStack(app, "near-test", {
    stackName: `near-localnet-test`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    description: "NEAR Localnet Test Stack - Functional test suite",
    vpc: commonStack.vpc,
    securityGroup: commonStack.securityGroup,
    rpcUrl: syncStack.rpcUrl,
    instanceId: cdk.Fn.importValue("NearLocalnetInstanceId"),
    testConfig: {
        includeWriteTests: app.node.tryGetContext("near:test:includeWriteTests") === "true" || false,
        testDepth: (app.node.tryGetContext("near:test:testDepth") || "basic") as "basic" | "comprehensive",
    },
});

// Test stack depends on sync stack being complete
testStack.addDependency(syncStack);

console.log("✅ Multi-stack architecture configured");
console.log("⏱️  Expected timeline:");
console.log("   - Common: ~2 minutes");
console.log("   - Infrastructure: ~5 minutes (cfn-signal working)");
console.log("   - Install: ~15 minutes (validation)");
console.log("   - Sync: ~immediate (service validation)");
console.log("   - Test: ~5-10 minutes (functional tests)");

// Apply CDK Nag security checks
cdk.Aspects.of(app).add(
    new nag.AwsSolutionsChecks({
        verbose: false,
        reports: true,
        logIgnores: false,
    })
);

console.log("🔐 CDK Nag security checks enabled");


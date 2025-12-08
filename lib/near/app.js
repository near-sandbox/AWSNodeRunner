#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("source-map-support/register");
const cdk = __importStar(require("aws-cdk-lib"));
const nag = __importStar(require("cdk-nag"));
const config = __importStar(require("./lib/config/localnet-config"));
const common_stack_1 = require("./lib/common-stack");
const infrastructure_stack_1 = require("./lib/infrastructure-stack");
const install_stack_1 = require("./lib/install-stack");
const sync_stack_1 = require("./lib/sync-stack");
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
const commonStack = new common_stack_1.NearCommonStack(app, "near-common", {
    stackName: `near-localnet-common`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    description: "NEAR Localnet Common Stack - VPC, IAM roles and security groups",
});
// Phase 2: Infrastructure Stack - EC2 instance with cfn-signal
const infrastructureStack = new infrastructure_stack_1.NearInfrastructureStack(app, "near-infrastructure", {
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
const installStack = new install_stack_1.NearInstallStack(app, "near-install", {
    stackName: `near-localnet-install`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    description: "NEAR Localnet Install Stack - Validate installation completion",
    nearNetwork: config.localnetConfig.nearNetwork,
    nearVersion: config.localnetConfig.nearVersion,
});
// Install stack depends on infrastructure being ready
installStack.addDependency(infrastructureStack);
// Phase 4: Sync Stack - Validate service and expose RPC endpoint
const syncStack = new sync_stack_1.NearSyncStack(app, "near-sync", {
    stackName: `near-localnet-sync`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    description: "NEAR Localnet Sync Stack - Validate service and expose RPC endpoint",
    nearNetwork: config.localnetConfig.nearNetwork,
    nearVersion: config.localnetConfig.nearVersion,
});
// Sync stack depends on installation being complete
syncStack.addDependency(installStack);
// Phase 5: Test Stack - Functional test suite
// COMMENTED OUT: Test stack stuck in DELETE_IN_PROGRESS, blocking infrastructure updates
// const testStack = new NearTestStack(app, "near-test", {
//     stackName: `near-localnet-test`,
//     env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
//     description: "NEAR Localnet Test Stack - Functional test suite",
//     vpc: commonStack.vpc,
//     securityGroup: commonStack.securityGroup,
//     rpcUrl: syncStack.rpcUrl,
//     instanceId: cdk.Fn.importValue("NearLocalnetInstanceId"),
//     testConfig: {
//         includeWriteTests: app.node.tryGetContext("near:test:includeWriteTests") === "true" || false,
//         testDepth: (app.node.tryGetContext("near:test:testDepth") || "basic") as "basic" | "comprehensive",
//     },
// });
// Test stack depends on sync stack being complete
// testStack.addDependency(syncStack);
console.log("✅ Multi-stack architecture configured");
console.log("⏱️  Expected timeline:");
console.log("   - Common: ~2 minutes");
console.log("   - Infrastructure: ~5 minutes (cfn-signal working)");
console.log("   - Install: ~15 minutes (validation)");
console.log("   - Sync: ~immediate (service validation)");
console.log("   - Test: ~5-10 minutes (functional tests)");
// Apply CDK Nag security checks
cdk.Aspects.of(app).add(new nag.AwsSolutionsChecks({
    verbose: false,
    reports: true,
    logIgnores: false,
}));
console.log("🔐 CDK Nag security checks enabled");
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYXBwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNBLHVDQUFxQztBQUNyQyxpREFBbUM7QUFDbkMsNkNBQStCO0FBQy9CLHFFQUF1RDtBQUV2RCxxREFBcUQ7QUFDckQscUVBQXFFO0FBQ3JFLHVEQUF1RDtBQUN2RCxpREFBaUQ7QUFHakQ7Ozs7Ozs7Ozs7R0FVRztBQUVILE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBQzFCLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztBQUNuRCxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsY0FBYyxFQUFFLFlBQVksQ0FBQyxDQUFDO0FBRW5ELDhEQUE4RDtBQUM5RCxNQUFNLFdBQVcsR0FBRyxJQUFJLDhCQUFlLENBQUMsR0FBRyxFQUFFLGFBQWEsRUFBRTtJQUN4RCxTQUFTLEVBQUUsc0JBQXNCO0lBQ2pDLEdBQUcsRUFBRSxFQUFFLE9BQU8sRUFBRSxNQUFNLENBQUMsVUFBVSxDQUFDLFNBQVMsRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUU7SUFDL0UsV0FBVyxFQUFFLGlFQUFpRTtDQUNqRixDQUFDLENBQUM7QUFFSCwrREFBK0Q7QUFDL0QsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLDhDQUF1QixDQUFDLEdBQUcsRUFBRSxxQkFBcUIsRUFBRTtJQUNoRixTQUFTLEVBQUUsOEJBQThCO0lBQ3pDLEdBQUcsRUFBRSxFQUFFLE9BQU8sRUFBRSxNQUFNLENBQUMsVUFBVSxDQUFDLFNBQVMsRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUU7SUFDL0UsV0FBVyxFQUFFLG1FQUFtRTtJQUNoRixZQUFZLEVBQUUsTUFBTSxDQUFDLGNBQWMsQ0FBQyxZQUFZO0lBQ2hELGVBQWUsRUFBRSxNQUFNLENBQUMsY0FBYyxDQUFDLGVBQWU7SUFDdEQsV0FBVyxFQUFFLE1BQU0sQ0FBQyxjQUFjLENBQUMsV0FBVztJQUM5QyxXQUFXLEVBQUUsTUFBTSxDQUFDLGNBQWMsQ0FBQyxXQUFXO0lBQzlDLFVBQVUsRUFBRSxNQUFNLENBQUMsY0FBYyxDQUFDLFVBQVU7SUFDNUMsbUJBQW1CLEVBQUUsTUFBTSxDQUFDLGNBQWMsQ0FBQyxtQkFBbUI7SUFDOUQsR0FBRyxFQUFFLFdBQVcsQ0FBQyxHQUFHO0lBQ3BCLGFBQWEsRUFBRSxXQUFXLENBQUMsYUFBYTtJQUN4QyxZQUFZLEVBQUUsV0FBVyxDQUFDLFlBQVk7Q0FDekMsQ0FBQyxDQUFDO0FBRUgsc0NBQXNDO0FBQ3RDLG1CQUFtQixDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsQ0FBQztBQUUvQyxzREFBc0Q7QUFDdEQsTUFBTSxZQUFZLEdBQUcsSUFBSSxnQ0FBZ0IsQ0FBQyxHQUFHLEVBQUUsY0FBYyxFQUFFO0lBQzNELFNBQVMsRUFBRSx1QkFBdUI7SUFDbEMsR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLE1BQU0sQ0FBQyxVQUFVLENBQUMsU0FBUyxFQUFFLE1BQU0sRUFBRSxNQUFNLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRTtJQUMvRSxXQUFXLEVBQUUsZ0VBQWdFO0lBQzdFLFdBQVcsRUFBRSxNQUFNLENBQUMsY0FBYyxDQUFDLFdBQVc7SUFDOUMsV0FBVyxFQUFFLE1BQU0sQ0FBQyxjQUFjLENBQUMsV0FBVztDQUNqRCxDQUFDLENBQUM7QUFFSCxzREFBc0Q7QUFDdEQsWUFBWSxDQUFDLGFBQWEsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO0FBRWhELGlFQUFpRTtBQUNqRSxNQUFNLFNBQVMsR0FBRyxJQUFJLDBCQUFhLENBQUMsR0FBRyxFQUFFLFdBQVcsRUFBRTtJQUNsRCxTQUFTLEVBQUUsb0JBQW9CO0lBQy9CLEdBQUcsRUFBRSxFQUFFLE9BQU8sRUFBRSxNQUFNLENBQUMsVUFBVSxDQUFDLFNBQVMsRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUU7SUFDL0UsV0FBVyxFQUFFLHFFQUFxRTtJQUNsRixXQUFXLEVBQUUsTUFBTSxDQUFDLGNBQWMsQ0FBQyxXQUFXO0lBQzlDLFdBQVcsRUFBRSxNQUFNLENBQUMsY0FBYyxDQUFDLFdBQVc7Q0FDakQsQ0FBQyxDQUFDO0FBRUgsb0RBQW9EO0FBQ3BELFNBQVMsQ0FBQyxhQUFhLENBQUMsWUFBWSxDQUFDLENBQUM7QUFFdEMsOENBQThDO0FBQzlDLHlGQUF5RjtBQUN6RiwwREFBMEQ7QUFDMUQsdUNBQXVDO0FBQ3ZDLHVGQUF1RjtBQUN2Rix1RUFBdUU7QUFDdkUsNEJBQTRCO0FBQzVCLGdEQUFnRDtBQUNoRCxnQ0FBZ0M7QUFDaEMsZ0VBQWdFO0FBQ2hFLG9CQUFvQjtBQUNwQix3R0FBd0c7QUFDeEcsOEdBQThHO0FBQzlHLFNBQVM7QUFDVCxNQUFNO0FBRU4sa0RBQWtEO0FBQ2xELHNDQUFzQztBQUV0QyxPQUFPLENBQUMsR0FBRyxDQUFDLHVDQUF1QyxDQUFDLENBQUM7QUFDckQsT0FBTyxDQUFDLEdBQUcsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO0FBQ3RDLE9BQU8sQ0FBQyxHQUFHLENBQUMseUJBQXlCLENBQUMsQ0FBQztBQUN2QyxPQUFPLENBQUMsR0FBRyxDQUFDLHNEQUFzRCxDQUFDLENBQUM7QUFDcEUsT0FBTyxDQUFDLEdBQUcsQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDO0FBQ3RELE9BQU8sQ0FBQyxHQUFHLENBQUMsNENBQTRDLENBQUMsQ0FBQztBQUMxRCxPQUFPLENBQUMsR0FBRyxDQUFDLDZDQUE2QyxDQUFDLENBQUM7QUFFM0QsZ0NBQWdDO0FBQ2hDLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FDbkIsSUFBSSxHQUFHLENBQUMsa0JBQWtCLENBQUM7SUFDdkIsT0FBTyxFQUFFLEtBQUs7SUFDZCxPQUFPLEVBQUUsSUFBSTtJQUNiLFVBQVUsRUFBRSxLQUFLO0NBQ3BCLENBQUMsQ0FDTCxDQUFDO0FBRUYsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0IFwic291cmNlLW1hcC1zdXBwb3J0L3JlZ2lzdGVyXCI7XG5pbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgKiBhcyBuYWcgZnJvbSBcImNkay1uYWdcIjtcbmltcG9ydCAqIGFzIGNvbmZpZyBmcm9tIFwiLi9saWIvY29uZmlnL2xvY2FsbmV0LWNvbmZpZ1wiO1xuXG5pbXBvcnQgeyBOZWFyQ29tbW9uU3RhY2sgfSBmcm9tIFwiLi9saWIvY29tbW9uLXN0YWNrXCI7XG5pbXBvcnQgeyBOZWFySW5mcmFzdHJ1Y3R1cmVTdGFjayB9IGZyb20gXCIuL2xpYi9pbmZyYXN0cnVjdHVyZS1zdGFja1wiO1xuaW1wb3J0IHsgTmVhckluc3RhbGxTdGFjayB9IGZyb20gXCIuL2xpYi9pbnN0YWxsLXN0YWNrXCI7XG5pbXBvcnQgeyBOZWFyU3luY1N0YWNrIH0gZnJvbSBcIi4vbGliL3N5bmMtc3RhY2tcIjtcbmltcG9ydCB7IE5lYXJUZXN0U3RhY2sgfSBmcm9tIFwiLi9saWIvdGVzdC1zdGFja1wiO1xuXG4vKipcbiAqIE5FQVIgTG9jYWxuZXQgTXVsdGktU3RhY2sgQXBwbGljYXRpb25cbiAqIFxuICogVGhpcyBpbXBsZW1lbnRzIGEgbXVsdGktc3RhY2sgYXJjaGl0ZWN0dXJlIGZvbGxvd2luZyBBV1MgYmVzdCBwcmFjdGljZXM6XG4gKiBcbiAqIFN0YWNrIFByb2dyZXNzaW9uOlxuICogMS4gQ29tbW9uIFN0YWNrIC0gVlBDLCBJQU0gcm9sZXMsIHNlY3VyaXR5IGdyb3VwcyAofjIgbWluKVxuICogMi4gSW5mcmFzdHJ1Y3R1cmUgU3RhY2sgLSBFQzIgaW5zdGFuY2UsIGNmbi1zaWduYWwgKH41IG1pbilcbiAqIDMuIEluc3RhbGwgU3RhY2sgLSBWYWxpZGF0ZSBORUFSIGluc3RhbGxhdGlvbiAofjE1IG1pbilcbiAqIDQuIFN5bmMgU3RhY2sgLSBWYWxpZGF0ZSBzZXJ2aWNlIHJ1bm5pbmcgYW5kIGV4cG9zZSBSUEMgKH5pbW1lZGlhdGUpXG4gKi9cblxuY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcbmNkay5UYWdzLm9mKGFwcCkuYWRkKFwiUHJvamVjdFwiLCBcIkFXU05lYXJMb2NhbG5ldFwiKTtcbmNkay5UYWdzLm9mKGFwcCkuYWRkKFwiQXJjaGl0ZWN0dXJlXCIsIFwiTXVsdGlTdGFja1wiKTtcblxuLy8gUGhhc2UgMTogQ29tbW9uIHJlc291cmNlcyAoVlBDLCBJQU0gcm9sZXMsIHNlY3VyaXR5IGdyb3VwcylcbmNvbnN0IGNvbW1vblN0YWNrID0gbmV3IE5lYXJDb21tb25TdGFjayhhcHAsIFwibmVhci1jb21tb25cIiwge1xuICAgIHN0YWNrTmFtZTogYG5lYXItbG9jYWxuZXQtY29tbW9uYCxcbiAgICBlbnY6IHsgYWNjb3VudDogY29uZmlnLmJhc2VDb25maWcuYWNjb3VudElkLCByZWdpb246IGNvbmZpZy5iYXNlQ29uZmlnLnJlZ2lvbiB9LFxuICAgIGRlc2NyaXB0aW9uOiBcIk5FQVIgTG9jYWxuZXQgQ29tbW9uIFN0YWNrIC0gVlBDLCBJQU0gcm9sZXMgYW5kIHNlY3VyaXR5IGdyb3Vwc1wiLFxufSk7XG5cbi8vIFBoYXNlIDI6IEluZnJhc3RydWN0dXJlIFN0YWNrIC0gRUMyIGluc3RhbmNlIHdpdGggY2ZuLXNpZ25hbFxuY29uc3QgaW5mcmFzdHJ1Y3R1cmVTdGFjayA9IG5ldyBOZWFySW5mcmFzdHJ1Y3R1cmVTdGFjayhhcHAsIFwibmVhci1pbmZyYXN0cnVjdHVyZVwiLCB7XG4gICAgc3RhY2tOYW1lOiBgbmVhci1sb2NhbG5ldC1pbmZyYXN0cnVjdHVyZWAsXG4gICAgZW52OiB7IGFjY291bnQ6IGNvbmZpZy5iYXNlQ29uZmlnLmFjY291bnRJZCwgcmVnaW9uOiBjb25maWcuYmFzZUNvbmZpZy5yZWdpb24gfSxcbiAgICBkZXNjcmlwdGlvbjogXCJORUFSIExvY2FsbmV0IEluZnJhc3RydWN0dXJlIFN0YWNrIC0gRUMyIGluc3RhbmNlIHdpdGggY2ZuLXNpZ25hbFwiLFxuICAgIGluc3RhbmNlVHlwZTogY29uZmlnLmxvY2FsbmV0Q29uZmlnLmluc3RhbmNlVHlwZSxcbiAgICBpbnN0YW5jZUNwdVR5cGU6IGNvbmZpZy5sb2NhbG5ldENvbmZpZy5pbnN0YW5jZUNwdVR5cGUsXG4gICAgbmVhck5ldHdvcms6IGNvbmZpZy5sb2NhbG5ldENvbmZpZy5uZWFyTmV0d29yayxcbiAgICBuZWFyVmVyc2lvbjogY29uZmlnLmxvY2FsbmV0Q29uZmlnLm5lYXJWZXJzaW9uLFxuICAgIGRhdGFWb2x1bWU6IGNvbmZpZy5sb2NhbG5ldENvbmZpZy5kYXRhVm9sdW1lLFxuICAgIGxpbWl0T3V0VHJhZmZpY01icHM6IGNvbmZpZy5sb2NhbG5ldENvbmZpZy5saW1pdE91dFRyYWZmaWNNYnBzLFxuICAgIHZwYzogY29tbW9uU3RhY2sudnBjLFxuICAgIHNlY3VyaXR5R3JvdXA6IGNvbW1vblN0YWNrLnNlY3VyaXR5R3JvdXAsXG4gICAgaW5zdGFuY2VSb2xlOiBjb21tb25TdGFjay5pbnN0YW5jZVJvbGUsXG59KTtcblxuLy8gRXhwbGljaXQgZGVwZW5kZW5jeSBvbiBjb21tb24gc3RhY2tcbmluZnJhc3RydWN0dXJlU3RhY2suYWRkRGVwZW5kZW5jeShjb21tb25TdGFjayk7XG5cbi8vIFBoYXNlIDM6IEluc3RhbGwgU3RhY2sgLSBWYWxpZGF0ZSBORUFSIGluc3RhbGxhdGlvblxuY29uc3QgaW5zdGFsbFN0YWNrID0gbmV3IE5lYXJJbnN0YWxsU3RhY2soYXBwLCBcIm5lYXItaW5zdGFsbFwiLCB7XG4gICAgc3RhY2tOYW1lOiBgbmVhci1sb2NhbG5ldC1pbnN0YWxsYCxcbiAgICBlbnY6IHsgYWNjb3VudDogY29uZmlnLmJhc2VDb25maWcuYWNjb3VudElkLCByZWdpb246IGNvbmZpZy5iYXNlQ29uZmlnLnJlZ2lvbiB9LFxuICAgIGRlc2NyaXB0aW9uOiBcIk5FQVIgTG9jYWxuZXQgSW5zdGFsbCBTdGFjayAtIFZhbGlkYXRlIGluc3RhbGxhdGlvbiBjb21wbGV0aW9uXCIsXG4gICAgbmVhck5ldHdvcms6IGNvbmZpZy5sb2NhbG5ldENvbmZpZy5uZWFyTmV0d29yayxcbiAgICBuZWFyVmVyc2lvbjogY29uZmlnLmxvY2FsbmV0Q29uZmlnLm5lYXJWZXJzaW9uLFxufSk7XG5cbi8vIEluc3RhbGwgc3RhY2sgZGVwZW5kcyBvbiBpbmZyYXN0cnVjdHVyZSBiZWluZyByZWFkeVxuaW5zdGFsbFN0YWNrLmFkZERlcGVuZGVuY3koaW5mcmFzdHJ1Y3R1cmVTdGFjayk7XG5cbi8vIFBoYXNlIDQ6IFN5bmMgU3RhY2sgLSBWYWxpZGF0ZSBzZXJ2aWNlIGFuZCBleHBvc2UgUlBDIGVuZHBvaW50XG5jb25zdCBzeW5jU3RhY2sgPSBuZXcgTmVhclN5bmNTdGFjayhhcHAsIFwibmVhci1zeW5jXCIsIHtcbiAgICBzdGFja05hbWU6IGBuZWFyLWxvY2FsbmV0LXN5bmNgLFxuICAgIGVudjogeyBhY2NvdW50OiBjb25maWcuYmFzZUNvbmZpZy5hY2NvdW50SWQsIHJlZ2lvbjogY29uZmlnLmJhc2VDb25maWcucmVnaW9uIH0sXG4gICAgZGVzY3JpcHRpb246IFwiTkVBUiBMb2NhbG5ldCBTeW5jIFN0YWNrIC0gVmFsaWRhdGUgc2VydmljZSBhbmQgZXhwb3NlIFJQQyBlbmRwb2ludFwiLFxuICAgIG5lYXJOZXR3b3JrOiBjb25maWcubG9jYWxuZXRDb25maWcubmVhck5ldHdvcmssXG4gICAgbmVhclZlcnNpb246IGNvbmZpZy5sb2NhbG5ldENvbmZpZy5uZWFyVmVyc2lvbixcbn0pO1xuXG4vLyBTeW5jIHN0YWNrIGRlcGVuZHMgb24gaW5zdGFsbGF0aW9uIGJlaW5nIGNvbXBsZXRlXG5zeW5jU3RhY2suYWRkRGVwZW5kZW5jeShpbnN0YWxsU3RhY2spO1xuXG4vLyBQaGFzZSA1OiBUZXN0IFN0YWNrIC0gRnVuY3Rpb25hbCB0ZXN0IHN1aXRlXG4vLyBDT01NRU5URUQgT1VUOiBUZXN0IHN0YWNrIHN0dWNrIGluIERFTEVURV9JTl9QUk9HUkVTUywgYmxvY2tpbmcgaW5mcmFzdHJ1Y3R1cmUgdXBkYXRlc1xuLy8gY29uc3QgdGVzdFN0YWNrID0gbmV3IE5lYXJUZXN0U3RhY2soYXBwLCBcIm5lYXItdGVzdFwiLCB7XG4vLyAgICAgc3RhY2tOYW1lOiBgbmVhci1sb2NhbG5ldC10ZXN0YCxcbi8vICAgICBlbnY6IHsgYWNjb3VudDogY29uZmlnLmJhc2VDb25maWcuYWNjb3VudElkLCByZWdpb246IGNvbmZpZy5iYXNlQ29uZmlnLnJlZ2lvbiB9LFxuLy8gICAgIGRlc2NyaXB0aW9uOiBcIk5FQVIgTG9jYWxuZXQgVGVzdCBTdGFjayAtIEZ1bmN0aW9uYWwgdGVzdCBzdWl0ZVwiLFxuLy8gICAgIHZwYzogY29tbW9uU3RhY2sudnBjLFxuLy8gICAgIHNlY3VyaXR5R3JvdXA6IGNvbW1vblN0YWNrLnNlY3VyaXR5R3JvdXAsXG4vLyAgICAgcnBjVXJsOiBzeW5jU3RhY2sucnBjVXJsLFxuLy8gICAgIGluc3RhbmNlSWQ6IGNkay5Gbi5pbXBvcnRWYWx1ZShcIk5lYXJMb2NhbG5ldEluc3RhbmNlSWRcIiksXG4vLyAgICAgdGVzdENvbmZpZzoge1xuLy8gICAgICAgICBpbmNsdWRlV3JpdGVUZXN0czogYXBwLm5vZGUudHJ5R2V0Q29udGV4dChcIm5lYXI6dGVzdDppbmNsdWRlV3JpdGVUZXN0c1wiKSA9PT0gXCJ0cnVlXCIgfHwgZmFsc2UsXG4vLyAgICAgICAgIHRlc3REZXB0aDogKGFwcC5ub2RlLnRyeUdldENvbnRleHQoXCJuZWFyOnRlc3Q6dGVzdERlcHRoXCIpIHx8IFwiYmFzaWNcIikgYXMgXCJiYXNpY1wiIHwgXCJjb21wcmVoZW5zaXZlXCIsXG4vLyAgICAgfSxcbi8vIH0pO1xuXG4vLyBUZXN0IHN0YWNrIGRlcGVuZHMgb24gc3luYyBzdGFjayBiZWluZyBjb21wbGV0ZVxuLy8gdGVzdFN0YWNrLmFkZERlcGVuZGVuY3koc3luY1N0YWNrKTtcblxuY29uc29sZS5sb2coXCLinIUgTXVsdGktc3RhY2sgYXJjaGl0ZWN0dXJlIGNvbmZpZ3VyZWRcIik7XG5jb25zb2xlLmxvZyhcIuKPse+4jyAgRXhwZWN0ZWQgdGltZWxpbmU6XCIpO1xuY29uc29sZS5sb2coXCIgICAtIENvbW1vbjogfjIgbWludXRlc1wiKTtcbmNvbnNvbGUubG9nKFwiICAgLSBJbmZyYXN0cnVjdHVyZTogfjUgbWludXRlcyAoY2ZuLXNpZ25hbCB3b3JraW5nKVwiKTtcbmNvbnNvbGUubG9nKFwiICAgLSBJbnN0YWxsOiB+MTUgbWludXRlcyAodmFsaWRhdGlvbilcIik7XG5jb25zb2xlLmxvZyhcIiAgIC0gU3luYzogfmltbWVkaWF0ZSAoc2VydmljZSB2YWxpZGF0aW9uKVwiKTtcbmNvbnNvbGUubG9nKFwiICAgLSBUZXN0OiB+NS0xMCBtaW51dGVzIChmdW5jdGlvbmFsIHRlc3RzKVwiKTtcblxuLy8gQXBwbHkgQ0RLIE5hZyBzZWN1cml0eSBjaGVja3NcbmNkay5Bc3BlY3RzLm9mKGFwcCkuYWRkKFxuICAgIG5ldyBuYWcuQXdzU29sdXRpb25zQ2hlY2tzKHtcbiAgICAgICAgdmVyYm9zZTogZmFsc2UsXG4gICAgICAgIHJlcG9ydHM6IHRydWUsXG4gICAgICAgIGxvZ0lnbm9yZXM6IGZhbHNlLFxuICAgIH0pXG4pO1xuXG5jb25zb2xlLmxvZyhcIvCflJAgQ0RLIE5hZyBzZWN1cml0eSBjaGVja3MgZW5hYmxlZFwiKTtcblxuIl19
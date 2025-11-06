#!/usr/bin/env node
/**
 * Configuration Export Script for cross-chain-simulator
 *
 * Reads CloudFormation stack outputs and generates configuration
 * files consumable by the @near-sandbox/cross-chain-simulator NPM package
 */
interface LocalnetConfig {
    rpcUrl: string;
    networkId: "localnet";
    instanceId?: string;
    instancePrivateIp?: string;
    instancePublicIp?: string;
}
declare function exportConfig(): void;
export { exportConfig, LocalnetConfig };

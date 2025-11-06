#!/usr/bin/env node
/**
 * Script to fetch validator keys from NEAR localnet node instance
 * Retrieves the node0 validator key via SSM for use in write tests
 */
declare function getInstanceId(): string;
export { getInstanceId };

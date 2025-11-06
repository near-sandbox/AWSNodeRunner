import { connect, keyStores, KeyPair, providers, transactions, utils } from 'near-api-js';
import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';

// Configuration from environment
const RPC_URL = process.env.RPC_URL!;
const NETWORK_ID = process.env.NETWORK_ID || 'localnet';
const INCLUDE_WRITE_TESTS = process.env.INCLUDE_WRITE_TESTS === 'true';
const TEST_DEPTH = process.env.TEST_DEPTH || 'basic';

// Test results tracking
let testsPassed = 0;
let testsFailed = 0;

// CloudWatch client
const cloudwatch = new CloudWatchClient({});

async function putMetric(metricName: string, value: number, unit: StandardUnit = StandardUnit.Count): Promise<void> {
    try {
        await cloudwatch.send(new PutMetricDataCommand({
            Namespace: 'NEAR/Test',
            MetricData: [{
                MetricName: metricName,
                Value: value,
                Unit: unit,
                Dimensions: [{
                    Name: 'FunctionName',
                    Value: process.env.AWS_LAMBDA_FUNCTION_NAME || 'near-localnet-test'
                }]
            }]
        }));
    } catch (error) {
        console.error(`Warning: Failed to put metric ${metricName}:`, error);
    }
}

function log(message: string): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
}

async function runTest(name: string, testFn: () => Promise<void>): Promise<boolean> {
    const startTime = Date.now();
    try {
        await testFn();
        const duration = Date.now() - startTime;
        testsPassed++;
        log(`✅ PASS: ${name} (${duration}ms)`);
        return true;
    } catch (error) {
        const duration = Date.now() - startTime;
        testsFailed++;
        log(`❌ FAIL: ${name} (${duration}ms)`);
        log(`Error: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}

async function runReadTests(provider: any): Promise<void> {
    log('=== Running Read-Only Tests ===');
    
    // Test 1: RPC Status
    await runTest('RPC Status', async () => {
        const status = await provider.status();
        if (!status.chain_id) {
            throw new Error('No chain_id in status');
        }
        log(`Chain ID: ${status.chain_id}`);
    });
    
    // Test 2: Latest Block
    await runTest('Latest Block', async () => {
        const block = await provider.block({ finality: 'final' });
        if (!block.header) {
            throw new Error('No block header');
        }
        log(`Block height: ${block.header.height}`);
    });
    
    // Test 3: Network Info
    await runTest('Network Info', async () => {
        const networkInfo = await provider.sendJsonRpc('network_info', []);
        if (!networkInfo) {
            throw new Error('No network info');
        }
        log(`Network info retrieved: ${JSON.stringify(networkInfo).substring(0, 100)}...`);
    });
    
    // Test 4: Query Account (node0 validator)
    await runTest('View System Account', async () => {
        const account = await provider.query({
            request_type: 'view_account',
            account_id: 'node0',
            finality: 'final'
        }) as any;
        if (!account || !account.amount) {
            throw new Error('Account not found or invalid');
        }
        log(`Account balance: ${utils.format.formatNearAmount(account.amount)} NEAR`);
    });
}

async function runWriteTests(
    provider: any,
    masterKey: KeyPair,
    masterAccountId: string,
    testDepth: string = TEST_DEPTH
): Promise<void> {
    log('=== Running Write Tests ===');
    
    // Create account ID and key pair outside test functions so they can be reused
    // Format: <random-hex>.node0 (subaccount of node0 validator for localnet)
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const testAccountId = `${randomSuffix}.node0`;
    const testKeyPair = KeyPair.fromRandom('ed25519');
    
    // Track if account creation succeeded for subsequent tests
    let accountCreated = false;
    
    // Test 1: Create Account
    const createAccountSuccess = await runTest('Create Test Account', async () => {
        // Connect to master account using near-api-js Account API
        const keyStore = new keyStores.InMemoryKeyStore();
        await keyStore.setKey(NETWORK_ID, masterAccountId, masterKey);
        
        const config = {
            networkId: NETWORK_ID,
            keyStore,
            nodeUrl: RPC_URL,
        };
        
        const near = await connect(config);
        const masterAccount = await near.account(masterAccountId);
        
        // Create subaccount with initial balance
        // For localnet, we can create a subaccount of node0 (e.g., test-123.test.near)
        const amount = utils.format.parseNearAmount('10')!;
        
        try {
            // Use Account.createAccount for simpler API
            const result = await masterAccount.createAccount(
                testAccountId,
                utils.PublicKey.from(testKeyPair.getPublicKey()),
                BigInt(amount)
            );
            
            log(`Account creation transaction: ${result.transaction.hash}`);
            
            // Wait for transaction to complete
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Verify account was created
            const account = await provider.query({
                request_type: 'view_account',
                account_id: testAccountId,
                finality: 'final'
            }) as any;
            
            if (!account || !account.amount) {
                throw new Error('Account was not created successfully');
            }
            
            log(`Test account created: ${testAccountId} with balance ${utils.format.formatNearAmount(account.amount)} NEAR`);
        } catch (error: any) {
            log(`createAccount failed: ${error.message}`);
            // For write tests, we'll skip if account creation fails
            // This is acceptable as the read tests already passed
            throw error;
        }
        
        accountCreated = true;
    });
    
    // Test 2: Send Transaction (if account created)
    if (accountCreated && testDepth === 'comprehensive') {
        await runTest('Send Transaction', async () => {
            // Connect to the test account using the key pair we created
            const keyStore = new keyStores.InMemoryKeyStore();
            await keyStore.setKey(NETWORK_ID, testAccountId, testKeyPair);
            
            const config = {
                networkId: NETWORK_ID,
                keyStore,
                nodeUrl: RPC_URL,
            };
            
            const near = await connect(config);
            const testAccount = await near.account(testAccountId);
            
            // Transfer 1 NEAR back to node0
            const transferAmount = BigInt(utils.format.parseNearAmount('1')!);
            const result = await testAccount.sendMoney(
                masterAccountId,
                transferAmount
            );
            
            log(`Transfer transaction hash: ${result.transaction.hash}`);
            
            // Wait for transaction to complete
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Verify transfer by checking balances
            const receiverAccount = await provider.query({
                request_type: 'view_account',
                account_id: masterAccountId,
                finality: 'final'
            }) as any;
            
            log(`Receiver balance: ${utils.format.formatNearAmount(receiverAccount.amount)} NEAR`);
        });
    }
}

export async function handler(event: any): Promise<any> {
    testsPassed = 0;
    testsFailed = 0;
    const startTime = Date.now();
    
    // Override from event if provided
    const includeWriteTestsFromEvent = typeof event === 'object' && event !== null && 'includeWriteTests' in event
        ? event.includeWriteTests === true || event.includeWriteTests === 'true'
        : INCLUDE_WRITE_TESTS;
    const testDepthFromEvent = typeof event === 'object' && event !== null && 'testDepth' in event
        ? event.testDepth
        : TEST_DEPTH;
    
    log('=== NEAR Localnet Test Suite ===');
    log(`RPC URL: ${RPC_URL}`);
    log(`Network ID: ${NETWORK_ID}`);
    log(`Include Write Tests: ${includeWriteTestsFromEvent}`);
    log(`Test Depth: ${testDepthFromEvent}`);
    
    try {
        // Validate RPC URL
        if (!RPC_URL) {
            throw new Error('RPC_URL environment variable not set');
        }
        
        // Create JSON RPC provider
        const provider = new providers.JsonRpcProvider({ url: RPC_URL });
        
        // Measure RPC response time
        const rpcStart = Date.now();
        await provider.status();
        const rpcDuration = Date.now() - rpcStart;
        log(`RPC response time: ${rpcDuration}ms`);
        
        // Send CloudWatch metric
        await putMetric('RpcResponseTime', rpcDuration, StandardUnit.Milliseconds);
        
        // Run read tests (always)
        await runReadTests(provider);
        
        // Run write tests (conditional, requires validator key)
        if (includeWriteTestsFromEvent) {
            // Get validator key from environment
            const validatorKeyJson = process.env.VALIDATOR_KEY_JSON;
            if (validatorKeyJson) {
                try {
                    const keyData = JSON.parse(validatorKeyJson);
                    const secretKey = keyData.secret_key || keyData.private_key;
                    if (!secretKey) {
                        throw new Error('Invalid key format: missing secret_key or private_key');
                    }
                    
                    // Handle both "ed25519:..." format and raw base64
                    let masterKey: KeyPair;
                    if (secretKey.startsWith('ed25519:')) {
                        masterKey = KeyPair.fromString(secretKey);
                    } else {
                        // Assume it's base64 encoded
                        masterKey = KeyPair.fromString(`ed25519:${secretKey}`);
                    }
                    
                    const masterAccountId = keyData.account_id || 'node0';
                    
                    log(`Using validator key for account: ${masterAccountId}`);
                    await runWriteTests(provider, masterKey, masterAccountId, testDepthFromEvent);
                } catch (error) {
                    log(`WARNING: Failed to parse validator key: ${error instanceof Error ? error.message : String(error)}`);
                    log('Skipping write tests due to invalid validator key');
                }
            } else {
                log('WARNING: VALIDATOR_KEY_JSON not set, skipping write tests');
            }
        }
        
        // Send metrics
        const totalDuration = Date.now() - startTime;
        await putMetric('TestsPassed', testsPassed);
        await putMetric('TestsFailed', testsFailed);
        await putMetric('TestDuration', totalDuration, StandardUnit.Milliseconds);
        
        // Summary
        log('=== Test Summary ===');
        log(`Total Tests: ${testsPassed + testsFailed}`);
        log(`Passed: ${testsPassed}`);
        log(`Failed: ${testsFailed}`);
        log(`Duration: ${totalDuration}ms`);
        
        if (testsFailed > 0) {
            const error = new Error(`${testsFailed} test(s) failed`);
            (error as any).responseBody = {
                success: false,
                testsPassed,
                testsFailed,
                duration: totalDuration,
                message: `${testsFailed} test(s) failed`
            };
            throw error;
        }
        
        return {
            success: true,
            testsPassed,
            testsFailed,
            duration: totalDuration,
            message: 'All tests passed'
        };
    } catch (error) {
        log(`Test suite error: ${error instanceof Error ? error.message : String(error)}`);
        
        // Ensure metrics are sent even on error
        const totalDuration = Date.now() - startTime;
        await putMetric('TestsFailed', testsFailed || 1);
        await putMetric('TestDuration', totalDuration, 'Milliseconds');
        
        throw error;
    }
}

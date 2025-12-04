#!/usr/bin/env node
/**
 * Script to fetch validator keys from NEAR localnet node instance
 * Retrieves the node0 validator key via SSM for use in write tests
 */

import { execSync } from 'child_process';
import * as fs from 'fs';

const PROFILE = process.env.AWS_PROFILE;
if (!PROFILE) {
    console.error("❌ Error: AWS_PROFILE environment variable is required");
    console.error("   Set it with: export AWS_PROFILE=your-profile-name");
    console.error("   Or add it to .env file (not tracked in git)");
    process.exit(1);
}

// Get instance ID from stack output
function getInstanceId(): string {
    try {
        const stackName = 'near-localnet-infrastructure';
        const command = `aws cloudformation describe-stacks --stack-name ${stackName} --profile ${PROFILE} --query "Stacks[0].Outputs[?OutputKey=='nearinstanceid'].OutputValue" --output text`;
        const instanceId = execSync(command, { encoding: 'utf8' }).trim();
        if (!instanceId || instanceId === 'None') {
            throw new Error('Instance ID not found in stack outputs');
        }
        return instanceId;
    } catch (error) {
        console.error('Error getting instance ID:', error);
        throw error;
    }
}

async function main() {
    console.log('=== Fetching Validator Keys from NEAR Node ===');
    console.log(`Profile: ${PROFILE}\n`);
    
    let instanceId: string;
    try {
        instanceId = getInstanceId();
        console.log(`Instance ID: ${instanceId}`);
    } catch (error) {
        console.error('Failed to get instance ID. Ensure the infrastructure stack is deployed.');
        process.exit(1);
    }
    
    const keyPath = '/home/ubuntu/.near/localnet/node0/validator_key.json';
    
    console.log(`Fetching validator key from ${keyPath}...`);
    
    // Send SSM command to read node0 validator key
    const commandId = execSync(
        `aws ssm send-command \
            --instance-ids ${instanceId} \
            --profile ${PROFILE} \
            --document-name "AWS-RunShellScript" \
            --parameters 'commands=["cat ${keyPath}"]' \
            --query "Command.CommandId" \
            --output text`,
        { encoding: 'utf8' }
    ).trim();
    
    console.log(`Command ID: ${commandId}`);
    console.log('Waiting for command completion...');
    
    // Wait for command to complete (polling)
    let status = 'InProgress';
    let attempts = 0;
    const maxAttempts = 30; // 5 minutes max
    
    while (status === 'InProgress' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
        
        try {
            const statusOutput = execSync(
                `aws ssm get-command-invocation \
                    --command-id ${commandId} \
                    --instance-id ${instanceId} \
                    --profile ${PROFILE} \
                    --query "Status" \
                    --output text`,
                { encoding: 'utf8' }
            ).trim();
            
            status = statusOutput;
            attempts++;
            process.stdout.write('.');
            
            if (status === 'Success' || status === 'Failed' || status === 'Cancelled' || status === 'TimedOut') {
                break;
            }
        } catch (error) {
            console.error('\nError checking command status:', error);
            break;
        }
    }
    
    console.log('\n');
    
    if (status !== 'Success') {
        console.error(`Command ${status.toLowerCase()}`);
        console.error('Failed to retrieve validator key');
        process.exit(1);
    }
    
    // Get command output
    const keyJson = execSync(
        `aws ssm get-command-invocation \
            --command-id ${commandId} \
            --instance-id ${instanceId} \
            --profile ${PROFILE} \
            --query "StandardOutputContent" \
            --output text`,
        { encoding: 'utf8' }
    ).trim();
    
    if (!keyJson || keyJson === 'None') {
        console.error('No key data retrieved');
        process.exit(1);
    }
    
    // Validate JSON
    try {
        JSON.parse(keyJson);
    } catch (error) {
        console.error('Invalid JSON retrieved:');
        console.error(keyJson);
        process.exit(1);
    }
    
    // Save to file
    const outputPath = '/tmp/validator-key.json';
    fs.writeFileSync(outputPath, keyJson);
    
    console.log(`✅ Validator key saved to ${outputPath}`);
    console.log('\nKey structure:');
    const keyData = JSON.parse(keyJson);
    console.log(`  Account ID: ${keyData.account_id || 'N/A'}`);
    console.log(`  Public Key: ${keyData.public_key ? keyData.public_key.substring(0, 20) + '...' : 'N/A'}`);
    console.log(`  Secret Key: ${keyData.secret_key ? '***hidden***' : (keyData.private_key ? '***hidden***' : 'N/A')}`);
    console.log('\nTo use this key, set:');
    console.log(`export VALIDATOR_KEY_JSON='${JSON.stringify(keyData)}'`);
}

// Run if executed directly
if (require.main === module) {
    main().catch(error => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });
}

export { getInstanceId };

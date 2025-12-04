#!/usr/bin/env node
"use strict";
/**
 * Script to fetch validator keys from NEAR localnet node instance
 * Retrieves the node0 validator key via SSM for use in write tests
 */
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
exports.getInstanceId = getInstanceId;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const PROFILE = process.env.AWS_PROFILE;
if (!PROFILE) {
    console.error("❌ Error: AWS_PROFILE environment variable is required");
    console.error("   Set it with: export AWS_PROFILE=your-profile-name");
    console.error("   Or add it to .env file (not tracked in git)");
    process.exit(1);
}
// Get instance ID from stack output
function getInstanceId() {
    try {
        const stackName = 'near-localnet-infrastructure';
        const command = `aws cloudformation describe-stacks --stack-name ${stackName} --profile ${PROFILE} --query "Stacks[0].Outputs[?OutputKey=='nearinstanceid'].OutputValue" --output text`;
        const instanceId = (0, child_process_1.execSync)(command, { encoding: 'utf8' }).trim();
        if (!instanceId || instanceId === 'None') {
            throw new Error('Instance ID not found in stack outputs');
        }
        return instanceId;
    }
    catch (error) {
        console.error('Error getting instance ID:', error);
        throw error;
    }
}
async function main() {
    console.log('=== Fetching Validator Keys from NEAR Node ===');
    console.log(`Profile: ${PROFILE}\n`);
    let instanceId;
    try {
        instanceId = getInstanceId();
        console.log(`Instance ID: ${instanceId}`);
    }
    catch (error) {
        console.error('Failed to get instance ID. Ensure the infrastructure stack is deployed.');
        process.exit(1);
    }
    const keyPath = '/home/ubuntu/.near/localnet/node0/validator_key.json';
    console.log(`Fetching validator key from ${keyPath}...`);
    // Send SSM command to read node0 validator key
    const commandId = (0, child_process_1.execSync)(`aws ssm send-command \
            --instance-ids ${instanceId} \
            --profile ${PROFILE} \
            --document-name "AWS-RunShellScript" \
            --parameters 'commands=["cat ${keyPath}"]' \
            --query "Command.CommandId" \
            --output text`, { encoding: 'utf8' }).trim();
    console.log(`Command ID: ${commandId}`);
    console.log('Waiting for command completion...');
    // Wait for command to complete (polling)
    let status = 'InProgress';
    let attempts = 0;
    const maxAttempts = 30; // 5 minutes max
    while (status === 'InProgress' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
        try {
            const statusOutput = (0, child_process_1.execSync)(`aws ssm get-command-invocation \
                    --command-id ${commandId} \
                    --instance-id ${instanceId} \
                    --profile ${PROFILE} \
                    --query "Status" \
                    --output text`, { encoding: 'utf8' }).trim();
            status = statusOutput;
            attempts++;
            process.stdout.write('.');
            if (status === 'Success' || status === 'Failed' || status === 'Cancelled' || status === 'TimedOut') {
                break;
            }
        }
        catch (error) {
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
    const keyJson = (0, child_process_1.execSync)(`aws ssm get-command-invocation \
            --command-id ${commandId} \
            --instance-id ${instanceId} \
            --profile ${PROFILE} \
            --query "StandardOutputContent" \
            --output text`, { encoding: 'utf8' }).trim();
    if (!keyJson || keyJson === 'None') {
        console.error('No key data retrieved');
        process.exit(1);
    }
    // Validate JSON
    try {
        JSON.parse(keyJson);
    }
    catch (error) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmV0Y2gtdmFsaWRhdG9yLWtleXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJmZXRjaC12YWxpZGF0b3Ita2V5cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUNBOzs7R0FHRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFvSk0sc0NBQWE7QUFsSnRCLGlEQUF5QztBQUN6Qyx1Q0FBeUI7QUFFekIsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUM7QUFDeEMsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ1gsT0FBTyxDQUFDLEtBQUssQ0FBQyx1REFBdUQsQ0FBQyxDQUFDO0lBQ3ZFLE9BQU8sQ0FBQyxLQUFLLENBQUMsc0RBQXNELENBQUMsQ0FBQztJQUN0RSxPQUFPLENBQUMsS0FBSyxDQUFDLGdEQUFnRCxDQUFDLENBQUM7SUFDaEUsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNwQixDQUFDO0FBRUQsb0NBQW9DO0FBQ3BDLFNBQVMsYUFBYTtJQUNsQixJQUFJLENBQUM7UUFDRCxNQUFNLFNBQVMsR0FBRyw4QkFBOEIsQ0FBQztRQUNqRCxNQUFNLE9BQU8sR0FBRyxtREFBbUQsU0FBUyxjQUFjLE9BQU8sc0ZBQXNGLENBQUM7UUFDeEwsTUFBTSxVQUFVLEdBQUcsSUFBQSx3QkFBUSxFQUFDLE9BQU8sRUFBRSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2xFLElBQUksQ0FBQyxVQUFVLElBQUksVUFBVSxLQUFLLE1BQU0sRUFBRSxDQUFDO1lBQ3ZDLE1BQU0sSUFBSSxLQUFLLENBQUMsd0NBQXdDLENBQUMsQ0FBQztRQUM5RCxDQUFDO1FBQ0QsT0FBTyxVQUFVLENBQUM7SUFDdEIsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDYixPQUFPLENBQUMsS0FBSyxDQUFDLDRCQUE0QixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ25ELE1BQU0sS0FBSyxDQUFDO0lBQ2hCLENBQUM7QUFDTCxDQUFDO0FBRUQsS0FBSyxVQUFVLElBQUk7SUFDZixPQUFPLENBQUMsR0FBRyxDQUFDLGdEQUFnRCxDQUFDLENBQUM7SUFDOUQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLE9BQU8sSUFBSSxDQUFDLENBQUM7SUFFckMsSUFBSSxVQUFrQixDQUFDO0lBQ3ZCLElBQUksQ0FBQztRQUNELFVBQVUsR0FBRyxhQUFhLEVBQUUsQ0FBQztRQUM3QixPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixVQUFVLEVBQUUsQ0FBQyxDQUFDO0lBQzlDLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2IsT0FBTyxDQUFDLEtBQUssQ0FBQyx5RUFBeUUsQ0FBQyxDQUFDO1FBQ3pGLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDcEIsQ0FBQztJQUVELE1BQU0sT0FBTyxHQUFHLHNEQUFzRCxDQUFDO0lBRXZFLE9BQU8sQ0FBQyxHQUFHLENBQUMsK0JBQStCLE9BQU8sS0FBSyxDQUFDLENBQUM7SUFFekQsK0NBQStDO0lBQy9DLE1BQU0sU0FBUyxHQUFHLElBQUEsd0JBQVEsRUFDdEI7NkJBQ3FCLFVBQVU7d0JBQ2YsT0FBTzs7MkNBRVksT0FBTzs7MEJBRXhCLEVBQ2xCLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxDQUN2QixDQUFDLElBQUksRUFBRSxDQUFDO0lBRVQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFlLFNBQVMsRUFBRSxDQUFDLENBQUM7SUFDeEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO0lBRWpELHlDQUF5QztJQUN6QyxJQUFJLE1BQU0sR0FBRyxZQUFZLENBQUM7SUFDMUIsSUFBSSxRQUFRLEdBQUcsQ0FBQyxDQUFDO0lBQ2pCLE1BQU0sV0FBVyxHQUFHLEVBQUUsQ0FBQyxDQUFDLGdCQUFnQjtJQUV4QyxPQUFPLE1BQU0sS0FBSyxZQUFZLElBQUksUUFBUSxHQUFHLFdBQVcsRUFBRSxDQUFDO1FBQ3ZELE1BQU0sSUFBSSxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxrQkFBa0I7UUFFNUUsSUFBSSxDQUFDO1lBQ0QsTUFBTSxZQUFZLEdBQUcsSUFBQSx3QkFBUSxFQUN6QjttQ0FDbUIsU0FBUztvQ0FDUixVQUFVO2dDQUNkLE9BQU87O2tDQUVMLEVBQ2xCLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxDQUN2QixDQUFDLElBQUksRUFBRSxDQUFDO1lBRVQsTUFBTSxHQUFHLFlBQVksQ0FBQztZQUN0QixRQUFRLEVBQUUsQ0FBQztZQUNYLE9BQU8sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBRTFCLElBQUksTUFBTSxLQUFLLFNBQVMsSUFBSSxNQUFNLEtBQUssUUFBUSxJQUFJLE1BQU0sS0FBSyxXQUFXLElBQUksTUFBTSxLQUFLLFVBQVUsRUFBRSxDQUFDO2dCQUNqRyxNQUFNO1lBQ1YsQ0FBQztRQUNMLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2IsT0FBTyxDQUFDLEtBQUssQ0FBQyxrQ0FBa0MsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUN6RCxNQUFNO1FBQ1YsQ0FBQztJQUNMLENBQUM7SUFFRCxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBRWxCLElBQUksTUFBTSxLQUFLLFNBQVMsRUFBRSxDQUFDO1FBQ3ZCLE9BQU8sQ0FBQyxLQUFLLENBQUMsV0FBVyxNQUFNLENBQUMsV0FBVyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2pELE9BQU8sQ0FBQyxLQUFLLENBQUMsa0NBQWtDLENBQUMsQ0FBQztRQUNsRCxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3BCLENBQUM7SUFFRCxxQkFBcUI7SUFDckIsTUFBTSxPQUFPLEdBQUcsSUFBQSx3QkFBUSxFQUNwQjsyQkFDbUIsU0FBUzs0QkFDUixVQUFVO3dCQUNkLE9BQU87OzBCQUVMLEVBQ2xCLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxDQUN2QixDQUFDLElBQUksRUFBRSxDQUFDO0lBRVQsSUFBSSxDQUFDLE9BQU8sSUFBSSxPQUFPLEtBQUssTUFBTSxFQUFFLENBQUM7UUFDakMsT0FBTyxDQUFDLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBQ3ZDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDcEIsQ0FBQztJQUVELGdCQUFnQjtJQUNoQixJQUFJLENBQUM7UUFDRCxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3hCLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2IsT0FBTyxDQUFDLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO1FBQ3pDLE9BQU8sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDdkIsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNwQixDQUFDO0lBRUQsZUFBZTtJQUNmLE1BQU0sVUFBVSxHQUFHLHlCQUF5QixDQUFDO0lBQzdDLEVBQUUsQ0FBQyxhQUFhLENBQUMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBRXRDLE9BQU8sQ0FBQyxHQUFHLENBQUMsNEJBQTRCLFVBQVUsRUFBRSxDQUFDLENBQUM7SUFDdEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO0lBQ2hDLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDcEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsT0FBTyxDQUFDLFVBQVUsSUFBSSxLQUFLLEVBQUUsQ0FBQyxDQUFDO0lBQzVELE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7SUFDekcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ3JILE9BQU8sQ0FBQyxHQUFHLENBQUMseUJBQXlCLENBQUMsQ0FBQztJQUN2QyxPQUFPLENBQUMsR0FBRyxDQUFDLDhCQUE4QixJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUMxRSxDQUFDO0FBRUQsMkJBQTJCO0FBQzNCLElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUUsQ0FBQztJQUMxQixJQUFJLEVBQUUsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEVBQUU7UUFDakIsT0FBTyxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN6QyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3BCLENBQUMsQ0FBQyxDQUFDO0FBQ1AsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbi8qKlxuICogU2NyaXB0IHRvIGZldGNoIHZhbGlkYXRvciBrZXlzIGZyb20gTkVBUiBsb2NhbG5ldCBub2RlIGluc3RhbmNlXG4gKiBSZXRyaWV2ZXMgdGhlIG5vZGUwIHZhbGlkYXRvciBrZXkgdmlhIFNTTSBmb3IgdXNlIGluIHdyaXRlIHRlc3RzXG4gKi9cblxuaW1wb3J0IHsgZXhlY1N5bmMgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcblxuY29uc3QgUFJPRklMRSA9IHByb2Nlc3MuZW52LkFXU19QUk9GSUxFO1xuaWYgKCFQUk9GSUxFKSB7XG4gICAgY29uc29sZS5lcnJvcihcIuKdjCBFcnJvcjogQVdTX1BST0ZJTEUgZW52aXJvbm1lbnQgdmFyaWFibGUgaXMgcmVxdWlyZWRcIik7XG4gICAgY29uc29sZS5lcnJvcihcIiAgIFNldCBpdCB3aXRoOiBleHBvcnQgQVdTX1BST0ZJTEU9eW91ci1wcm9maWxlLW5hbWVcIik7XG4gICAgY29uc29sZS5lcnJvcihcIiAgIE9yIGFkZCBpdCB0byAuZW52IGZpbGUgKG5vdCB0cmFja2VkIGluIGdpdClcIik7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xufVxuXG4vLyBHZXQgaW5zdGFuY2UgSUQgZnJvbSBzdGFjayBvdXRwdXRcbmZ1bmN0aW9uIGdldEluc3RhbmNlSWQoKTogc3RyaW5nIHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBzdGFja05hbWUgPSAnbmVhci1sb2NhbG5ldC1pbmZyYXN0cnVjdHVyZSc7XG4gICAgICAgIGNvbnN0IGNvbW1hbmQgPSBgYXdzIGNsb3VkZm9ybWF0aW9uIGRlc2NyaWJlLXN0YWNrcyAtLXN0YWNrLW5hbWUgJHtzdGFja05hbWV9IC0tcHJvZmlsZSAke1BST0ZJTEV9IC0tcXVlcnkgXCJTdGFja3NbMF0uT3V0cHV0c1s/T3V0cHV0S2V5PT0nbmVhcmluc3RhbmNlaWQnXS5PdXRwdXRWYWx1ZVwiIC0tb3V0cHV0IHRleHRgO1xuICAgICAgICBjb25zdCBpbnN0YW5jZUlkID0gZXhlY1N5bmMoY29tbWFuZCwgeyBlbmNvZGluZzogJ3V0ZjgnIH0pLnRyaW0oKTtcbiAgICAgICAgaWYgKCFpbnN0YW5jZUlkIHx8IGluc3RhbmNlSWQgPT09ICdOb25lJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnN0YW5jZSBJRCBub3QgZm91bmQgaW4gc3RhY2sgb3V0cHV0cycpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBpbnN0YW5jZUlkO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGdldHRpbmcgaW5zdGFuY2UgSUQ6JywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIG1haW4oKSB7XG4gICAgY29uc29sZS5sb2coJz09PSBGZXRjaGluZyBWYWxpZGF0b3IgS2V5cyBmcm9tIE5FQVIgTm9kZSA9PT0nKTtcbiAgICBjb25zb2xlLmxvZyhgUHJvZmlsZTogJHtQUk9GSUxFfVxcbmApO1xuICAgIFxuICAgIGxldCBpbnN0YW5jZUlkOiBzdHJpbmc7XG4gICAgdHJ5IHtcbiAgICAgICAgaW5zdGFuY2VJZCA9IGdldEluc3RhbmNlSWQoKTtcbiAgICAgICAgY29uc29sZS5sb2coYEluc3RhbmNlIElEOiAke2luc3RhbmNlSWR9YCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGdldCBpbnN0YW5jZSBJRC4gRW5zdXJlIHRoZSBpbmZyYXN0cnVjdHVyZSBzdGFjayBpcyBkZXBsb3llZC4nKTtcbiAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgIH1cbiAgICBcbiAgICBjb25zdCBrZXlQYXRoID0gJy9ob21lL3VidW50dS8ubmVhci9sb2NhbG5ldC9ub2RlMC92YWxpZGF0b3Jfa2V5Lmpzb24nO1xuICAgIFxuICAgIGNvbnNvbGUubG9nKGBGZXRjaGluZyB2YWxpZGF0b3Iga2V5IGZyb20gJHtrZXlQYXRofS4uLmApO1xuICAgIFxuICAgIC8vIFNlbmQgU1NNIGNvbW1hbmQgdG8gcmVhZCBub2RlMCB2YWxpZGF0b3Iga2V5XG4gICAgY29uc3QgY29tbWFuZElkID0gZXhlY1N5bmMoXG4gICAgICAgIGBhd3Mgc3NtIHNlbmQtY29tbWFuZCBcXFxuICAgICAgICAgICAgLS1pbnN0YW5jZS1pZHMgJHtpbnN0YW5jZUlkfSBcXFxuICAgICAgICAgICAgLS1wcm9maWxlICR7UFJPRklMRX0gXFxcbiAgICAgICAgICAgIC0tZG9jdW1lbnQtbmFtZSBcIkFXUy1SdW5TaGVsbFNjcmlwdFwiIFxcXG4gICAgICAgICAgICAtLXBhcmFtZXRlcnMgJ2NvbW1hbmRzPVtcImNhdCAke2tleVBhdGh9XCJdJyBcXFxuICAgICAgICAgICAgLS1xdWVyeSBcIkNvbW1hbmQuQ29tbWFuZElkXCIgXFxcbiAgICAgICAgICAgIC0tb3V0cHV0IHRleHRgLFxuICAgICAgICB7IGVuY29kaW5nOiAndXRmOCcgfVxuICAgICkudHJpbSgpO1xuICAgIFxuICAgIGNvbnNvbGUubG9nKGBDb21tYW5kIElEOiAke2NvbW1hbmRJZH1gKTtcbiAgICBjb25zb2xlLmxvZygnV2FpdGluZyBmb3IgY29tbWFuZCBjb21wbGV0aW9uLi4uJyk7XG4gICAgXG4gICAgLy8gV2FpdCBmb3IgY29tbWFuZCB0byBjb21wbGV0ZSAocG9sbGluZylcbiAgICBsZXQgc3RhdHVzID0gJ0luUHJvZ3Jlc3MnO1xuICAgIGxldCBhdHRlbXB0cyA9IDA7XG4gICAgY29uc3QgbWF4QXR0ZW1wdHMgPSAzMDsgLy8gNSBtaW51dGVzIG1heFxuICAgIFxuICAgIHdoaWxlIChzdGF0dXMgPT09ICdJblByb2dyZXNzJyAmJiBhdHRlbXB0cyA8IG1heEF0dGVtcHRzKSB7XG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDAwMCkpOyAvLyBXYWl0IDEwIHNlY29uZHNcbiAgICAgICAgXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBzdGF0dXNPdXRwdXQgPSBleGVjU3luYyhcbiAgICAgICAgICAgICAgICBgYXdzIHNzbSBnZXQtY29tbWFuZC1pbnZvY2F0aW9uIFxcXG4gICAgICAgICAgICAgICAgICAgIC0tY29tbWFuZC1pZCAke2NvbW1hbmRJZH0gXFxcbiAgICAgICAgICAgICAgICAgICAgLS1pbnN0YW5jZS1pZCAke2luc3RhbmNlSWR9IFxcXG4gICAgICAgICAgICAgICAgICAgIC0tcHJvZmlsZSAke1BST0ZJTEV9IFxcXG4gICAgICAgICAgICAgICAgICAgIC0tcXVlcnkgXCJTdGF0dXNcIiBcXFxuICAgICAgICAgICAgICAgICAgICAtLW91dHB1dCB0ZXh0YCxcbiAgICAgICAgICAgICAgICB7IGVuY29kaW5nOiAndXRmOCcgfVxuICAgICAgICAgICAgKS50cmltKCk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHN0YXR1cyA9IHN0YXR1c091dHB1dDtcbiAgICAgICAgICAgIGF0dGVtcHRzKys7XG4gICAgICAgICAgICBwcm9jZXNzLnN0ZG91dC53cml0ZSgnLicpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAoc3RhdHVzID09PSAnU3VjY2VzcycgfHwgc3RhdHVzID09PSAnRmFpbGVkJyB8fCBzdGF0dXMgPT09ICdDYW5jZWxsZWQnIHx8IHN0YXR1cyA9PT0gJ1RpbWVkT3V0Jykge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignXFxuRXJyb3IgY2hlY2tpbmcgY29tbWFuZCBzdGF0dXM6JywgZXJyb3IpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgY29uc29sZS5sb2coJ1xcbicpO1xuICAgIFxuICAgIGlmIChzdGF0dXMgIT09ICdTdWNjZXNzJykge1xuICAgICAgICBjb25zb2xlLmVycm9yKGBDb21tYW5kICR7c3RhdHVzLnRvTG93ZXJDYXNlKCl9YCk7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byByZXRyaWV2ZSB2YWxpZGF0b3Iga2V5Jyk7XG4gICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICB9XG4gICAgXG4gICAgLy8gR2V0IGNvbW1hbmQgb3V0cHV0XG4gICAgY29uc3Qga2V5SnNvbiA9IGV4ZWNTeW5jKFxuICAgICAgICBgYXdzIHNzbSBnZXQtY29tbWFuZC1pbnZvY2F0aW9uIFxcXG4gICAgICAgICAgICAtLWNvbW1hbmQtaWQgJHtjb21tYW5kSWR9IFxcXG4gICAgICAgICAgICAtLWluc3RhbmNlLWlkICR7aW5zdGFuY2VJZH0gXFxcbiAgICAgICAgICAgIC0tcHJvZmlsZSAke1BST0ZJTEV9IFxcXG4gICAgICAgICAgICAtLXF1ZXJ5IFwiU3RhbmRhcmRPdXRwdXRDb250ZW50XCIgXFxcbiAgICAgICAgICAgIC0tb3V0cHV0IHRleHRgLFxuICAgICAgICB7IGVuY29kaW5nOiAndXRmOCcgfVxuICAgICkudHJpbSgpO1xuICAgIFxuICAgIGlmICgha2V5SnNvbiB8fCBrZXlKc29uID09PSAnTm9uZScpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignTm8ga2V5IGRhdGEgcmV0cmlldmVkJyk7XG4gICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICB9XG4gICAgXG4gICAgLy8gVmFsaWRhdGUgSlNPTlxuICAgIHRyeSB7XG4gICAgICAgIEpTT04ucGFyc2Uoa2V5SnNvbik7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignSW52YWxpZCBKU09OIHJldHJpZXZlZDonKTtcbiAgICAgICAgY29uc29sZS5lcnJvcihrZXlKc29uKTtcbiAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgIH1cbiAgICBcbiAgICAvLyBTYXZlIHRvIGZpbGVcbiAgICBjb25zdCBvdXRwdXRQYXRoID0gJy90bXAvdmFsaWRhdG9yLWtleS5qc29uJztcbiAgICBmcy53cml0ZUZpbGVTeW5jKG91dHB1dFBhdGgsIGtleUpzb24pO1xuICAgIFxuICAgIGNvbnNvbGUubG9nKGDinIUgVmFsaWRhdG9yIGtleSBzYXZlZCB0byAke291dHB1dFBhdGh9YCk7XG4gICAgY29uc29sZS5sb2coJ1xcbktleSBzdHJ1Y3R1cmU6Jyk7XG4gICAgY29uc3Qga2V5RGF0YSA9IEpTT04ucGFyc2Uoa2V5SnNvbik7XG4gICAgY29uc29sZS5sb2coYCAgQWNjb3VudCBJRDogJHtrZXlEYXRhLmFjY291bnRfaWQgfHwgJ04vQSd9YCk7XG4gICAgY29uc29sZS5sb2coYCAgUHVibGljIEtleTogJHtrZXlEYXRhLnB1YmxpY19rZXkgPyBrZXlEYXRhLnB1YmxpY19rZXkuc3Vic3RyaW5nKDAsIDIwKSArICcuLi4nIDogJ04vQSd9YCk7XG4gICAgY29uc29sZS5sb2coYCAgU2VjcmV0IEtleTogJHtrZXlEYXRhLnNlY3JldF9rZXkgPyAnKioqaGlkZGVuKioqJyA6IChrZXlEYXRhLnByaXZhdGVfa2V5ID8gJyoqKmhpZGRlbioqKicgOiAnTi9BJyl9YCk7XG4gICAgY29uc29sZS5sb2coJ1xcblRvIHVzZSB0aGlzIGtleSwgc2V0OicpO1xuICAgIGNvbnNvbGUubG9nKGBleHBvcnQgVkFMSURBVE9SX0tFWV9KU09OPScke0pTT04uc3RyaW5naWZ5KGtleURhdGEpfSdgKTtcbn1cblxuLy8gUnVuIGlmIGV4ZWN1dGVkIGRpcmVjdGx5XG5pZiAocmVxdWlyZS5tYWluID09PSBtb2R1bGUpIHtcbiAgICBtYWluKCkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdVbmhhbmRsZWQgZXJyb3I6JywgZXJyb3IpO1xuICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgfSk7XG59XG5cbmV4cG9ydCB7IGdldEluc3RhbmNlSWQgfTtcbiJdfQ==
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
const PROFILE = process.env.AWS_PROFILE || 'shai-sandbox-profile';
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmV0Y2gtdmFsaWRhdG9yLWtleXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJmZXRjaC12YWxpZGF0b3Ita2V5cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUNBOzs7R0FHRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUE4SU0sc0NBQWE7QUE1SXRCLGlEQUF5QztBQUN6Qyx1Q0FBeUI7QUFFekIsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXLElBQUksc0JBQXNCLENBQUM7QUFFbEUsb0NBQW9DO0FBQ3BDLFNBQVMsYUFBYTtJQUNsQixJQUFJLENBQUM7UUFDRCxNQUFNLFNBQVMsR0FBRyw4QkFBOEIsQ0FBQztRQUNqRCxNQUFNLE9BQU8sR0FBRyxtREFBbUQsU0FBUyxjQUFjLE9BQU8sc0ZBQXNGLENBQUM7UUFDeEwsTUFBTSxVQUFVLEdBQUcsSUFBQSx3QkFBUSxFQUFDLE9BQU8sRUFBRSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2xFLElBQUksQ0FBQyxVQUFVLElBQUksVUFBVSxLQUFLLE1BQU0sRUFBRSxDQUFDO1lBQ3ZDLE1BQU0sSUFBSSxLQUFLLENBQUMsd0NBQXdDLENBQUMsQ0FBQztRQUM5RCxDQUFDO1FBQ0QsT0FBTyxVQUFVLENBQUM7SUFDdEIsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDYixPQUFPLENBQUMsS0FBSyxDQUFDLDRCQUE0QixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ25ELE1BQU0sS0FBSyxDQUFDO0lBQ2hCLENBQUM7QUFDTCxDQUFDO0FBRUQsS0FBSyxVQUFVLElBQUk7SUFDZixPQUFPLENBQUMsR0FBRyxDQUFDLGdEQUFnRCxDQUFDLENBQUM7SUFDOUQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLE9BQU8sSUFBSSxDQUFDLENBQUM7SUFFckMsSUFBSSxVQUFrQixDQUFDO0lBQ3ZCLElB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QUUsQ0FBQyxDQUFDO0lBQ3JILE9BQU8sQ0FBQyxHQUFHLENBQUMseUJBQXlCLENBQUMsQ0FBQztJQUN2QyxPQUFPLENBQUMsR0FBRyxDQUFDLDhCQUE4QixJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUMxRSxDQUFDO0FBRUQsMkJBQTJCO0FBQzNCLElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUUsQ0FBQztJQUMxQixJQUFJLEVBQUUsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEVBQUU7UUFDakIsT0FBTyxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN6QyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3BCLENBQUMsQ0FBQyxDQUFDO0FBQ1AsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbi8qKlxuICogU2NyaXB0IHRvIGZldGNoIHZhbGlkYXRvciBrZXlzIGZyb20gTkVBUiBsb2NhbG5ldCBub2RlIGluc3RhbmNlXG4gKiBSZXRyaWV2ZXMgdGhlIG5vZGUwIHZhbGlkYXRvciBrZXkgdmlhIFNTTSBmb3IgdXNlIGluIHdyaXRlIHRlc3RzXG4gKi9cblxuaW1wb3J0IHsgZXhlY1N5bmMgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcblxuY29uc3QgUFJPRklMRSA9IHByb2Nlc3MuZW52LkFXU19QUk9GSUxFIHx8ICdzaGFpLXNhbmRib3gtcHJvZmlsZSc7XG5cbi8vIEdldCBpbnN0YW5jZSBJRCBmcm9tIHN0YWNrIG91dHB1dFxuZnVuY3Rpb24gZ2V0SW5zdGFuY2VJZCgpOiBzdHJpbmcge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHN0YWNrTmFtZSA9ICduZWFyLWxvY2FsbmV0LWluZnJhc3RydWN0dXJlJztcbiAgICAgICAgY29uc3QgY29tbWFuZCA9IGBhd3MgY2xvdWRmb3JtYXRpb24gZGVzY3JpYmUtc3RhY2tzIC0tc3RhY2stbmFtZSAke3N0YWNrTmFtZX0gLS1wcm9maWxlICR7UFJPRklMRX0gLS1xdWVyeSBcIlN0YWNrc1swXS5PdXRwdXRzWz9PdXRwdXRLZXk9PSduZWFyaW5zdGFuY2VpZCddLk91dHB1dFZhbHVlXCIgLS1vdXRwdXQgdGV4dGA7XG4gICAgICAgIGNvbnN0IGluc3RhbmNlSWQgPSBleGVjU3luYyhjb21tYW5kLCB7IGVuY29kaW5nOiAndXRmOCcgfSkudHJpbSgpO1xuICAgICAgICBpZiAoIWluc3RhbmNlSWQgfHwgaW5zdGFuY2VJZCA9PT0gJ05vbmUnKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0luc3RhbmNlIElEIG5vdCBmb3VuZCBpbiBzdGFjayBvdXRwdXRzJyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGluc3RhbmNlSWQ7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgZ2V0dGluZyBpbnN0YW5jZSBJRDonLCBlcnJvcik7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gbWFpbigpIHtcbiAgICBjb25zb2xlLmxvZygnPT09IEZldGNoaW5nIFZhbGlkYXRvciBLZXlzIGZyb20gTkVBUiBOb2RlID09PScpO1xuICAgIGNvbnNvbGUubG9nKGBQcm9maWxlOiAke1BST0ZJTEV9XFxuYCk7XG4gICAgXG4gICAgbGV0IGluc3RhbmNlSWQ6IHN0cmluZztcbiAgICB0cnkge1xuICAgICAgICBpbnN0YW5jZUlkID0gZ2V0SW5zdGFuY2VJZCgpO1xuICAgICAgICBjb25zb2xlLmxvZyhgSW5zdGFuY2UgSUQ6ICR7aW5zdGFuY2VJZH1gKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gZ2V0IGluc3RhbmNlIElELiBFbnN1cmUgdGhlIGluZnJhc3RydWN0dXJlIHN0YWNrIGlzIGRlcGxveWVkLicpO1xuICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IGtleVBhdGggPSAnL2hvbWUvdWJ1bnR1Ly5uZWFyL2xvY2FsbmV0L25vZGUwL3ZhbGlkYXRvcl9rZXkuanNvbic7XG4gICAgXG4gICAgY29uc29sZS5sb2coYEZldGNoaW5nIHZhbGlkYXRvciBrZXkgZnJvbSAke2tleVBhdGh9Li4uYCk7XG4gICAgXG4gICAgLy8gU2VuZCBTU00gY29tbWFuZCB0byByZWFkIG5vZGUwIHZhbGlkYXRvciBrZXlcbiAgICBjb25zdCBjb21tYW5kSWQgPSBleGVjU3luYyhcbiAgICAgICAgYGF3cyBzc20gc2VuZC1jb21tYW5kIFxcXG4gICAgICAgICAgICAtLWluc3RhbmNlLWlkcyAke2luc3RhbmNlSWR9IFxcXG4gICAgICAgICAgICAtLXByb2ZpbGUgJHtQUk9GSUxFfSBcXFxuICAgICAgICAgICAgLS1kb2N1bWVudC1uYW1lIFwiQVdTLVJ1blNoZWxsU2NyaXB0XCIgXFxcbiAgICAgICAgICAgIC0tcGFyYW1ldGVycyAnY29tbWFuZHM9W1wiY2F0ICR7a2V5UGF0aH1cIl0nIFxcXG4gICAgICAgICAgICAtLXF1ZXJ5IFwiQ29tbWFuZC5Db21tYW5kSWRcIiBcXFxuICAgICAgICAgICAgLS1vdXRwdXQgdGV4dGAsXG4gICAgICAgIHsgZW5jb2Rpbmc6ICd1dGY4JyB9XG4gICAgKS50cmltKCk7XG4gICAgXG4gICAgY29uc29sZS5sb2coYENvbW1hbmQgSUQ6ICR7Y29tbWFuZElkfWApO1xuICAgIGNvbnNvbGUubG9nKCdXYWl0aW5nIGZvciBjb21tYW5kIGNvbXBsZXRpb24uLi4nKTtcbiAgICBcbiAgICAvLyBXYWl0IGZvciBjb21tYW5kIHRvIGNvbXBsZXRlIChwb2xsaW5nKVxuICAgIGxldCBzdGF0dXMgPSAnSW5Qcm9ncmVzcyc7XG4gICAgbGV0IGF0dGVtcHRzID0gMDtcbiAgICBjb25zdCBtYXhBdHRlbXB0cyA9IDMwOyAvLyA1IG1pbnV0ZXMgbWF4XG4gICAgXG4gICAgd2hpbGUgKHN0YXR1cyA9PT0gJ0luUHJvZ3Jlc3MnICYmIGF0dGVtcHRzIDwgbWF4QXR0ZW1wdHMpIHtcbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwMDAwKSk7IC8vIFdhaXQgMTAgc2Vjb25kc1xuICAgICAgICBcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHN0YXR1c091dHB1dCA9IGV4ZWNTeW5jKFxuICAgICAgICAgICAgICAgIGBhd3Mgc3NtIGdldC1jb21tYW5kLWludm9jYXRpb24gXFxcbiAgICAgICAgICAgICAgICAgICAgLS1jb21tYW5kLWlkICR7Y29tbWFuZElkfSBcXFxuICAgICAgICAgICAgICAgICAgICAtLWluc3RhbmNlLWlkICR7aW5zdGFuY2VJZH0gXFxcbiAgICAgICAgICAgICAgICAgICAgLS1wcm9maWxlICR7UFJPRklMRX0gXFxcbiAgICAgICAgICAgICAgICAgICAgLS1xdWVyeSBcIlN0YXR1c1wiIFxcXG4gICAgICAgICAgICAgICAgICAgIC0tb3V0cHV0IHRleHRgLFxuICAgICAgICAgICAgICAgIHsgZW5jb2Rpbmc6ICd1dGY4JyB9XG4gICAgICAgICAgICApLnRyaW0oKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgc3RhdHVzID0gc3RhdHVzT3V0cHV0O1xuICAgICAgICAgICAgYXR0ZW1wdHMrKztcbiAgICAgICAgICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKCcuJyk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChzdGF0dXMgPT09ICdTdWNjZXNzJyB8fCBzdGF0dXMgPT09ICdGYWlsZWQnIHx8IHN0YXR1cyA9PT0gJ0NhbmNlbGxlZCcgfHwgc3RhdHVzID09PSAnVGltZWRPdXQnKSB7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdcXG5FcnJvciBjaGVja2luZyBjb21tYW5kIHN0YXR1czonLCBlcnJvcik7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBjb25zb2xlLmxvZygnXFxuJyk7XG4gICAgXG4gICAgaWYgKHN0YXR1cyAhPT0gJ1N1Y2Nlc3MnKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYENvbW1hbmQgJHtzdGF0dXMudG9Mb3dlckNhc2UoKX1gKTtcbiAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIHJldHJpZXZlIHZhbGlkYXRvciBrZXknKTtcbiAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgIH1cbiAgICBcbiAgICAvLyBHZXQgY29tbWFuZCBvdXRwdXRcbiAgICBjb25zdCBrZXlKc29uID0gZXhlY1N5bmMoXG4gICAgICAgIGBhd3Mgc3NtIGdldC1jb21tYW5kLWludm9jYXRpb24gXFxcbiAgICAgICAgICAgIC0tY29tbWFuZC1pZCAke2NvbW1hbmRJZH0gXFxcbiAgICAgICAgICAgIC0taW5zdGFuY2UtaWQgJHtpbnN0YW5jZUlkfSBcXFxuICAgICAgICAgICAgLS1wcm9maWxlICR7UFJPRklMRX0gXFxcbiAgICAgICAgICAgIC0tcXVlcnkgXCJTdGFuZGFyZE91dHB1dENvbnRlbnRcIiBcXFxuICAgICAgICAgICAgLS1vdXRwdXQgdGV4dGAsXG4gICAgICAgIHsgZW5jb2Rpbmc6ICd1dGY4JyB9XG4gICAgKS50cmltKCk7XG4gICAgXG4gICAgaWYgKCFrZXlKc29uIHx8IGtleUpzb24gPT09ICdOb25lJykge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdObyBrZXkgZGF0YSByZXRyaWV2ZWQnKTtcbiAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgIH1cbiAgICBcbiAgICAvLyBWYWxpZGF0ZSBKU09OXG4gICAgdHJ5IHtcbiAgICAgICAgSlNPTi5wYXJzZShrZXlKc29uKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdJbnZhbGlkIEpTT04gcmV0cmlldmVkOicpO1xuICAgICAgICBjb25zb2xlLmVycm9yKGtleUpzb24pO1xuICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgfVxuICAgIFxuICAgIC8vIFNhdmUgdG8gZmlsZVxuICAgIGNvbnN0IG91dHB1dFBhdGggPSAnL3RtcC92YWxpZGF0b3Ita2V5Lmpzb24nO1xuICAgIGZzLndyaXRlRmlsZVN5bmMob3V0cHV0UGF0aCwga2V5SnNvbik7XG4gICAgXG4gICAgY29uc29sZS5sb2coYOKchSBWYWxpZGF0b3Iga2V5IHNhdmVkIHRvICR7b3V0cHV0UGF0aH1gKTtcbiAgICBjb25zb2xlLmxvZygnXFxuS2V5IHN0cnVjdHVyZTonKTtcbiAgICBjb25zdCBrZXlEYXRhID0gSlNPTi5wYXJzZShrZXlKc29uKTtcbiAgICBjb25zb2xlLmxvZyhgICBBY2NvdW50IElEOiAke2tleURhdGEuYWNjb3VudF9pZCB8fCAnTi9BJ31gKTtcbiAgICBjb25zb2xlLmxvZyhgICBQdWJsaWMgS2V5OiAke2tleURhdGEucHVibGljX2tleSA/IGtleURhdGEucHVibGljX2tleS5zdWJzdHJpbmcoMCwgMjApICsgJy4uLicgOiAnTi9BJ31gKTtcbiAgICBjb25zb2xlLmxvZyhgICBTZWNyZXQgS2V5OiAke2tleURhdGEuc2VjcmV0X2tleSA/ICcqKipoaWRkZW4qKionIDogKGtleURhdGEucHJpdmF0ZV9rZXkgPyAnKioqaGlkZGVuKioqJyA6ICdOL0EnKX1gKTtcbiAgICBjb25zb2xlLmxvZygnXFxuVG8gdXNlIHRoaXMga2V5LCBzZXQ6Jyk7XG4gICAgY29uc29sZS5sb2coYGV4cG9ydCBWQUxJREFUT1JfS0VZX0pTT049JyR7SlNPTi5zdHJpbmdpZnkoa2V5RGF0YSl9J2ApO1xufVxuXG4vLyBSdW4gaWYgZXhlY3V0ZWQgZGlyZWN0bHlcbmlmIChyZXF1aXJlLm1haW4gPT09IG1vZHVsZSkge1xuICAgIG1haW4oKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ1VuaGFuZGxlZCBlcnJvcjonLCBlcnJvcik7XG4gICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICB9KTtcbn1cblxuZXhwb3J0IHsgZ2V0SW5zdGFuY2VJZCB9O1xuIl19
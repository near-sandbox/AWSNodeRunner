#!/usr/bin/env node
"use strict";
/**
 * CLI script to trigger NEAR localnet test suite
 *
 * Usage:
 *   npm run trigger-tests [-- --include-write-tests] [-- --test-depth comprehensive]
 *   node scripts/trigger-tests.ts [--include-write-tests] [--test-depth comprehensive]
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
exports.triggerViaLambda = triggerViaLambda;
exports.triggerViaSSM = triggerViaSSM;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
function getStackOutput(stackName, outputKey, profile) {
    try {
        const command = `aws cloudformation describe-stacks --stack-name ${stackName} --profile ${profile} --query "Stacks[0].Outputs[?OutputKey=='${outputKey}'].OutputValue" --output text`;
        const output = (0, child_process_1.execSync)(command, { encoding: "utf8" }).trim();
        if (!output || output === "None") {
            throw new Error(`Output ${outputKey} not found in stack ${stackName}`);
        }
        return output;
    }
    catch (error) {
        console.error(`Error getting stack output ${outputKey} from ${stackName}:`, error);
        throw error;
    }
}
function triggerViaLambda(lambdaArn, options, profile) {
    console.log("Invoking Lambda function directly...");
    const payload = JSON.stringify({
        includeWriteTests: options.includeWriteTests || false,
        testDepth: options.testDepth || "basic",
    });
    const command = `aws lambda invoke \
        --function-name ${lambdaArn} \
        --payload '${payload}' \
        --cli-binary-format raw-in-base64-out \
        --profile ${profile} \
        /tmp/near-test-response.json`;
    try {
        (0, child_process_1.execSync)(command, { stdio: "inherit" });
        // Read and display response
        if (fs.existsSync("/tmp/near-test-response.json")) {
            const responseRaw = fs.readFileSync("/tmp/near-test-response.json", "utf8");
            const response = JSON.parse(responseRaw);
            console.log("\n=== Test Results ===");
            console.log(JSON.stringify(response, null, 2));
            if (response.FunctionError) {
                console.error("\n❌ Lambda function error:", response.FunctionError);
                process.exit(1);
            }
            let payload = response;
            if (response && typeof response.body !== "undefined") {
                payload = typeof response.body === "string" ? JSON.parse(response.body) : response.body;
            }
            if (payload && payload.success) {
                console.log("\n✅ All tests passed!");
            }
            else {
                const message = (payload && (payload.message || payload.error)) || 'Unknown failure';
                console.log("\n❌ Tests failed:", message);
                process.exit(1);
            }
        }
    }
    catch (error) {
        console.error("Failed to invoke Lambda:", error);
        process.exit(1);
    }
}
async function triggerViaSSM(ssmDocumentName, instanceId, options, profile) {
    console.log("Triggering tests via SSM document on EC2 instance...");
    const parameters = {
        includeWriteTests: [(options.includeWriteTests || false).toString()],
        testDepth: [options.testDepth || "basic"],
    };
    const command = `aws ssm send-command \
        --document-name "${ssmDocumentName}" \
        --targets "Key=InstanceIds,Values=${instanceId}" \
        --parameters '${JSON.stringify(parameters)}' \
        --profile ${profile} \
        --output json`;
    try {
        const output = (0, child_process_1.execSync)(command, { encoding: "utf8" });
        const result = JSON.parse(output);
        const commandId = result.Command.CommandId;
        console.log(`\n✅ Test command sent. Command ID: ${commandId}`);
        console.log("\nWaiting for command execution...");
        console.log("(This may take 5-10 minutes)");
        // Poll for command completion
        let status = "InProgress";
        let attempts = 0;
        const maxAttempts = 60; // 10 minutes max (10s intervals)
        while (status === "InProgress" && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
            const statusCommand = `aws ssm get-command-invocation \
                --command-id ${commandId} \
                --instance-id ${instanceId} \
                --profile ${profile} \
                --output json`;
            try {
                const statusOutput = (0, child_process_1.execSync)(statusCommand, { encoding: "utf8" });
                const statusResult = JSON.parse(statusOutput);
                status = statusResult.Status;
                if (status === "Success") {
                    console.log("\n✅ Test command completed successfully!");
                    console.log("\nCommand Output:");
                    console.log(statusResult.StandardOutputContent || "(no output)");
                    if (statusResult.StandardErrorContent) {
                        console.log("\nErrors:");
                        console.log(statusResult.StandardErrorContent);
                    }
                    break;
                }
                else if (status === "Failed" || status === "Cancelled" || status === "TimedOut") {
                    console.error(`\n❌ Test command ${status.toLowerCase()}`);
                    console.log("\nCommand Output:");
                    console.log(statusResult.StandardOutputContent || "(no output)");
                    if (statusResult.StandardErrorContent) {
                        console.log("\nErrors:");
                        console.log(statusResult.StandardErrorContent);
                    }
                    process.exit(1);
                }
                attempts++;
                process.stdout.write(".");
            }
            catch (error) {
                console.error("\nError checking command status:", error);
                break;
            }
        }
        if (status === "InProgress") {
            console.log("\n⚠️  Command still in progress. Check status manually:");
            console.log(`aws ssm get-command-invocation --command-id ${commandId} --instance-id ${instanceId} --profile ${profile}`);
        }
    }
    catch (error) {
        console.error("Failed to send SSM command:", error);
        process.exit(1);
    }
}
async function main() {
    const args = process.argv.slice(2);
    const profile = process.env.AWS_PROFILE;
    if (!profile) {
        console.error("❌ Error: AWS_PROFILE environment variable is required");
        console.error("   Set it with: export AWS_PROFILE=your-profile-name");
        console.error("   Or add it to .env file (not tracked in git)");
        process.exit(1);
    }
    // Parse arguments
    const options = {
        includeWriteTests: args.includes("--include-write-tests"),
        testDepth: args.includes("--test-depth")
            ? args[args.indexOf("--test-depth") + 1]
            : "basic",
        method: args.includes("--method")
            ? args[args.indexOf("--method") + 1]
            : "lambda",
    };
    console.log("=== NEAR Localnet Test Suite Trigger ===");
    console.log(`Profile: ${profile}`);
    console.log(`Method: ${options.method}`);
    console.log(`Include Write Tests: ${options.includeWriteTests || false}`);
    console.log(`Test Depth: ${options.testDepth}\n`);
    try {
        // Get stack outputs
        const testStackName = "near-localnet-test";
        const infraStackName = "near-localnet-infrastructure";
        let lambdaArn;
        let ssmDocumentName;
        let instanceId;
        let privateIp;
        let publicIp;
        try {
            lambdaArn = getStackOutput(testStackName, "TestLambdaArn", profile);
            ssmDocumentName = getStackOutput(testStackName, "TestSsmDocumentName", profile);
            instanceId = getStackOutput(infraStackName, "nearinstanceid", profile);
            privateIp = getStackOutput(infraStackName, "nearinstanceprivateip", profile);
            publicIp = getStackOutput(infraStackName, "nearinstancepublicip", profile);
        }
        catch (error) {
            console.error("❌ Failed to get stack outputs. Ensure stacks are deployed.");
            console.error("Run: npm run deploy");
            process.exit(1);
        }
        console.log("RPC Private IP: " + (privateIp ?? "unknown"));
        console.log("RPC Public IP:  " + (publicIp && publicIp !== "N/A" ? publicIp : "(not assigned)"));
        // Trigger tests
        if (options.method === "lambda") {
            triggerViaLambda(lambdaArn, options, profile);
        }
        else {
            if (!instanceId) {
                console.error("❌ Instance ID required for SSM method");
                process.exit(1);
            }
            triggerViaSSM(ssmDocumentName, instanceId, options, profile);
        }
        console.log("\n💡 View detailed logs in CloudWatch:");
        console.log(`   Log Group: /aws/lambda/near-localnet-test`);
        console.log(`   Dashboard: Check AWS Console for 'near-localnet-test-*' dashboard`);
    }
    catch (error) {
        console.error("❌ Failed to trigger tests:", error);
        process.exit(1);
    }
}
// Run if executed directly
if (require.main === module) {
    main().catch(error => {
        console.error("Unhandled error:", error);
        process.exit(1);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJpZ2dlci10ZXN0cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInRyaWdnZXItdGVzdHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFDQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBc1BNLDRDQUFnQjtBQUFFLHNDQUFhO0FBcFB4QyxpREFBeUM7QUFDekMsdUNBQXlCO0FBV3pCLFNBQVMsY0FBYyxDQUFDLFNBQWlCLEVBQUUsU0FBaUIsRUFBRSxPQUFlO0lBQ3pFLElBQUksQ0FBQztRQUNELE1BQU0sT0FBTyxHQUFHLG1EQUFtRCxTQUFTLGNBQWMsT0FBTyw0Q0FBNEMsU0FBUywrQkFBK0IsQ0FBQztRQUN0TCxNQUFNLE1BQU0sR0FBRyxJQUFBLHdCQUFRLEVBQUMsT0FBTyxFQUFFLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDOUQsSUFBSSxDQUFDLE1BQU0sSUFBSSxNQUFNLEtBQUssTUFBTSxFQUFFLENBQUM7WUFDL0IsTUFBTSxJQUFJLEtBQUssQ0FBQyxVQUFVLFNBQVMsdUJBQXVCLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFDM0UsQ0FBQztRQUNELE9BQU8sTUFBTSxDQUFDO0lBQ2xCLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2IsT0FBTyxDQUFDLEtBQUssQ0FBQyw4QkFBOEIsU0FBUyxTQUFTLFNBQVMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ25GLE1BQU0sS0FBSyxDQUFDO0lBQ2hCLENBQUM7QUFDTCxDQUFDO0FBRUQsU0FBUyxnQkFBZ0IsQ0FBQyxTQUFpQixFQUFFLE9BQW9CLEVBQUUsT0FBZTtJQUM5RSxPQUFPLENBQUMsR0FBRyxDQUFDLHNDQUFzQyxDQUFDLENBQUM7SUFFcEQsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQztRQUMzQixpQkFBaUIsRUFBRSxPQUFPLENBQUMsaUJBQWlC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RCxPQUFPLENBQUMsR0FBRyxDQUFDLHNFQUFzRSxDQUFDLENBQUM7SUFFeEYsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDYixPQUFPLENBQUMsS0FBSyxDQUFDLDRCQUE0QixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ25ELE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDcEIsQ0FBQztBQUNMLENBQUM7QUFFRCwyQkFBMkI7QUFDM0IsSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLE1BQU0sRUFBRSxDQUFDO0lBQzFCLElBQUksRUFBRSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsRUFBRTtRQUNqQixPQUFPLENBQUMsS0FBSyxDQUFDLGtCQUFrQixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3pDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDcEIsQ0FBQyxDQUFDLENBQUM7QUFDUCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuLyoqXG4gKiBDTEkgc2NyaXB0IHRvIHRyaWdnZXIgTkVBUiBsb2NhbG5ldCB0ZXN0IHN1aXRlXG4gKiBcbiAqIFVzYWdlOlxuICogICBucG0gcnVuIHRyaWdnZXItdGVzdHMgWy0tIC0taW5jbHVkZS13cml0ZS10ZXN0c10gWy0tIC0tdGVzdC1kZXB0aCBjb21wcmVoZW5zaXZlXVxuICogICBub2RlIHNjcmlwdHMvdHJpZ2dlci10ZXN0cy50cyBbLS1pbmNsdWRlLXdyaXRlLXRlc3RzXSBbLS10ZXN0LWRlcHRoIGNvbXByZWhlbnNpdmVdXG4gKi9cblxuaW1wb3J0IHsgZXhlY1N5bmMgfSBmcm9tIFwiY2hpbGRfcHJvY2Vzc1wiO1xuaW1wb3J0ICogYXMgZnMgZnJvbSBcImZzXCI7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gXCJwYXRoXCI7XG5cbmludGVyZmFjZSBUZXN0T3B0aW9ucyB7XG4gICAgaW5jbHVkZVdyaXRlVGVzdHM/OiBib29sZWFuO1xuICAgIHRlc3REZXB0aD86IFwiYmFzaWNcIiB8IFwiY29tcHJlaGVuc2l2ZVwiO1xuICAgIG1ldGhvZD86IFwibGFtYmRhXCIgfCBcInNzbVwiO1xuICAgIGluc3RhbmNlSWQ/OiBzdHJpbmc7XG4gICAgcHJvZmlsZT86IHN0cmluZztcbn1cblxuZnVuY3Rpb24gZ2V0U3RhY2tPdXRwdXQoc3RhY2tOYW1lOiBzdHJpbmcsIG91dHB1dEtleTogc3RyaW5nLCBwcm9maWxlOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGNvbW1hbmQgPSBgYXdzIGNsb3VkZm9ybWF0aW9uIGRlc2NyaWJlLXN0YWNrcyAtLXN0YWNrLW5hbWUgJHtzdGFja05hbWV9IC0tcHJvZmlsZSAke3Byb2ZpbGV9IC0tcXVlcnkgXCJTdGFja3NbMF0uT3V0cHV0c1s/T3V0cHV0S2V5PT0nJHtvdXRwdXRLZXl9J10uT3V0cHV0VmFsdWVcIiAtLW91dHB1dCB0ZXh0YDtcbiAgICAgICAgY29uc3Qgb3V0cHV0ID0gZXhlY1N5bmMoY29tbWFuZCwgeyBlbmNvZGluZzogXCJ1dGY4XCIgfSkudHJpbSgpO1xuICAgICAgICBpZiAoIW91dHB1dCB8fCBvdXRwdXQgPT09IFwiTm9uZVwiKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE91dHB1dCAke291dHB1dEtleX0gbm90IGZvdW5kIGluIHN0YWNrICR7c3RhY2tOYW1lfWApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBvdXRwdXQ7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihgRXJyb3IgZ2V0dGluZyBzdGFjayBvdXRwdXQgJHtvdXRwdXRLZXl9IGZyb20gJHtzdGFja05hbWV9OmAsIGVycm9yKTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxufVxuXG5mdW5jdGlvbiB0cmlnZ2VyVmlhTGFtYmRhKGxhbWJkYUFybjogc3RyaW5nLCBvcHRpb25zOiBUZXN0T3B0aW9ucywgcHJvZmlsZTogc3RyaW5nKTogdm9pZCB7XG4gICAgY29uc29sZS5sb2coXCJJbnZva2luZyBMYW1iZGEgZnVuY3Rpb24gZGlyZWN0bHkuLi5cIik7XG4gICAgXG4gICAgY29uc3QgcGF5bG9hZCA9IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgaW5jbHVkZVdyaXRlVGVzdHM6IG9wdGlvbnMuaW5jbHVkZVdyaXRlVGVzdHMgfHwgZmFsc2UsXG4gICAgICAgIHRlc3REZXB0aDogb3B0aW9ucy50ZXN0RGVwdGggfHwgXCJiYXNpY1wiLFxuICAgIH0pO1xuICAgIFxuICAgIGNvbnN0IGNvbW1hbmQgPSBgYXdzIGxhbWJkYSBpbnZva2UgXFxcbiAgICAgICAgLS1mdW5jdGlvbi1uYW1lICR7bGFtYmRhQXJufSBcXFxuICAgICAgICAtLXBheWxvYWQgJyR7cGF5bG9hZH0nIFxcXG4gICAgICAgIC0tY2xpLWJpbmFyeS1mb3JtYXQgcmF3LWluLWJhc2U2NC1vdXQgXFxcbiAgICAgICAgLS1wcm9maWxlICR7cHJvZmlsZX0gXFxcbiAgICAgICAgL3RtcC9uZWFyLXRlc3QtcmVzcG9uc2UuanNvbmA7XG4gICAgXG4gICAgdHJ5IHtcbiAgICAgICAgZXhlY1N5bmMoY29tbWFuZCwgeyBzdGRpbzogXCJpbmhlcml0XCIgfSk7XG4gICAgICAgIFxuICAgICAgICAvLyBSZWFkIGFuZCBkaXNwbGF5IHJlc3BvbnNlXG4gICAgICAgIGlmIChmcy5leGlzdHNTeW5jKFwiL3RtcC9uZWFyLXRlc3QtcmVzcG9uc2UuanNvblwiKSkge1xuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2VSYXcgPSBmcy5yZWFkRmlsZVN5bmMoXCIvdG1wL25lYXItdGVzdC1yZXNwb25zZS5qc29uXCIsIFwidXRmOFwiKTtcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gSlNPTi5wYXJzZShyZXNwb25zZVJhdyk7XG5cbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiXFxuPT09IFRlc3QgUmVzdWx0cyA9PT1cIik7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhKU09OLnN0cmluZ2lmeShyZXNwb25zZSwgbnVsbCwgMikpO1xuXG4gICAgICAgICAgICBpZiAocmVzcG9uc2UuRnVuY3Rpb25FcnJvcikge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJcXG7inYwgTGFtYmRhIGZ1bmN0aW9uIGVycm9yOlwiLCByZXNwb25zZS5GdW5jdGlvbkVycm9yKTtcbiAgICAgICAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGxldCBwYXlsb2FkOiBhbnkgPSByZXNwb25zZTtcbiAgICAgICAgICAgIGlmIChyZXNwb25zZSAmJiB0eXBlb2YgcmVzcG9uc2UuYm9keSAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICAgICAgICAgIHBheWxvYWQgPSB0eXBlb2YgcmVzcG9uc2UuYm9keSA9PT0gXCJzdHJpbmdcIiA/IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSkgOiByZXNwb25zZS5ib2R5O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAocGF5bG9hZCAmJiBwYXlsb2FkLnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIlxcbuKchSBBbGwgdGVzdHMgcGFzc2VkIVwiKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbWVzc2FnZSA9IChwYXlsb2FkICYmIChwYXlsb2FkLm1lc3NhZ2UgfHwgcGF5bG9hZC5lcnJvcikpIHx8ICdVbmtub3duIGZhaWx1cmUnO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiXFxu4p2MIFRlc3RzIGZhaWxlZDpcIiwgbWVzc2FnZSk7XG4gICAgICAgICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBpbnZva2UgTGFtYmRhOlwiLCBlcnJvcik7XG4gICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHRyaWdnZXJWaWFTU00oXG4gICAgc3NtRG9jdW1lbnROYW1lOiBzdHJpbmcsXG4gICAgaW5zdGFuY2VJZDogc3RyaW5nLFxuICAgIG9wdGlvbnM6IFRlc3RPcHRpb25zLFxuICAgIHByb2ZpbGU6IHN0cmluZ1xuKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc29sZS5sb2coXCJUcmlnZ2VyaW5nIHRlc3RzIHZpYSBTU00gZG9jdW1lbnQgb24gRUMyIGluc3RhbmNlLi4uXCIpO1xuICAgIFxuICAgIGNvbnN0IHBhcmFtZXRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZ1tdPiA9IHtcbiAgICAgICAgaW5jbHVkZVdyaXRlVGVzdHM6IFsob3B0aW9ucy5pbmNsdWRlV3JpdGVUZXN0cyB8fCBmYWxzZSkudG9TdHJpbmcoKV0sXG4gICAgICAgIHRlc3REZXB0aDogW29wdGlvbnMudGVzdERlcHRoIHx8IFwiYmFzaWNcIl0sXG4gICAgfTtcbiAgICBcbiAgICBjb25zdCBjb21tYW5kID0gYGF3cyBzc20gc2VuZC1jb21tYW5kIFxcXG4gICAgICAgIC0tZG9jdW1lbnQtbmFtZSBcIiR7c3NtRG9jdW1lbnROYW1lfVwiIFxcXG4gICAgICAgIC0tdGFyZ2V0cyBcIktleT1JbnN0YW5jZUlkcyxWYWx1ZXM9JHtpbnN0YW5jZUlkfVwiIFxcXG4gICAgICAgIC0tcGFyYW1ldGVycyAnJHtKU09OLnN0cmluZ2lmeShwYXJhbWV0ZXJzKX0nIFxcXG4gICAgICAgIC0tcHJvZmlsZSAke3Byb2ZpbGV9IFxcXG4gICAgICAgIC0tb3V0cHV0IGpzb25gO1xuICAgIFxuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IG91dHB1dCA9IGV4ZWNTeW5jKGNvbW1hbmQsIHsgZW5jb2Rpbmc6IFwidXRmOFwiIH0pO1xuICAgICAgICBjb25zdCByZXN1bHQgPSBKU09OLnBhcnNlKG91dHB1dCk7XG4gICAgICAgIGNvbnN0IGNvbW1hbmRJZCA9IHJlc3VsdC5Db21tYW5kLkNvbW1hbmRJZDtcbiAgICAgICAgXG4gICAgICAgIGNvbnNvbGUubG9nKGBcXG7inIUgVGVzdCBjb21tYW5kIHNlbnQuIENvbW1hbmQgSUQ6ICR7Y29tbWFuZElkfWApO1xuICAgICAgICBjb25zb2xlLmxvZyhcIlxcbldhaXRpbmcgZm9yIGNvbW1hbmQgZXhlY3V0aW9uLi4uXCIpO1xuICAgICAgICBjb25zb2xlLmxvZyhcIihUaGlzIG1heSB0YWtlIDUtMTAgbWludXRlcylcIik7XG4gICAgICAgIFxuICAgICAgICAvLyBQb2xsIGZvciBjb21tYW5kIGNvbXBsZXRpb25cbiAgICAgICAgbGV0IHN0YXR1cyA9IFwiSW5Qcm9ncmVzc1wiO1xuICAgICAgICBsZXQgYXR0ZW1wdHMgPSAwO1xuICAgICAgICBjb25zdCBtYXhBdHRlbXB0cyA9IDYwOyAvLyAxMCBtaW51dGVzIG1heCAoMTBzIGludGVydmFscylcbiAgICAgICAgXG4gICAgICAgIHdoaWxlIChzdGF0dXMgPT09IFwiSW5Qcm9ncmVzc1wiICYmIGF0dGVtcHRzIDwgbWF4QXR0ZW1wdHMpIHtcbiAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDAwMCkpOyAvLyBXYWl0IDEwIHNlY29uZHNcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY29uc3Qgc3RhdHVzQ29tbWFuZCA9IGBhd3Mgc3NtIGdldC1jb21tYW5kLWludm9jYXRpb24gXFxcbiAgICAgICAgICAgICAgICAtLWNvbW1hbmQtaWQgJHtjb21tYW5kSWR9IFxcXG4gICAgICAgICAgICAgICAgLS1pbnN0YW5jZS1pZCAke2luc3RhbmNlSWR9IFxcXG4gICAgICAgICAgICAgICAgLS1wcm9maWxlICR7cHJvZmlsZX0gXFxcbiAgICAgICAgICAgICAgICAtLW91dHB1dCBqc29uYDtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBzdGF0dXNPdXRwdXQgPSBleGVjU3luYyhzdGF0dXNDb21tYW5kLCB7IGVuY29kaW5nOiBcInV0ZjhcIiB9KTtcbiAgICAgICAgICAgICAgICBjb25zdCBzdGF0dXNSZXN1bHQgPSBKU09OLnBhcnNlKHN0YXR1c091dHB1dCk7XG4gICAgICAgICAgICAgICAgc3RhdHVzID0gc3RhdHVzUmVzdWx0LlN0YXR1cztcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAoc3RhdHVzID09PSBcIlN1Y2Nlc3NcIikge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIlxcbuKchSBUZXN0IGNvbW1hbmQgY29tcGxldGVkIHN1Y2Nlc3NmdWxseSFcIik7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiXFxuQ29tbWFuZCBPdXRwdXQ6XCIpO1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhzdGF0dXNSZXN1bHQuU3RhbmRhcmRPdXRwdXRDb250ZW50IHx8IFwiKG5vIG91dHB1dClcIik7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzdGF0dXNSZXN1bHQuU3RhbmRhcmRFcnJvckNvbnRlbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiXFxuRXJyb3JzOlwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHN0YXR1c1Jlc3VsdC5TdGFuZGFyZEVycm9yQ29udGVudCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChzdGF0dXMgPT09IFwiRmFpbGVkXCIgfHwgc3RhdHVzID09PSBcIkNhbmNlbGxlZFwiIHx8IHN0YXR1cyA9PT0gXCJUaW1lZE91dFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYFxcbuKdjCBUZXN0IGNvbW1hbmQgJHtzdGF0dXMudG9Mb3dlckNhc2UoKX1gKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJcXG5Db21tYW5kIE91dHB1dDpcIik7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHN0YXR1c1Jlc3VsdC5TdGFuZGFyZE91dHB1dENvbnRlbnQgfHwgXCIobm8gb3V0cHV0KVwiKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXR1c1Jlc3VsdC5TdGFuZGFyZEVycm9yQ29udGVudCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJcXG5FcnJvcnM6XCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coc3RhdHVzUmVzdWx0LlN0YW5kYXJkRXJyb3JDb250ZW50KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGF0dGVtcHRzKys7XG4gICAgICAgICAgICAgICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoXCIuXCIpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiXFxuRXJyb3IgY2hlY2tpbmcgY29tbWFuZCBzdGF0dXM6XCIsIGVycm9yKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYgKHN0YXR1cyA9PT0gXCJJblByb2dyZXNzXCIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiXFxu4pqg77iPICBDb21tYW5kIHN0aWxsIGluIHByb2dyZXNzLiBDaGVjayBzdGF0dXMgbWFudWFsbHk6XCIpO1xuICAgICAgICAgICAgY29uc29sZS5sb2coYGF3cyBzc20gZ2V0LWNvbW1hbmQtaW52b2NhdGlvbiAtLWNvbW1hbmQtaWQgJHtjb21tYW5kSWR9IC0taW5zdGFuY2UtaWQgJHtpbnN0YW5jZUlkfSAtLXByb2ZpbGUgJHtwcm9maWxlfWApO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBzZW5kIFNTTSBjb21tYW5kOlwiLCBlcnJvcik7XG4gICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIG1haW4oKSB7XG4gICAgY29uc3QgYXJncyA9IHByb2Nlc3MuYXJndi5zbGljZSgyKTtcbiAgICBjb25zdCBwcm9maWxlID0gcHJvY2Vzcy5lbnYuQVdTX1BST0ZJTEU7XG4gICAgaWYgKCFwcm9maWxlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCLinYwgRXJyb3I6IEFXU19QUk9GSUxFIGVudmlyb25tZW50IHZhcmlhYmxlIGlzIHJlcXVpcmVkXCIpO1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiICAgU2V0IGl0IHdpdGg6IGV4cG9ydCBBV1NfUFJPRklMRT15b3VyLXByb2ZpbGUtbmFtZVwiKTtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIiAgIE9yIGFkZCBpdCB0byAuZW52IGZpbGUgKG5vdCB0cmFja2VkIGluIGdpdClcIik7XG4gICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICB9XG4gICAgXG4gICAgLy8gUGFyc2UgYXJndW1lbnRzXG4gICAgY29uc3Qgb3B0aW9uczogVGVzdE9wdGlvbnMgPSB7XG4gICAgICAgIGluY2x1ZGVXcml0ZVRlc3RzOiBhcmdzLmluY2x1ZGVzKFwiLS1pbmNsdWRlLXdyaXRlLXRlc3RzXCIpLFxuICAgICAgICB0ZXN0RGVwdGg6IGFyZ3MuaW5jbHVkZXMoXCItLXRlc3QtZGVwdGhcIikgXG4gICAgICAgICAgICA/IChhcmdzW2FyZ3MuaW5kZXhPZihcIi0tdGVzdC1kZXB0aFwiKSArIDFdIGFzIFwiYmFzaWNcIiB8IFwiY29tcHJlaGVuc2l2ZVwiKVxuICAgICAgICAgICAgOiBcImJhc2ljXCIsXG4gICAgICAgIG1ldGhvZDogYXJncy5pbmNsdWRlcyhcIi0tbWV0aG9kXCIpXG4gICAgICAgICAgICA/IChhcmdzW2FyZ3MuaW5kZXhPZihcIi0tbWV0aG9kXCIpICsgMV0gYXMgXCJsYW1iZGFcIiB8IFwic3NtXCIpXG4gICAgICAgICAgICA6IFwibGFtYmRhXCIsXG4gICAgfTtcbiAgICBcbiAgICBjb25zb2xlLmxvZyhcIj09PSBORUFSIExvY2FsbmV0IFRlc3QgU3VpdGUgVHJpZ2dlciA9PT1cIik7XG4gICAgY29uc29sZS5sb2coYFByb2ZpbGU6ICR7cHJvZmlsZX1gKTtcbiAgICBjb25zb2xlLmxvZyhgTWV0aG9kOiAke29wdGlvbnMubWV0aG9kfWApO1xuICAgIGNvbnNvbGUubG9nKGBJbmNsdWRlIFdyaXRlIFRlc3RzOiAke29wdGlvbnMuaW5jbHVkZVdyaXRlVGVzdHMgfHwgZmFsc2V9YCk7XG4gICAgY29uc29sZS5sb2coYFRlc3QgRGVwdGg6ICR7b3B0aW9ucy50ZXN0RGVwdGh9XFxuYCk7XG4gICAgXG4gICAgdHJ5IHtcbiAgICAgICAgLy8gR2V0IHN0YWNrIG91dHB1dHNcbiAgICAgICAgY29uc3QgdGVzdFN0YWNrTmFtZSA9IFwibmVhci1sb2NhbG5ldC10ZXN0XCI7XG4gICAgICAgIGNvbnN0IGluZnJhU3RhY2tOYW1lID0gXCJuZWFyLWxvY2FsbmV0LWluZnJhc3RydWN0dXJlXCI7XG4gICAgICAgIFxuICAgICAgICBsZXQgbGFtYmRhQXJuOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICAgIGxldCBzc21Eb2N1bWVudE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgICAgbGV0IGluc3RhbmNlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgICAgbGV0IHByaXZhdGVJcDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgICBsZXQgcHVibGljSXA6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgICAgXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBsYW1iZGFBcm4gPSBnZXRTdGFja091dHB1dCh0ZXN0U3RhY2tOYW1lLCBcIlRlc3RMYW1iZGFBcm5cIiwgcHJvZmlsZSk7XG4gICAgICAgICAgICBzc21Eb2N1bWVudE5hbWUgPSBnZXRTdGFja091dHB1dCh0ZXN0U3RhY2tOYW1lLCBcIlRlc3RTc21Eb2N1bWVudE5hbWVcIiwgcHJvZmlsZSk7XG4gICAgICAgICAgICBpbnN0YW5jZUlkID0gZ2V0U3RhY2tPdXRwdXQoaW5mcmFTdGFja05hbWUsIFwibmVhcmluc3RhbmNlaWRcIiwgcHJvZmlsZSk7XG4gICAgICAgICAgICBwcml2YXRlSXAgPSBnZXRTdGFja091dHB1dChpbmZyYVN0YWNrTmFtZSwgXCJuZWFyaW5zdGFuY2Vwcml2YXRlaXBcIiwgcHJvZmlsZSk7XG4gICAgICAgICAgICBwdWJsaWNJcCA9IGdldFN0YWNrT3V0cHV0KGluZnJhU3RhY2tOYW1lLCBcIm5lYXJpbnN0YW5jZXB1YmxpY2lwXCIsIHByb2ZpbGUpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIuKdjCBGYWlsZWQgdG8gZ2V0IHN0YWNrIG91dHB1dHMuIEVuc3VyZSBzdGFja3MgYXJlIGRlcGxveWVkLlwiKTtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJSdW46IG5wbSBydW4gZGVwbG95XCIpO1xuICAgICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBjb25zb2xlLmxvZyhcIlJQQyBQcml2YXRlIElQOiBcIiArIChwcml2YXRlSXAgPz8gXCJ1bmtub3duXCIpKTtcbiAgICAgICAgY29uc29sZS5sb2coXCJSUEMgUHVibGljIElQOiAgXCIgKyAocHVibGljSXAgJiYgcHVibGljSXAgIT09IFwiTi9BXCIgPyBwdWJsaWNJcCA6IFwiKG5vdCBhc3NpZ25lZClcIikpO1xuICAgICAgICBcbiAgICAgICAgLy8gVHJpZ2dlciB0ZXN0c1xuICAgICAgICBpZiAob3B0aW9ucy5tZXRob2QgPT09IFwibGFtYmRhXCIpIHtcbiAgICAgICAgICAgIHRyaWdnZXJWaWFMYW1iZGEobGFtYmRhQXJuLCBvcHRpb25zLCBwcm9maWxlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmICghaW5zdGFuY2VJZCkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCLinYwgSW5zdGFuY2UgSUQgcmVxdWlyZWQgZm9yIFNTTSBtZXRob2RcIik7XG4gICAgICAgICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdHJpZ2dlclZpYVNTTShzc21Eb2N1bWVudE5hbWUsIGluc3RhbmNlSWQsIG9wdGlvbnMsIHByb2ZpbGUpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBjb25zb2xlLmxvZyhcIlxcbvCfkqEgVmlldyBkZXRhaWxlZCBsb2dzIGluIENsb3VkV2F0Y2g6XCIpO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAgTG9nIEdyb3VwOiAvYXdzL2xhbWJkYS9uZWFyLWxvY2FsbmV0LXRlc3RgKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgIERhc2hib2FyZDogQ2hlY2sgQVdTIENvbnNvbGUgZm9yICduZWFyLWxvY2FsbmV0LXRlc3QtKicgZGFzaGJvYXJkYCk7XG4gICAgICAgIFxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCLinYwgRmFpbGVkIHRvIHRyaWdnZXIgdGVzdHM6XCIsIGVycm9yKTtcbiAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgIH1cbn1cblxuLy8gUnVuIGlmIGV4ZWN1dGVkIGRpcmVjdGx5XG5pZiAocmVxdWlyZS5tYWluID09PSBtb2R1bGUpIHtcbiAgICBtYWluKCkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiVW5oYW5kbGVkIGVycm9yOlwiLCBlcnJvcik7XG4gICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICB9KTtcbn1cblxuZXhwb3J0IHsgdHJpZ2dlclZpYUxhbWJkYSwgdHJpZ2dlclZpYVNTTSB9O1xuXG4iXX0=
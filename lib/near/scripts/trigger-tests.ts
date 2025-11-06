#!/usr/bin/env node
/**
 * CLI script to trigger NEAR localnet test suite
 * 
 * Usage:
 *   npm run trigger-tests [-- --include-write-tests] [-- --test-depth comprehensive]
 *   node scripts/trigger-tests.ts [--include-write-tests] [--test-depth comprehensive]
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

interface TestOptions {
    includeWriteTests?: boolean;
    testDepth?: "basic" | "comprehensive";
    method?: "lambda" | "ssm";
    instanceId?: string;
    profile?: string;
}

function getStackOutput(stackName: string, outputKey: string, profile: string): string {
    try {
        const command = `aws cloudformation describe-stacks --stack-name ${stackName} --profile ${profile} --query "Stacks[0].Outputs[?OutputKey=='${outputKey}'].OutputValue" --output text`;
        const output = execSync(command, { encoding: "utf8" }).trim();
        if (!output || output === "None") {
            throw new Error(`Output ${outputKey} not found in stack ${stackName}`);
        }
        return output;
    } catch (error) {
        console.error(`Error getting stack output ${outputKey} from ${stackName}:`, error);
        throw error;
    }
}

function triggerViaLambda(lambdaArn: string, options: TestOptions, profile: string): void {
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
        execSync(command, { stdio: "inherit" });
        
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

            let payload: any = response;
            if (response && typeof response.body !== "undefined") {
                payload = typeof response.body === "string" ? JSON.parse(response.body) : response.body;
            }

            if (payload && payload.success) {
                console.log("\n✅ All tests passed!");
            } else {
                const message = (payload && (payload.message || payload.error)) || 'Unknown failure';
                console.log("\n❌ Tests failed:", message);
                process.exit(1);
            }
        }
    } catch (error) {
        console.error("Failed to invoke Lambda:", error);
        process.exit(1);
    }
}

async function triggerViaSSM(
    ssmDocumentName: string,
    instanceId: string,
    options: TestOptions,
    profile: string
): Promise<void> {
    console.log("Triggering tests via SSM document on EC2 instance...");
    
    const parameters: Record<string, string[]> = {
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
        const output = execSync(command, { encoding: "utf8" });
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
                const statusOutput = execSync(statusCommand, { encoding: "utf8" });
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
                } else if (status === "Failed" || status === "Cancelled" || status === "TimedOut") {
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
            } catch (error) {
                console.error("\nError checking command status:", error);
                break;
            }
        }
        
        if (status === "InProgress") {
            console.log("\n⚠️  Command still in progress. Check status manually:");
            console.log(`aws ssm get-command-invocation --command-id ${commandId} --instance-id ${instanceId} --profile ${profile}`);
        }
    } catch (error) {
        console.error("Failed to send SSM command:", error);
        process.exit(1);
    }
}

async function main() {
    const args = process.argv.slice(2);
    const profile = process.env.AWS_PROFILE || "shai-sandbox-profile";
    
    // Parse arguments
    const options: TestOptions = {
        includeWriteTests: args.includes("--include-write-tests"),
        testDepth: args.includes("--test-depth") 
            ? (args[args.indexOf("--test-depth") + 1] as "basic" | "comprehensive")
            : "basic",
        method: args.includes("--method")
            ? (args[args.indexOf("--method") + 1] as "lambda" | "ssm")
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
        
        let lambdaArn: string | undefined;
        let ssmDocumentName: string | undefined;
        let instanceId: string | undefined;
        let privateIp: string | undefined;
        let publicIp: string | undefined;
        
        try {
            lambdaArn = getStackOutput(testStackName, "TestLambdaArn", profile);
            ssmDocumentName = getStackOutput(testStackName, "TestSsmDocumentName", profile);
            instanceId = getStackOutput(infraStackName, "nearinstanceid", profile);
            privateIp = getStackOutput(infraStackName, "nearinstanceprivateip", profile);
            publicIp = getStackOutput(infraStackName, "nearinstancepublicip", profile);
        } catch (error) {
            console.error("❌ Failed to get stack outputs. Ensure stacks are deployed.");
            console.error("Run: npm run deploy");
            process.exit(1);
        }
        
        console.log("RPC Private IP: " + (privateIp ?? "unknown"));
        console.log("RPC Public IP:  " + (publicIp && publicIp !== "N/A" ? publicIp : "(not assigned)"));
        
        // Trigger tests
        if (options.method === "lambda") {
            triggerViaLambda(lambdaArn, options, profile);
        } else {
            if (!instanceId) {
                console.error("❌ Instance ID required for SSM method");
                process.exit(1);
            }
            triggerViaSSM(ssmDocumentName, instanceId, options, profile);
        }
        
        console.log("\n💡 View detailed logs in CloudWatch:");
        console.log(`   Log Group: /aws/lambda/near-localnet-test`);
        console.log(`   Dashboard: Check AWS Console for 'near-localnet-test-*' dashboard`);
        
    } catch (error) {
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

export { triggerViaLambda, triggerViaSSM };


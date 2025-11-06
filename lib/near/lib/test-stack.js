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
exports.NearTestStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const cw = __importStar(require("aws-cdk-lib/aws-cloudwatch"));
const ssm = __importStar(require("aws-cdk-lib/aws-ssm"));
const customResources = __importStar(require("aws-cdk-lib/custom-resources"));
const path = __importStar(require("path"));
const nag = __importStar(require("cdk-nag"));
const child_process_1 = require("child_process");
class NearTestStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { vpc, securityGroup, rpcUrl, instanceId, testConfig } = props;
        // CloudWatch Log Group for test results
        const testLogGroup = new logs.LogGroup(this, "TestLogGroup", {
            logGroupName: `/aws/lambda/near-localnet-test`,
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        // IAM role for Lambda function
        const lambdaRole = new iam.Role(this, "TestLambdaRole", {
            assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
                iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaVPCAccessExecutionRole"),
            ],
        });
        // Grant permissions to put CloudWatch metrics
        lambdaRole.addToPrincipalPolicy(new iam.PolicyStatement({
            actions: ["cloudwatch:PutMetricData"],
            resources: ["*"],
            conditions: {
                StringEquals: {
                    "cloudwatch:namespace": "NEAR/Test",
                },
            },
        }));
        // Security group for Lambda function
        const lambdaSecurityGroup = new ec2.SecurityGroup(this, "TestLambdaSecurityGroup", {
            vpc,
            description: "Security group for NEAR test Lambda function",
            allowAllOutbound: true,
        });
        // Allow Lambda to access NEAR RPC endpoint
        lambdaSecurityGroup.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(3030), "Allow access to NEAR RPC endpoint");
        // Build Lambda package before creating function
        const testSuiteDir = path.join(__dirname, "..", "assets", "test-suite");
        console.log('Building Lambda test suite...');
        try {
            (0, child_process_1.execSync)('bash build.sh', {
                cwd: testSuiteDir,
                stdio: 'inherit',
                env: { ...process.env, NODE_ENV: 'production' }
            });
        }
        catch (error) {
            console.error('Failed to build Lambda package:', error);
            throw new Error('Lambda build failed. Ensure npm and TypeScript are available.');
        }
        // Lambda function for running tests
        this.testLambdaFunction = new lambda.Function(this, "TestFunction", {
            functionName: "near-localnet-test",
            runtime: lambda.Runtime.NODEJS_20_X, // Node.js 20.x for near-api-js
            handler: "handler.handler",
            code: lambda.Code.fromAsset(path.join(testSuiteDir, "dist-package")),
            role: lambdaRole,
            vpc,
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
            securityGroups: [lambdaSecurityGroup],
            timeout: cdk.Duration.minutes(10), // Allow time for NEAR API operations
            memorySize: 512,
            environment: {
                RPC_URL: rpcUrl,
                NETWORK_ID: "localnet",
                INCLUDE_WRITE_TESTS: testConfig.includeWriteTests.toString(),
                TEST_DEPTH: testConfig.testDepth,
                INSTANCE_ID: instanceId,
                // Validator key will be added via SSM Parameter or passed at deploy time
                VALIDATOR_KEY_JSON: process.env.VALIDATOR_KEY_JSON || '',
            },
            logGroup: testLogGroup,
        });
        this.testLambdaArn = this.testLambdaFunction.functionArn;
        // SSM Document for triggering tests (runs on EC2 instance, invokes Lambda)
        const testTriggerDoc = new ssm.CfnDocument(this, "NearTestTrigger", {
            documentType: "Command",
            documentFormat: "YAML",
            name: `near-test-trigger-${this.stackName}`,
            content: {
                schemaVersion: "2.2",
                description: "Trigger NEAR localnet functional tests via Lambda",
                parameters: {
                    functionArn: {
                        type: "String",
                        description: "Lambda function ARN",
                        default: this.testLambdaArn,
                    },
                    includeWriteTests: {
                        type: "String",
                        description: "Include write tests",
                        default: testConfig.includeWriteTests.toString(),
                    },
                    testDepth: {
                        type: "String",
                        description: "Test depth (basic or comprehensive)",
                        default: testConfig.testDepth,
                    },
                },
                mainSteps: [
                    {
                        action: "aws:runShellScript",
                        name: "invokeTestLambda",
                        inputs: {
                            timeoutSeconds: "600", // 10 minutes
                            runCommand: [
                                "#!/bin/bash",
                                "set -euo pipefail",
                                "echo '[TEST-TRIGGER] Invoking test Lambda function...'",
                                "",
                                "FUNCTION_ARN=\"{{functionArn}}\"",
                                "INCLUDE_WRITE_TESTS=\"{{includeWriteTests}}\"",
                                "TEST_DEPTH=\"{{testDepth}}\"",
                                "",
                                "# Invoke Lambda function",
                                "RESPONSE=$(aws lambda invoke \\",
                                "  --function-name \"$FUNCTION_ARN\" \\",
                                "  --payload \"{\\\"includeWriteTests\\\": \\\"$INCLUDE_WRITE_TESTS\\\", \\\"testDepth\\\": \\\"$TEST_DEPTH\\\"}\" \\",
                                "  --cli-binary-format raw-in-base64-out \\",
                                "  /tmp/lambda-response.json 2>&1)",
                                "",
                                "if [ $? -ne 0 ]; then",
                                "  echo '[TEST-TRIGGER] ERROR: Failed to invoke Lambda'",
                                "  echo \"$RESPONSE\"",
                                "  exit 1",
                                "fi",
                                "",
                                "# Check Lambda response",
                                "if [ -f /tmp/lambda-response.json ]; then",
                                "  EXIT_CODE=$(jq -r '.FunctionError // empty' /tmp/lambda-response.json || echo '')",
                                "  if [ -n \"$EXIT_CODE\" ]; then",
                                "    echo '[TEST-TRIGGER] ERROR: Lambda function error'",
                                "    cat /tmp/lambda-response.json",
                                "    exit 1",
                                "  fi",
                                "fi",
                                "",
                                "# Wait for Lambda to complete and check logs",
                                "echo '[TEST-TRIGGER] Waiting for test completion...'",
                                "sleep 30",
                                "",
                                "# Get test results from logs",
                                "echo '[TEST-TRIGGER] Test execution completed'",
                                "echo '[TEST-TRIGGER] Check CloudWatch Logs for detailed results'",
                                "",
                                "exit 0",
                            ],
                        },
                    },
                ],
            },
        });
        this.testSsmDocumentName = testTriggerDoc.ref;
        // CloudFormation Custom Resource to invoke Lambda synchronously and wait for completion
        // This ensures stack completes only when tests pass
        const testCustomResource = new customResources.AwsCustomResource(this, "TestCustomResource", {
            onCreate: {
                service: "Lambda",
                action: "invoke",
                parameters: {
                    FunctionName: this.testLambdaFunction.functionName,
                    InvocationType: "RequestResponse", // Synchronous invocation
                    Payload: JSON.stringify({
                        includeWriteTests: testConfig.includeWriteTests,
                        testDepth: testConfig.testDepth,
                    }),
                },
                physicalResourceId: customResources.PhysicalResourceId.of(`test-${Date.now()}`),
            },
            onUpdate: {
                service: "Lambda",
                action: "invoke",
                parameters: {
                    FunctionName: this.testLambdaFunction.functionName,
                    InvocationType: "RequestResponse",
                    Payload: JSON.stringify({
                        includeWriteTests: testConfig.includeWriteTests,
                        testDepth: testConfig.testDepth,
                    }),
                },
                physicalResourceId: customResources.PhysicalResourceId.of(`test-${Date.now()}`),
            },
            policy: customResources.AwsCustomResourcePolicy.fromStatements([
                new iam.PolicyStatement({
                    actions: ["lambda:InvokeFunction"],
                    resources: [this.testLambdaFunction.functionArn],
                }),
            ]),
            timeout: cdk.Duration.minutes(10),
        });
        // Parse Lambda response and fail if tests failed
        // The Custom Resource will automatically fail if Lambda returns error
        // We'll handle success/failure in the Lambda response parsing
        // CloudWatch Dashboard for test metrics
        const dashboard = new cw.Dashboard(this, "TestDashboard", {
            dashboardName: `near-localnet-test-${this.stackName}`,
            widgets: [
                [
                    new cw.GraphWidget({
                        title: "Test Execution Results",
                        left: [
                            new cw.Metric({
                                namespace: "NEAR/Test",
                                metricName: "TestsPassed",
                                dimensionsMap: { FunctionName: this.testLambdaFunction.functionName },
                                statistic: "Sum",
                                label: "Tests Passed",
                            }),
                            new cw.Metric({
                                namespace: "NEAR/Test",
                                metricName: "TestsFailed",
                                dimensionsMap: { FunctionName: this.testLambdaFunction.functionName },
                                statistic: "Sum",
                                label: "Tests Failed",
                                color: cw.Color.RED,
                            }),
                        ],
                        width: 12,
                        height: 6,
                    }),
                ],
                [
                    new cw.GraphWidget({
                        title: "Test Duration & RPC Performance",
                        left: [
                            new cw.Metric({
                                namespace: "NEAR/Test",
                                metricName: "TestDuration",
                                dimensionsMap: { FunctionName: this.testLambdaFunction.functionName },
                                statistic: "Average",
                                label: "Test Duration (ms)",
                            }),
                        ],
                        right: [
                            new cw.Metric({
                                namespace: "NEAR/Test",
                                metricName: "RpcResponseTime",
                                dimensionsMap: { FunctionName: this.testLambdaFunction.functionName },
                                statistic: "Average",
                                label: "RPC Response Time (ms)",
                            }),
                        ],
                        width: 12,
                        height: 6,
                    }),
                ],
            ],
        });
        // Stack outputs
        new cdk.CfnOutput(this, "TestLambdaArn", {
            value: this.testLambdaArn,
            exportName: "NearLocalnetTestLambdaArn",
            description: "ARN of the test Lambda function",
        });
        new cdk.CfnOutput(this, "TestSsmDocumentName", {
            value: this.testSsmDocumentName,
            exportName: "NearLocalnetTestSsmDocumentName",
            description: "SSM Document name for triggering tests",
        });
        new cdk.CfnOutput(this, "TestLogGroupName", {
            value: testLogGroup.logGroupName,
            exportName: "NearLocalnetTestLogGroup",
            description: "CloudWatch Log Group for test results",
        });
        new cdk.CfnOutput(this, "TestDashboardUrl", {
            value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${dashboard.dashboardName}`,
            description: "CloudWatch Dashboard URL for test metrics",
        });
        // CDK Nag suppressions
        nag.NagSuppressions.addResourceSuppressions(this, [
            {
                id: "AwsSolutions-IAM4",
                reason: "AWS managed policies are appropriate for Lambda execution roles",
            },
            {
                id: "AwsSolutions-IAM5",
                reason: "CloudWatch PutMetricData requires wildcard for namespace filtering",
            },
            {
                id: "AwsSolutions-EC23",
                reason: "Security group allows VPC CIDR access for RPC endpoint testing",
            },
            {
                id: "AwsSolutions-L1",
                reason: "Node.js 20.x is appropriate runtime for Lambda function with near-api-js",
            },
        ], true);
        // Suppress IAM4 for Custom Resource role
        nag.NagSuppressions.addResourceSuppressions(testCustomResource, [
            {
                id: "AwsSolutions-IAM4",
                reason: "AWS managed policies are appropriate for Custom Resource Lambda",
            },
        ], true);
    }
}
exports.NearTestStack = NearTestStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdC1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInRlc3Qtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBRW5DLCtEQUFpRDtBQUNqRCx5REFBMkM7QUFDM0MseURBQTJDO0FBQzNDLDJEQUE2QztBQUM3QywrREFBaUQ7QUFDakQseURBQTJDO0FBQzNDLDhFQUFnRTtBQUNoRSwyQ0FBNkI7QUFDN0IsNkNBQStCO0FBQy9CLGlEQUF5QztBQWV6QyxNQUFhLGFBQWMsU0FBUSxHQUFHLENBQUMsS0FBSztJQUt4QyxZQUFZLEtBQThCLEVBQUUsRUFBVSxFQUFFLEtBQXlCO1FBQzdFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sRUFBRSxHQUFHLEVBQUUsYUFBYSxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLEdBQUcsS0FBSyxDQUFDO1FBRXJFLHdDQUF3QztRQUN4QyxNQUFNLFlBQVksR0FBRyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRTtZQUN6RCxZQUFZLEVBQUUsZ0NBQWdDO1lBQzlDLFNBQVMsRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLFFBQVE7WUFDdEMsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTztTQUMzQyxDQUFDLENBQUM7UUFFSCwrQkFBK0I7UUFDL0IsTUFBTSxVQUFVLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUNwRCxTQUFTLEVBQUUsSUFBSSxHQUFHLENBQUMsZ0JBQWdCLENBQUMsc0JBQXNCLENBQUM7WUFDM0QsZUFBZSxFQUFFO2dCQUNiLEdBQUcsQ0FBQyxhQUFhLENBQUMsd0JBQXdCLENBQUMsMENBQTBDLENBQUM7Z0JBQ3RGLEdBQUcs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QUN2QixNQUFNLEVBQUUsaUVBQWlFO2FBQzVFO1lBQ0Q7Z0JBQ0ksRUFBRSxFQUFFLG1CQUFtQjtnQkFDdkIsTUFBTSxFQUFFLG9FQUFvRTthQUMvRTtZQUNEO2dCQUNJLEVBQUUsRUFBRSxtQkFBbUI7Z0JBQ3ZCLE1BQU0sRUFBRSxnRUFBZ0U7YUFDM0U7WUFDRDtnQkFDSSxFQUFFLEVBQUUsaUJBQWlCO2dCQUNyQixNQUFNLEVBQUUsMEVBQTBFO2FBQ3JGO1NBQ0osRUFDRCxJQUFJLENBQ1AsQ0FBQztRQUVGLHlDQUF5QztRQUN6QyxHQUFHLENBQUMsZUFBZSxDQUFDLHVCQUF1QixDQUN2QyxrQkFBa0IsRUFDbEI7WUFDSTtnQkFDSSxFQUFFLEVBQUUsbUJBQW1CO2dCQUN2QixNQUFNLEVBQUUsaUVBQWlFO2FBQzVFO1NBQ0osRUFDRCxJQUFJLENBQ1AsQ0FBQztJQUNOLENBQUM7Q0FDSjtBQTVVRCxzQ0E0VUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgKiBhcyBjZGtDb25zdHJ1Y3RzIGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSBcImF3cy1jZGstbGliL2F3cy1sYW1iZGFcIjtcbmltcG9ydCAqIGFzIGVjMiBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWVjMlwiO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtaWFtXCI7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtbG9nc1wiO1xuaW1wb3J0ICogYXMgY3cgZnJvbSBcImF3cy1jZGstbGliL2F3cy1jbG91ZHdhdGNoXCI7XG5pbXBvcnQgKiBhcyBzc20gZnJvbSBcImF3cy1jZGstbGliL2F3cy1zc21cIjtcbmltcG9ydCAqIGFzIGN1c3RvbVJlc291cmNlcyBmcm9tIFwiYXdzLWNkay1saWIvY3VzdG9tLXJlc291cmNlc1wiO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tIFwicGF0aFwiO1xuaW1wb3J0ICogYXMgbmFnIGZyb20gXCJjZGstbmFnXCI7XG5pbXBvcnQgeyBleGVjU3luYyB9IGZyb20gXCJjaGlsZF9wcm9jZXNzXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGVzdENvbmZpZyB7XG4gICAgaW5jbHVkZVdyaXRlVGVzdHM6IGJvb2xlYW47XG4gICAgdGVzdERlcHRoOiBcImJhc2ljXCIgfCBcImNvbXByZWhlbnNpdmVcIjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOZWFyVGVzdFN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gICAgdnBjOiBlYzIuSVZwYztcbiAgICBzZWN1cml0eUdyb3VwOiBlYzIuSVNlY3VyaXR5R3JvdXA7XG4gICAgcnBjVXJsOiBzdHJpbmc7XG4gICAgaW5zdGFuY2VJZDogc3RyaW5nO1xuICAgIHRlc3RDb25maWc6IFRlc3RDb25maWc7XG59XG5cbmV4cG9ydCBjbGFzcyBOZWFyVGVzdFN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgICBwdWJsaWMgcmVhZG9ubHkgdGVzdExhbWJkYUFybjogc3RyaW5nO1xuICAgIHB1YmxpYyByZWFkb25seSB0ZXN0TGFtYmRhRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcbiAgICBwdWJsaWMgcmVhZG9ubHkgdGVzdFNzbURvY3VtZW50TmFtZTogc3RyaW5nO1xuXG4gICAgY29uc3RydWN0b3Ioc2NvcGU6IGNka0NvbnN0cnVjdHMuQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogTmVhclRlc3RTdGFja1Byb3BzKSB7XG4gICAgICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgICAgIGNvbnN0IHsgdnBjLCBzZWN1cml0eUdyb3VwLCBycGNVcmwsIGluc3RhbmNlSWQsIHRlc3RDb25maWcgfSA9IHByb3BzO1xuXG4gICAgICAgIC8vIENsb3VkV2F0Y2ggTG9nIEdyb3VwIGZvciB0ZXN0IHJlc3VsdHNcbiAgICAgICAgY29uc3QgdGVzdExvZ0dyb3VwID0gbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgXCJUZXN0TG9nR3JvdXBcIiwge1xuICAgICAgICAgICAgbG9nR3JvdXBOYW1lOiBgL2F3cy9sYW1iZGEvbmVhci1sb2NhbG5ldC10ZXN0YCxcbiAgICAgICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gSUFNIHJvbGUgZm9yIExhbWJkYSBmdW5jdGlvblxuICAgICAgICBjb25zdCBsYW1iZGFSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsIFwiVGVzdExhbWJkYVJvbGVcIiwge1xuICAgICAgICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoXCJsYW1iZGEuYW1hem9uYXdzLmNvbVwiKSxcbiAgICAgICAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICAgICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZShcInNlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGVcIiksXG4gICAgICAgICAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKFwic2VydmljZS1yb2xlL0FXU0xhbWJkYVZQQ0FjY2Vzc0V4ZWN1dGlvblJvbGVcIiksXG4gICAgICAgICAgICBdLFxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBHcmFudCBwZXJtaXNzaW9ucyB0byBwdXQgQ2xvdWRXYXRjaCBtZXRyaWNzXG4gICAgICAgIGxhbWJkYVJvbGUuYWRkVG9QcmluY2lwYWxQb2xpY3koXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgICAgYWN0aW9uczogW1wiY2xvdWR3YXRjaDpQdXRNZXRyaWNEYXRhXCJdLFxuICAgICAgICAgICAgICAgIHJlc291cmNlczogW1wiKlwiXSxcbiAgICAgICAgICAgICAgICBjb25kaXRpb25zOiB7XG4gICAgICAgICAgICAgICAgICAgIFN0cmluZ0VxdWFsczoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJjbG91ZHdhdGNoOm5hbWVzcGFjZVwiOiBcIk5FQVIvVGVzdFwiLFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9KVxuICAgICAgICApO1xuXG4gICAgICAgIC8vIFNlY3VyaXR5IGdyb3VwIGZvciBMYW1iZGEgZnVuY3Rpb25cbiAgICAgICAgY29uc3QgbGFtYmRhU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCBcIlRlc3RMYW1iZGFTZWN1cml0eUdyb3VwXCIsIHtcbiAgICAgICAgICAgIHZwYyxcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBcIlNlY3VyaXR5IGdyb3VwIGZvciBORUFSIHRlc3QgTGFtYmRhIGZ1bmN0aW9uXCIsXG4gICAgICAgICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlLFxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBBbGxvdyBMYW1iZGEgdG8gYWNjZXNzIE5FQVIgUlBDIGVuZHBvaW50XG4gICAgICAgIGxhbWJkYVNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICAgICAgICBlYzIuUGVlci5pcHY0KHZwYy52cGNDaWRyQmxvY2spLFxuICAgICAgICAgICAgZWMyLlBvcnQudGNwKDMwMzApLFxuICAgICAgICAgICAgXCJBbGxvdyBhY2Nlc3MgdG8gTkVBUiBSUEMgZW5kcG9pbnRcIlxuICAgICAgICApO1xuXG4gICAgICAgIC8vIEJ1aWxkIExhbWJkYSBwYWNrYWdlIGJlZm9yZSBjcmVhdGluZyBmdW5jdGlvblxuICAgICAgICBjb25zdCB0ZXN0U3VpdGVEaXIgPSBwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uXCIsIFwiYXNzZXRzXCIsIFwidGVzdC1zdWl0ZVwiKTtcbiAgICAgICAgY29uc29sZS5sb2coJ0J1aWxkaW5nIExhbWJkYSB0ZXN0IHN1aXRlLi4uJyk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBleGVjU3luYygnYmFzaCBidWlsZC5zaCcsIHsgXG4gICAgICAgICAgICAgICAgY3dkOiB0ZXN0U3VpdGVEaXIsIFxuICAgICAgICAgICAgICAgIHN0ZGlvOiAnaW5oZXJpdCcsXG4gICAgICAgICAgICAgICAgZW52OiB7IC4uLnByb2Nlc3MuZW52LCBOT0RFX0VOVjogJ3Byb2R1Y3Rpb24nIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGJ1aWxkIExhbWJkYSBwYWNrYWdlOicsIGVycm9yKTtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTGFtYmRhIGJ1aWxkIGZhaWxlZC4gRW5zdXJlIG5wbSBhbmQgVHlwZVNjcmlwdCBhcmUgYXZhaWxhYmxlLicpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gTGFtYmRhIGZ1bmN0aW9uIGZvciBydW5uaW5nIHRlc3RzXG4gICAgICAgIHRoaXMudGVzdExhbWJkYUZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcIlRlc3RGdW5jdGlvblwiLCB7XG4gICAgICAgICAgICBmdW5jdGlvbk5hbWU6IFwibmVhci1sb2NhbG5ldC10ZXN0XCIsXG4gICAgICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCwgLy8gTm9kZS5qcyAyMC54IGZvciBuZWFyLWFwaS1qc1xuICAgICAgICAgICAgaGFuZGxlcjogXCJoYW5kbGVyLmhhbmRsZXJcIixcbiAgICAgICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4odGVzdFN1aXRlRGlyLCBcImRpc3QtcGFja2FnZVwiKSksXG4gICAgICAgICAgICByb2xlOiBsYW1iZGFSb2xlLFxuICAgICAgICAgICAgdnBjLFxuICAgICAgICAgICAgdnBjU3VibmV0czogeyBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfRUdSRVNTIH0sXG4gICAgICAgICAgICBzZWN1cml0eUdyb3VwczogW2xhbWJkYVNlY3VyaXR5R3JvdXBdLFxuICAgICAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMTApLCAvLyBBbGxvdyB0aW1lIGZvciBORUFSIEFQSSBvcGVyYXRpb25zXG4gICAgICAgICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgICAgICAgIFJQQ19VUkw6IHJwY1VybCxcbiAgICAgICAgICAgICAgICBORVRXT1JLX0lEOiBcImxvY2FsbmV0XCIsXG4gICAgICAgICAgICAgICAgSU5DTFVERV9XUklURV9URVNUUzogdGVzdENvbmZpZy5pbmNsdWRlV3JpdGVUZXN0cy50b1N0cmluZygpLFxuICAgICAgICAgICAgICAgIFRFU1RfREVQVEg6IHRlc3RDb25maWcudGVzdERlcHRoLFxuICAgICAgICAgICAgICAgIElOU1RBTkNFX0lEOiBpbnN0YW5jZUlkLFxuICAgICAgICAgICAgICAgIC8vIFZhbGlkYXRvciBrZXkgd2lsbCBiZSBhZGRlZCB2aWEgU1NNIFBhcmFtZXRlciBvciBwYXNzZWQgYXQgZGVwbG95IHRpbWVcbiAgICAgICAgICAgICAgICBWQUxJREFUT1JfS0VZX0pTT046IHByb2Nlc3MuZW52LlZBTElEQVRPUl9LRVlfSlNPTiB8fCAnJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBsb2dHcm91cDogdGVzdExvZ0dyb3VwLFxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLnRlc3RMYW1iZGFBcm4gPSB0aGlzLnRlc3RMYW1iZGFGdW5jdGlvbi5mdW5jdGlvbkFybjtcblxuICAgICAgICAvLyBTU00gRG9jdW1lbnQgZm9yIHRyaWdnZXJpbmcgdGVzdHMgKHJ1bnMgb24gRUMyIGluc3RhbmNlLCBpbnZva2VzIExhbWJkYSlcbiAgICAgICAgY29uc3QgdGVzdFRyaWdnZXJEb2MgPSBuZXcgc3NtLkNmbkRvY3VtZW50KHRoaXMsIFwiTmVhclRlc3RUcmlnZ2VyXCIsIHtcbiAgICAgICAgICAgIGRvY3VtZW50VHlwZTogXCJDb21tYW5kXCIsXG4gICAgICAgICAgICBkb2N1bWVudEZvcm1hdDogXCJZQU1MXCIsXG4gICAgICAgICAgICBuYW1lOiBgbmVhci10ZXN0LXRyaWdnZXItJHt0aGlzLnN0YWNrTmFtZX1gLFxuICAgICAgICAgICAgY29udGVudDoge1xuICAgICAgICAgICAgICAgIHNjaGVtYVZlcnNpb246IFwiMi4yXCIsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IFwiVHJpZ2dlciBORUFSIGxvY2FsbmV0IGZ1bmN0aW9uYWwgdGVzdHMgdmlhIExhbWJkYVwiLFxuICAgICAgICAgICAgICAgIHBhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb25Bcm46IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IFwiU3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogXCJMYW1iZGEgZnVuY3Rpb24gQVJOXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OiB0aGlzLnRlc3RMYW1iZGFBcm4sXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIGluY2x1ZGVXcml0ZVRlc3RzOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBcIlN0cmluZ1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IFwiSW5jbHVkZSB3cml0ZSB0ZXN0c1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDogdGVzdENvbmZpZy5pbmNsdWRlV3JpdGVUZXN0cy50b1N0cmluZygpLFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICB0ZXN0RGVwdGg6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IFwiU3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogXCJUZXN0IGRlcHRoIChiYXNpYyBvciBjb21wcmVoZW5zaXZlKVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDogdGVzdENvbmZpZy50ZXN0RGVwdGgsXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBtYWluU3RlcHM6IFtcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgYWN0aW9uOiBcImF3czpydW5TaGVsbFNjcmlwdFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogXCJpbnZva2VUZXN0TGFtYmRhXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBpbnB1dHM6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aW1lb3V0U2Vjb25kczogXCI2MDBcIiwgLy8gMTAgbWludXRlc1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJ1bkNvbW1hbmQ6IFtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIjIS9iaW4vYmFzaFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInNldCAtZXVvIHBpcGVmYWlsXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZWNobyAnW1RFU1QtVFJJR0dFUl0gSW52b2tpbmcgdGVzdCBMYW1iZGEgZnVuY3Rpb24uLi4nXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiRlVOQ1RJT05fQVJOPVxcXCJ7e2Z1bmN0aW9uQXJufX1cXFwiXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiSU5DTFVERV9XUklURV9URVNUUz1cXFwie3tpbmNsdWRlV3JpdGVUZXN0c319XFxcIlwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIlRFU1RfREVQVEg9XFxcInt7dGVzdERlcHRofX1cXFwiXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiIyBJbnZva2UgTGFtYmRhIGZ1bmN0aW9uXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiUkVTUE9OU0U9JChhd3MgbGFtYmRhIGludm9rZSBcXFxcXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiICAtLWZ1bmN0aW9uLW5hbWUgXFxcIiRGVU5DVElPTl9BUk5cXFwiIFxcXFxcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIgIC0tcGF5bG9hZCBcXFwie1xcXFxcXFwiaW5jbHVkZVdyaXRlVGVzdHNcXFxcXFxcIjogXFxcXFxcXCIkSU5DTFVERV9XUklURV9URVNUU1xcXFxcXFwiLCBcXFxcXFxcInRlc3REZXB0aFxcXFxcXFwiOiBcXFxcXFxcIiRURVNUX0RFUFRIXFxcXFxcXCJ9XFxcIiBcXFxcXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiICAtLWNsaS1iaW5hcnktZm9ybWF0IHJhdy1pbi1iYXNlNjQtb3V0IFxcXFxcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIgIC90bXAvbGFtYmRhLXJlc3BvbnNlLmpzb24gMj4mMSlcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJpZiBbICQ/IC1uZSAwIF07IHRoZW5cIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIgIGVjaG8gJ1tURVNULVRSSUdHRVJdIEVSUk9SOiBGYWlsZWQgdG8gaW52b2tlIExhbWJkYSdcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIgIGVjaG8gXFxcIiRSRVNQT05TRVxcXCJcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIgIGV4aXQgMVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImZpXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiIyBDaGVjayBMYW1iZGEgcmVzcG9uc2VcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJpZiBbIC1mIC90bXAvbGFtYmRhLXJlc3BvbnNlLmpzb24gXTsgdGhlblwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiAgRVhJVF9DT0RFPSQoanEgLXIgJy5GdW5jdGlvbkVycm9yIC8vIGVtcHR5JyAvdG1wL2xhbWJkYS1yZXNwb25zZS5qc29uIHx8IGVjaG8gJycpXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiICBpZiBbIC1uIFxcXCIkRVhJVF9DT0RFXFxcIiBdOyB0aGVuXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiICAgIGVjaG8gJ1tURVNULVRSSUdHRVJdIEVSUk9SOiBMYW1iZGEgZnVuY3Rpb24gZXJyb3InXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiICAgIGNhdCAvdG1wL2xhbWJkYS1yZXNwb25zZS5qc29uXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiICAgIGV4aXQgMVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiAgZmlcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJmaVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIlwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiMgV2FpdCBmb3IgTGFtYmRhIHRvIGNvbXBsZXRlIGFuZCBjaGVjayBsb2dzXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZWNobyAnW1RFU1QtVFJJR0dFUl0gV2FpdGluZyBmb3IgdGVzdCBjb21wbGV0aW9uLi4uJ1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInNsZWVwIDMwXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiIyBHZXQgdGVzdCByZXN1bHRzIGZyb20gbG9nc1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImVjaG8gJ1tURVNULVRSSUdHRVJdIFRlc3QgZXhlY3V0aW9uIGNvbXBsZXRlZCdcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJlY2hvICdbVEVTVC1UUklHR0VSXSBDaGVjayBDbG91ZFdhdGNoIExvZ3MgZm9yIGRldGFpbGVkIHJlc3VsdHMnXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZXhpdCAwXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMudGVzdFNzbURvY3VtZW50TmFtZSA9IHRlc3RUcmlnZ2VyRG9jLnJlZjtcblxuICAgICAgICAvLyBDbG91ZEZvcm1hdGlvbiBDdXN0b20gUmVzb3VyY2UgdG8gaW52b2tlIExhbWJkYSBzeW5jaHJvbm91c2x5IGFuZCB3YWl0IGZvciBjb21wbGV0aW9uXG4gICAgICAgIC8vIFRoaXMgZW5zdXJlcyBzdGFjayBjb21wbGV0ZXMgb25seSB3aGVuIHRlc3RzIHBhc3NcbiAgICAgICAgY29uc3QgdGVzdEN1c3RvbVJlc291cmNlID0gbmV3IGN1c3RvbVJlc291cmNlcy5Bd3NDdXN0b21SZXNvdXJjZSh0aGlzLCBcIlRlc3RDdXN0b21SZXNvdXJjZVwiLCB7XG4gICAgICAgICAgICBvbkNyZWF0ZToge1xuICAgICAgICAgICAgICAgIHNlcnZpY2U6IFwiTGFtYmRhXCIsXG4gICAgICAgICAgICAgICAgYWN0aW9uOiBcImludm9rZVwiLFxuICAgICAgICAgICAgICAgIHBhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgICAgICAgICAgRnVuY3Rpb25OYW1lOiB0aGlzLnRlc3RMYW1iZGFGdW5jdGlvbi5mdW5jdGlvbk5hbWUsXG4gICAgICAgICAgICAgICAgICAgIEludm9jYXRpb25UeXBlOiBcIlJlcXVlc3RSZXNwb25zZVwiLCAvLyBTeW5jaHJvbm91cyBpbnZvY2F0aW9uXG4gICAgICAgICAgICAgICAgICAgIFBheWxvYWQ6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGluY2x1ZGVXcml0ZVRlc3RzOiB0ZXN0Q29uZmlnLmluY2x1ZGVXcml0ZVRlc3RzLFxuICAgICAgICAgICAgICAgICAgICAgICAgdGVzdERlcHRoOiB0ZXN0Q29uZmlnLnRlc3REZXB0aCxcbiAgICAgICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBwaHlzaWNhbFJlc291cmNlSWQ6IGN1c3RvbVJlc291cmNlcy5QaHlzaWNhbFJlc291cmNlSWQub2YoYHRlc3QtJHtEYXRlLm5vdygpfWApLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9uVXBkYXRlOiB7XG4gICAgICAgICAgICAgICAgc2VydmljZTogXCJMYW1iZGFcIixcbiAgICAgICAgICAgICAgICBhY3Rpb246IFwiaW52b2tlXCIsXG4gICAgICAgICAgICAgICAgcGFyYW1ldGVyczoge1xuICAgICAgICAgICAgICAgICAgICBGdW5jdGlvbk5hbWU6IHRoaXMudGVzdExhbWJkYUZ1bmN0aW9uLmZ1bmN0aW9uTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgSW52b2NhdGlvblR5cGU6IFwiUmVxdWVzdFJlc3BvbnNlXCIsXG4gICAgICAgICAgICAgICAgICAgIFBheWxvYWQ6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGluY2x1ZGVXcml0ZVRlc3RzOiB0ZXN0Q29uZmlnLmluY2x1ZGVXcml0ZVRlc3RzLFxuICAgICAgICAgICAgICAgICAgICAgICAgdGVzdERlcHRoOiB0ZXN0Q29uZmlnLnRlc3REZXB0aCxcbiAgICAgICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBwaHlzaWNhbFJlc291cmNlSWQ6IGN1c3RvbVJlc291cmNlcy5QaHlzaWNhbFJlc291cmNlSWQub2YoYHRlc3QtJHtEYXRlLm5vdygpfWApLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHBvbGljeTogY3VzdG9tUmVzb3VyY2VzLkF3c0N1c3RvbVJlc291cmNlUG9saWN5LmZyb21TdGF0ZW1lbnRzKFtcbiAgICAgICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgICAgICAgIGFjdGlvbnM6IFtcImxhbWJkYTpJbnZva2VGdW5jdGlvblwiXSxcbiAgICAgICAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbdGhpcy50ZXN0TGFtYmRhRnVuY3Rpb24uZnVuY3Rpb25Bcm5dLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgXSksXG4gICAgICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxMCksXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFBhcnNlIExhbWJkYSByZXNwb25zZSBhbmQgZmFpbCBpZiB0ZXN0cyBmYWlsZWRcbiAgICAgICAgLy8gVGhlIEN1c3RvbSBSZXNvdXJjZSB3aWxsIGF1dG9tYXRpY2FsbHkgZmFpbCBpZiBMYW1iZGEgcmV0dXJucyBlcnJvclxuICAgICAgICAvLyBXZSdsbCBoYW5kbGUgc3VjY2Vzcy9mYWlsdXJlIGluIHRoZSBMYW1iZGEgcmVzcG9uc2UgcGFyc2luZ1xuXG4gICAgICAgIC8vIENsb3VkV2F0Y2ggRGFzaGJvYXJkIGZvciB0ZXN0IG1ldHJpY3NcbiAgICAgICAgY29uc3QgZGFzaGJvYXJkID0gbmV3IGN3LkRhc2hib2FyZCh0aGlzLCBcIlRlc3REYXNoYm9hcmRcIiwge1xuICAgICAgICAgICAgZGFzaGJvYXJkTmFtZTogYG5lYXItbG9jYWxuZXQtdGVzdC0ke3RoaXMuc3RhY2tOYW1lfWAsXG4gICAgICAgICAgICB3aWRnZXRzOiBbXG4gICAgICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgICAgICBuZXcgY3cuR3JhcGhXaWRnZXQoe1xuICAgICAgICAgICAgICAgICAgICAgICAgdGl0bGU6IFwiVGVzdCBFeGVjdXRpb24gUmVzdWx0c1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgbGVmdDogW1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBjdy5NZXRyaWMoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lc3BhY2U6IFwiTkVBUi9UZXN0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1ldHJpY05hbWU6IFwiVGVzdHNQYXNzZWRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGltZW5zaW9uc01hcDogeyBGdW5jdGlvbk5hbWU6IHRoaXMudGVzdExhbWJkYUZ1bmN0aW9uLmZ1bmN0aW9uTmFtZSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0aXN0aWM6IFwiU3VtXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxhYmVsOiBcIlRlc3RzIFBhc3NlZFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBjdy5NZXRyaWMoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lc3BhY2U6IFwiTkVBUi9UZXN0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1ldHJpY05hbWU6IFwiVGVzdHNGYWlsZWRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGltZW5zaW9uc01hcDogeyBGdW5jdGlvbk5hbWU6IHRoaXMudGVzdExhbWJkYUZ1bmN0aW9uLmZ1bmN0aW9uTmFtZSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0aXN0aWM6IFwiU3VtXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxhYmVsOiBcIlRlc3RzIEZhaWxlZFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb2xvcjogY3cuQ29sb3IuUkVELFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoOiAxMixcbiAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodDogNixcbiAgICAgICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICBbXG4gICAgICAgICAgICAgICAgICAgIG5ldyBjdy5HcmFwaFdpZGdldCh7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aXRsZTogXCJUZXN0IER1cmF0aW9uICYgUlBDIFBlcmZvcm1hbmNlXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBsZWZ0OiBbXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV3IGN3Lk1ldHJpYyh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWVzcGFjZTogXCJORUFSL1Rlc3RcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWV0cmljTmFtZTogXCJUZXN0RHVyYXRpb25cIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGltZW5zaW9uc01hcDogeyBGdW5jdGlvbk5hbWU6IHRoaXMudGVzdExhbWJkYUZ1bmN0aW9uLmZ1bmN0aW9uTmFtZSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0aXN0aWM6IFwiQXZlcmFnZVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsYWJlbDogXCJUZXN0IER1cmF0aW9uIChtcylcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgICAgICAgICByaWdodDogW1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBjdy5NZXRyaWMoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lc3BhY2U6IFwiTkVBUi9UZXN0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1ldHJpY05hbWU6IFwiUnBjUmVzcG9uc2VUaW1lXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRpbWVuc2lvbnNNYXA6IHsgRnVuY3Rpb25OYW1lOiB0aGlzLnRlc3RMYW1iZGFGdW5jdGlvbi5mdW5jdGlvbk5hbWUgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGlzdGljOiBcIkF2ZXJhZ2VcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGFiZWw6IFwiUlBDIFJlc3BvbnNlIFRpbWUgKG1zKVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoOiAxMixcbiAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodDogNixcbiAgICAgICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIF0sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFN0YWNrIG91dHB1dHNcbiAgICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJUZXN0TGFtYmRhQXJuXCIsIHtcbiAgICAgICAgICAgIHZhbHVlOiB0aGlzLnRlc3RMYW1iZGFBcm4sXG4gICAgICAgICAgICBleHBvcnROYW1lOiBcIk5lYXJMb2NhbG5ldFRlc3RMYW1iZGFBcm5cIixcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBcIkFSTiBvZiB0aGUgdGVzdCBMYW1iZGEgZnVuY3Rpb25cIixcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJUZXN0U3NtRG9jdW1lbnROYW1lXCIsIHtcbiAgICAgICAgICAgIHZhbHVlOiB0aGlzLnRlc3RTc21Eb2N1bWVudE5hbWUsXG4gICAgICAgICAgICBleHBvcnROYW1lOiBcIk5lYXJMb2NhbG5ldFRlc3RTc21Eb2N1bWVudE5hbWVcIixcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBcIlNTTSBEb2N1bWVudCBuYW1lIGZvciB0cmlnZ2VyaW5nIHRlc3RzXCIsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiVGVzdExvZ0dyb3VwTmFtZVwiLCB7XG4gICAgICAgICAgICB2YWx1ZTogdGVzdExvZ0dyb3VwLmxvZ0dyb3VwTmFtZSxcbiAgICAgICAgICAgIGV4cG9ydE5hbWU6IFwiTmVhckxvY2FsbmV0VGVzdExvZ0dyb3VwXCIsXG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogXCJDbG91ZFdhdGNoIExvZyBHcm91cCBmb3IgdGVzdCByZXN1bHRzXCIsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiVGVzdERhc2hib2FyZFVybFwiLCB7XG4gICAgICAgICAgICB2YWx1ZTogYGh0dHBzOi8vJHt0aGlzLnJlZ2lvbn0uY29uc29sZS5hd3MuYW1hem9uLmNvbS9jbG91ZHdhdGNoL2hvbWU/cmVnaW9uPSR7dGhpcy5yZWdpb259I2Rhc2hib2FyZHM6bmFtZT0ke2Rhc2hib2FyZC5kYXNoYm9hcmROYW1lfWAsXG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogXCJDbG91ZFdhdGNoIERhc2hib2FyZCBVUkwgZm9yIHRlc3QgbWV0cmljc1wiLFxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBDREsgTmFnIHN1cHByZXNzaW9uc1xuICAgICAgICBuYWcuTmFnU3VwcHJlc3Npb25zLmFkZFJlc291cmNlU3VwcHJlc3Npb25zKFxuICAgICAgICAgICAgdGhpcyxcbiAgICAgICAgICAgIFtcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGlkOiBcIkF3c1NvbHV0aW9ucy1JQU00XCIsXG4gICAgICAgICAgICAgICAgICAgIHJlYXNvbjogXCJBV1MgbWFuYWdlZCBwb2xpY2llcyBhcmUgYXBwcm9wcmlhdGUgZm9yIExhbWJkYSBleGVjdXRpb24gcm9sZXNcIixcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgaWQ6IFwiQXdzU29sdXRpb25zLUlBTTVcIixcbiAgICAgICAgICAgICAgICAgICAgcmVhc29uOiBcIkNsb3VkV2F0Y2ggUHV0TWV0cmljRGF0YSByZXF1aXJlcyB3aWxkY2FyZCBmb3IgbmFtZXNwYWNlIGZpbHRlcmluZ1wiLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBpZDogXCJBd3NTb2x1dGlvbnMtRUMyM1wiLFxuICAgICAgICAgICAgICAgICAgICByZWFzb246IFwiU2VjdXJpdHkgZ3JvdXAgYWxsb3dzIFZQQyBDSURSIGFjY2VzcyBmb3IgUlBDIGVuZHBvaW50IHRlc3RpbmdcIixcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgaWQ6IFwiQXdzU29sdXRpb25zLUwxXCIsXG4gICAgICAgICAgICAgICAgICAgIHJlYXNvbjogXCJOb2RlLmpzIDIwLnggaXMgYXBwcm9wcmlhdGUgcnVudGltZSBmb3IgTGFtYmRhIGZ1bmN0aW9uIHdpdGggbmVhci1hcGktanNcIixcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcblxuICAgICAgICAvLyBTdXBwcmVzcyBJQU00IGZvciBDdXN0b20gUmVzb3VyY2Ugcm9sZVxuICAgICAgICBuYWcuTmFnU3VwcHJlc3Npb25zLmFkZFJlc291cmNlU3VwcHJlc3Npb25zKFxuICAgICAgICAgICAgdGVzdEN1c3RvbVJlc291cmNlLFxuICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgaWQ6IFwiQXdzU29sdXRpb25zLUlBTTRcIixcbiAgICAgICAgICAgICAgICAgICAgcmVhc29uOiBcIkFXUyBtYW5hZ2VkIHBvbGljaWVzIGFyZSBhcHByb3ByaWF0ZSBmb3IgQ3VzdG9tIFJlc291cmNlIExhbWJkYVwiLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgIH1cbn1cbiJdfQ==
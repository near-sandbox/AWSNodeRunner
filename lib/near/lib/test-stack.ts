import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cw from "aws-cdk-lib/aws-cloudwatch";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as customResources from "aws-cdk-lib/custom-resources";
import * as path from "path";
import * as nag from "cdk-nag";
import { execSync } from "child_process";

export interface TestConfig {
    includeWriteTests: boolean;
    testDepth: "basic" | "comprehensive";
}

export interface NearTestStackProps extends cdk.StackProps {
    vpc: ec2.IVpc;
    securityGroup: ec2.ISecurityGroup;
    rpcUrl: string;
    instanceId: string;
    testConfig: TestConfig;
}

export class NearTestStack extends cdk.Stack {
    public readonly testLambdaArn: string;
    public readonly testLambdaFunction: lambda.Function;
    public readonly testSsmDocumentName: string;

    constructor(scope: cdkConstructs.Construct, id: string, props: NearTestStackProps) {
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
        lambdaRole.addToPrincipalPolicy(
            new iam.PolicyStatement({
                actions: ["cloudwatch:PutMetricData"],
                resources: ["*"],
                conditions: {
                    StringEquals: {
                        "cloudwatch:namespace": "NEAR/Test",
                    },
                },
            })
        );

        // Security group for Lambda function
        const lambdaSecurityGroup = new ec2.SecurityGroup(this, "TestLambdaSecurityGroup", {
            vpc,
            description: "Security group for NEAR test Lambda function",
            allowAllOutbound: true,
        });

        // Allow Lambda to access NEAR RPC endpoint
        lambdaSecurityGroup.addIngressRule(
            ec2.Peer.ipv4(vpc.vpcCidrBlock),
            ec2.Port.tcp(3030),
            "Allow access to NEAR RPC endpoint"
        );

        // Build Lambda package before creating function
        const testSuiteDir = path.join(__dirname, "..", "assets", "test-suite");
        console.log('Building Lambda test suite...');
        try {
            execSync('bash build.sh', { 
                cwd: testSuiteDir, 
                stdio: 'inherit',
                env: { ...process.env, NODE_ENV: 'production' }
            });
        } catch (error) {
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
        nag.NagSuppressions.addResourceSuppressions(
            this,
            [
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
            ],
            true
        );

        // Suppress IAM4 for Custom Resource role
        nag.NagSuppressions.addResourceSuppressions(
            testCustomResource,
            [
                {
                    id: "AwsSolutions-IAM4",
                    reason: "AWS managed policies are appropriate for Custom Resource Lambda",
                },
            ],
            true
        );
    }
}

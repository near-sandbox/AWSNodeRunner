import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { NearTestStack } from "../lib/test-stack";

describe("NearTestStack", () => {
    let app: cdk.App;
    let stack: NearTestStack;
    let vpc: ec2.Vpc;
    let securityGroup: ec2.SecurityGroup;

    beforeEach(() => {
        app = new cdk.App();
        const testStack = new cdk.Stack(app, "TestStack");
        
        // Create VPC and security group for testing
        vpc = new ec2.Vpc(testStack, "TestVpc", {
            maxAzs: 2,
        });
        
        securityGroup = new ec2.SecurityGroup(testStack, "TestSecurityGroup", {
            vpc,
            description: "Test security group",
        });
    });

    test("creates Lambda function with correct configuration", () => {
        stack = new NearTestStack(app, "NearTestStack", {
            vpc,
            securityGroup,
            rpcUrl: "http://10.0.0.1:3030",
            instanceId: "i-1234567890abcdef0",
            testConfig: {
                includeWriteTests: false,
                testDepth: "basic",
            },
        });

        const template = Template.fromStack(stack);

        // Check Lambda function exists
        template.hasResourceProperties("AWS::Lambda::Function", {
            FunctionName: "near-localnet-test",
            Runtime: "python3.11",
            Handler: "handler.lambda_handler",
            Timeout: 600, // 10 minutes
            MemorySize: 512,
            Environment: {
                Variables: {
                    RPC_URL: "http://10.0.0.1:3030",
                    NETWORK_ID: "localnet",
                    INCLUDE_WRITE_TESTS: "false",
                    TEST_DEPTH: "basic",
                },
            },
        });

        // Check Lambda is in VPC
        template.hasResourceProperties("AWS::Lambda::Function", {
            VpcConfig: {
                SubnetIds: Match.anyValue(),
                SecurityGroupIds: Match.anyValue(),
            },
        });
    });

    test("creates CloudWatch Log Group", () => {
        stack = new NearTestStack(app, "NearTestStack", {
            vpc,
            securityGroup,
            rpcUrl: "http://10.0.0.1:3030",
            instanceId: "i-1234567890abcdef0",
            testConfig: {
                includeWriteTests: false,
                testDepth: "basic",
            },
        });

        const template = Template.fromStack(stack);

        template.hasResourceProperties("AWS::Logs::LogGroup", {
            LogGroupName: "/aws/lambda/near-localnet-test",
            RetentionInDays: 7,
        });
    });

    test("creates SSM Document for test triggering", () => {
        stack = new NearTestStack(app, "NearTestStack", {
            vpc,
            securityGroup,
            rpcUrl: "http://10.0.0.1:3030",
            instanceId: "i-1234567890abcdef0",
            testConfig: {
                includeWriteTests: false,
                testDepth: "basic",
            },
        });

        const template = Template.fromStack(stack);

        template.hasResourceProperties("AWS::SSM::Document", {
            DocumentType: "Command",
            DocumentFormat: "YAML",
        });
    });

    test("creates CloudFormation Custom Resource for test execution", () => {
        stack = new NearTestStack(app, "NearTestStack", {
            vpc,
            securityGroup,
            rpcUrl: "http://10.0.0.1:3030",
            instanceId: "i-1234567890abcdef0",
            testConfig: {
                includeWriteTests: false,
                testDepth: "basic",
            },
        });

        const template = Template.fromStack(stack);

        // Check Custom Resource exists
        template.hasResourceProperties("AWS::CloudFormation::CustomResource", {
            ServiceToken: Match.anyValue(),
        });
    });

    test("creates CloudWatch Dashboard", () => {
        stack = new NearTestStack(app, "NearTestStack", {
            vpc,
            securityGroup,
            rpcUrl: "http://10.0.0.1:3030",
            instanceId: "i-1234567890abcdef0",
            testConfig: {
                includeWriteTests: false,
                testDepth: "basic",
            },
        });

        const template = Template.fromStack(stack);

        template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
            DashboardName: Match.stringLikeRegexp("near-localnet-test-.*"),
        });
    });

    test("configures write tests when enabled", () => {
        stack = new NearTestStack(app, "NearTestStack", {
            vpc,
            securityGroup,
            rpcUrl: "http://10.0.0.1:3030",
            instanceId: "i-1234567890abcdef0",
            testConfig: {
                includeWriteTests: true,
                testDepth: "comprehensive",
            },
        });

        const template = Template.fromStack(stack);

        template.hasResourceProperties("AWS::Lambda::Function", {
            Environment: {
                Variables: {
                    INCLUDE_WRITE_TESTS: "true",
                    TEST_DEPTH: "comprehensive",
                },
            },
        });
    });

    test("exports stack outputs", () => {
        stack = new NearTestStack(app, "NearTestStack", {
            vpc,
            securityGroup,
            rpcUrl: "http://10.0.0.1:3030",
            instanceId: "i-1234567890abcdef0",
            testConfig: {
                includeWriteTests: false,
                testDepth: "basic",
            },
        });

        const template = Template.fromStack(stack);

        // Check outputs exist
        template.hasOutput("TestLambdaArn", {
            ExportName: "NearLocalnetTestLambdaArn",
        });

        template.hasOutput("TestSsmDocumentName", {
            ExportName: "NearLocalnetTestSsmDocumentName",
        });

        template.hasOutput("TestLogGroup", {
            ExportName: "NearLocalnetTestLogGroup",
        });
    });

    test("creates IAM role with VPC permissions", () => {
        stack = new NearTestStack(app, "NearTestStack", {
            vpc,
            securityGroup,
            rpcUrl: "http://10.0.0.1:3030",
            instanceId: "i-1234567890abcdef0",
            testConfig: {
                includeWriteTests: false,
                testDepth: "basic",
            },
        });

        const template = Template.fromStack(stack);

        template.hasResourceProperties("AWS::IAM::Role", {
            ManagedPolicyArns: Match.arrayWith([
                Match.stringLikeRegexp(".*AWSLambdaVPCAccessExecutionRole.*"),
            ]),
        });
    });
});


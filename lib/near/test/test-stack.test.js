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
const cdk = __importStar(require("aws-cdk-lib"));
const assertions_1 = require("aws-cdk-lib/assertions");
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const test_stack_1 = require("../lib/test-stack");
describe("NearTestStack", () => {
    let app;
    let stack;
    let vpc;
    let securityGroup;
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
        stack = new test_stack_1.NearTestStack(app, "NearTestStack", {
            vpc,
            securityGroup,
            rpcUrl: "http://10.0.0.1:3030",
            instanceId: "i-1234567890abcdef0",
            testConfig: {
                includeWriteTests: false,
                testDepth: "basic",
            },
        });
        const template = assertions_1.Template.fromStack(stack);
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
                SubnetIds: assertions_1.Match.anyValue(),
                SecurityGroupIds: assertions_1.Match.anyValue(),
            },
        });
    });
    test("creates CloudWatch Log Group", () => {
        stack = new test_stack_1.NearTestStack(app, "NearTestStack", {
            vpc,
            securityGroup,
            rpcUrl: "http://10.0.0.1:3030",
            instanceId: "i-1234567890abcdef0",
            testConfig: {
                includeWriteTests: false,
                testDepth: "basic",
            },
        });
        const template = assertions_1.Template.fromStack(stack);
        template.hasResourceProperties("AWS::Logs::LogGroup", {
            LogGroupName: "/aws/lambda/near-localnet-test",
            RetentionInDays: 7,
        });
    });
    test("creates SSM Document for test triggering", () => {
        stack = new test_stack_1.NearTestStack(app, "NearTestStack", {
            vpc,
            securityGroup,
            rpcUrl: "http://10.0.0.1:3030",
            instanceId: "i-1234567890abcdef0",
            testConfig: {
                includeWriteTests: false,
                testDepth: "basic",
            },
        });
        const template = assertions_1.Template.fromStack(stack);
        template.hasResourceProperties("AWS::SSM::Document", {
            DocumentType: "Command",
            DocumentFormat: "YAML",
        });
    });
    test("creates CloudFormation Custom Resource for test execution", () => {
        stack = new test_stack_1.NearTestStack(app, "NearTestStack", {
            vpc,
            securityGroup,
            rpcUrl: "http://10.0.0.1:3030",
            instanceId: "i-1234567890abcdef0",
            testConfig: {
                includeWriteTests: false,
                testDepth: "basic",
            },
        });
        const template = assertions_1.Template.fromStack(stack);
        // Check Custom Resource exists
        template.hasResourceProperties("AWS::CloudFormation::CustomResource", {
            ServiceToken: assertions_1.Match.anyValue(),
        });
    });
    test("creates CloudWatch Dashboard", () => {
        stack = new test_stack_1.NearTestStack(app, "NearTestStack", {
            vpc,
            securityGroup,
            rpcUrl: "http://10.0.0.1:3030",
            instanceId: "i-1234567890abcdef0",
            testConfig: {
                includeWriteTests: false,
                testDepth: "basic",
            },
        });
        const template = assertions_1.Template.fromStack(stack);
        template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
            DashboardName: assertions_1.Match.stringLikeRegexp("near-localnet-test-.*"),
        });
    });
    test("configures write tests when enabled", () => {
        stack = new test_stack_1.NearTestStack(app, "NearTestStack", {
            vpc,
            securityGroup,
            rpcUrl: "http://10.0.0.1:3030",
            instanceId: "i-1234567890abcdef0",
            testConfig: {
                includeWriteTests: true,
                testDepth: "comprehensive",
            },
        });
        const template = assertions_1.Template.fromStack(stack);
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
        stack = new test_stack_1.NearTestStack(app, "NearTestStack", {
            vpc,
            securityGroup,
            rpcUrl: "http://10.0.0.1:3030",
            instanceId: "i-1234567890abcdef0",
            testConfig: {
                includeWriteTests: false,
                testDepth: "basic",
            },
        });
        const template = assertions_1.Template.fromStack(stack);
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
        stack = new test_stack_1.NearTestStack(app, "NearTestStack", {
            vpc,
            securityGroup,
            rpcUrl: "http://10.0.0.1:3030",
            instanceId: "i-1234567890abcdef0",
            testConfig: {
                includeWriteTests: false,
                testDepth: "basic",
            },
        });
        const template = assertions_1.Template.fromStack(stack);
        template.hasResourceProperties("AWS::IAM::Role", {
            ManagedPolicyArns: assertions_1.Match.arrayWith([
                assertions_1.Match.stringLikeRegexp(".*AWSLambdaVPCAccessExecutionRole.*"),
            ]),
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdC1zdGFjay50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidGVzdC1zdGFjay50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHVEQUF5RDtBQUN6RCx5REFBMkM7QUFDM0Msa0RBQWtEO0FBRWxELFFBQVEsQ0FBQyxlQUFlLEVBQUUsR0FBRyxFQUFFO0lBQzNCLElBQUksR0FBWSxDQUFDO0lBQ2pCLElBQUksS0FBb0IsQ0FBQztJQUN6QixJQUFJLEdBQVksQ0FBQztJQUNqQixJQUFJLGFBQWdDLENBQUM7SUFFckMsVUFBVSxDQUFDLEdBQUcsRUFBRTtRQUNaLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNwQixNQUFNLFNBQVMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBRWxELDRDQUE0QztRQUM1QyxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxTQUFTLEVBQUU7WUFDcEMsTUFBTSxFQUFFLENBQUM7U0FDWixDQUFDLENBQUM7UUFFSCxhQUFhLEdBQUcsSUFBSSxHQUFHLENBQUMsYUFBYSxDQUFDLFNBQVMsRUFBRSxtQkFBbUIsRUFBRTtZQUNsRSxHQUFHO1lBQ0gsV0FBVyxFQUFFLHFCQUFxQjtTQUNyQyxDQUFDLENBQUM7SUFDUCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxvREFBb0QsRUFBRSxHQUFHLEVBQUU7UUFDNUQsS0FBSyxHQUFHLElBQUksMEJBQWEsQ0FBQyxHQUFHLEVBQUUsZUFBZSxFQUFFO1lBQzVDLEdBQUc7WUFDSCxhQUFhO1lBQ2IsTUFBTSxFQUFFLHNCQUFzQjtZQUM5QixVQUFVLEVBQUUscUJBQXFCO1lBQ2pDLFVBQVUsRUFBRTtnQkFDUixpQkFBaUIsRUFBRSxLQUFLO2dC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Z0IsRUFBRTtZQUM3QyxpQkFBaUIsRUFBRSxrQkFBSyxDQUFDLFNBQVMsQ0FBQztnQkFDL0Isa0JBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxxQ0FBcUMsQ0FBQzthQUNoRSxDQUFDO1NBQ0wsQ0FBQyxDQUFDO0lBQ1AsQ0FBQyxDQUFDLENBQUM7QUFDUCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCB7IFRlbXBsYXRlLCBNYXRjaCB9IGZyb20gXCJhd3MtY2RrLWxpYi9hc3NlcnRpb25zXCI7XG5pbXBvcnQgKiBhcyBlYzIgZnJvbSBcImF3cy1jZGstbGliL2F3cy1lYzJcIjtcbmltcG9ydCB7IE5lYXJUZXN0U3RhY2sgfSBmcm9tIFwiLi4vbGliL3Rlc3Qtc3RhY2tcIjtcblxuZGVzY3JpYmUoXCJOZWFyVGVzdFN0YWNrXCIsICgpID0+IHtcbiAgICBsZXQgYXBwOiBjZGsuQXBwO1xuICAgIGxldCBzdGFjazogTmVhclRlc3RTdGFjaztcbiAgICBsZXQgdnBjOiBlYzIuVnBjO1xuICAgIGxldCBzZWN1cml0eUdyb3VwOiBlYzIuU2VjdXJpdHlHcm91cDtcblxuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgICBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuICAgICAgICBjb25zdCB0ZXN0U3RhY2sgPSBuZXcgY2RrLlN0YWNrKGFwcCwgXCJUZXN0U3RhY2tcIik7XG4gICAgICAgIFxuICAgICAgICAvLyBDcmVhdGUgVlBDIGFuZCBzZWN1cml0eSBncm91cCBmb3IgdGVzdGluZ1xuICAgICAgICB2cGMgPSBuZXcgZWMyLlZwYyh0ZXN0U3RhY2ssIFwiVGVzdFZwY1wiLCB7XG4gICAgICAgICAgICBtYXhBenM6IDIsXG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgc2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0ZXN0U3RhY2ssIFwiVGVzdFNlY3VyaXR5R3JvdXBcIiwge1xuICAgICAgICAgICAgdnBjLFxuICAgICAgICAgICAgZGVzY3JpcHRpb246IFwiVGVzdCBzZWN1cml0eSBncm91cFwiLFxuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoXCJjcmVhdGVzIExhbWJkYSBmdW5jdGlvbiB3aXRoIGNvcnJlY3QgY29uZmlndXJhdGlvblwiLCAoKSA9PiB7XG4gICAgICAgIHN0YWNrID0gbmV3IE5lYXJUZXN0U3RhY2soYXBwLCBcIk5lYXJUZXN0U3RhY2tcIiwge1xuICAgICAgICAgICAgdnBjLFxuICAgICAgICAgICAgc2VjdXJpdHlHcm91cCxcbiAgICAgICAgICAgIHJwY1VybDogXCJodHRwOi8vMTAuMC4wLjE6MzAzMFwiLFxuICAgICAgICAgICAgaW5zdGFuY2VJZDogXCJpLTEyMzQ1Njc4OTBhYmNkZWYwXCIsXG4gICAgICAgICAgICB0ZXN0Q29uZmlnOiB7XG4gICAgICAgICAgICAgICAgaW5jbHVkZVdyaXRlVGVzdHM6IGZhbHNlLFxuICAgICAgICAgICAgICAgIHRlc3REZXB0aDogXCJiYXNpY1wiLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spO1xuXG4gICAgICAgIC8vIENoZWNrIExhbWJkYSBmdW5jdGlvbiBleGlzdHNcbiAgICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpMYW1iZGE6OkZ1bmN0aW9uXCIsIHtcbiAgICAgICAgICAgIEZ1bmN0aW9uTmFtZTogXCJuZWFyLWxvY2FsbmV0LXRlc3RcIixcbiAgICAgICAgICAgIFJ1bnRpbWU6IFwicHl0aG9uMy4xMVwiLFxuICAgICAgICAgICAgSGFuZGxlcjogXCJoYW5kbGVyLmxhbWJkYV9oYW5kbGVyXCIsXG4gICAgICAgICAgICBUaW1lb3V0OiA2MDAsIC8vIDEwIG1pbnV0ZXNcbiAgICAgICAgICAgIE1lbW9yeVNpemU6IDUxMixcbiAgICAgICAgICAgIEVudmlyb25tZW50OiB7XG4gICAgICAgICAgICAgICAgVmFyaWFibGVzOiB7XG4gICAgICAgICAgICAgICAgICAgIFJQQ19VUkw6IFwiaHR0cDovLzEwLjAuMC4xOjMwMzBcIixcbiAgICAgICAgICAgICAgICAgICAgTkVUV09SS19JRDogXCJsb2NhbG5ldFwiLFxuICAgICAgICAgICAgICAgICAgICBJTkNMVURFX1dSSVRFX1RFU1RTOiBcImZhbHNlXCIsXG4gICAgICAgICAgICAgICAgICAgIFRFU1RfREVQVEg6IFwiYmFzaWNcIixcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gQ2hlY2sgTGFtYmRhIGlzIGluIFZQQ1xuICAgICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkxhbWJkYTo6RnVuY3Rpb25cIiwge1xuICAgICAgICAgICAgVnBjQ29uZmlnOiB7XG4gICAgICAgICAgICAgICAgU3VibmV0SWRzOiBNYXRjaC5hbnlWYWx1ZSgpLFxuICAgICAgICAgICAgICAgIFNlY3VyaXR5R3JvdXBJZHM6IE1hdGNoLmFueVZhbHVlKCksXG4gICAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoXCJjcmVhdGVzIENsb3VkV2F0Y2ggTG9nIEdyb3VwXCIsICgpID0+IHtcbiAgICAgICAgc3RhY2sgPSBuZXcgTmVhclRlc3RTdGFjayhhcHAsIFwiTmVhclRlc3RTdGFja1wiLCB7XG4gICAgICAgICAgICB2cGMsXG4gICAgICAgICAgICBzZWN1cml0eUdyb3VwLFxuICAgICAgICAgICAgcnBjVXJsOiBcImh0dHA6Ly8xMC4wLjAuMTozMDMwXCIsXG4gICAgICAgICAgICBpbnN0YW5jZUlkOiBcImktMTIzNDU2Nzg5MGFiY2RlZjBcIixcbiAgICAgICAgICAgIHRlc3RDb25maWc6IHtcbiAgICAgICAgICAgICAgICBpbmNsdWRlV3JpdGVUZXN0czogZmFsc2UsXG4gICAgICAgICAgICAgICAgdGVzdERlcHRoOiBcImJhc2ljXCIsXG4gICAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG5cbiAgICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpMb2dzOjpMb2dHcm91cFwiLCB7XG4gICAgICAgICAgICBMb2dHcm91cE5hbWU6IFwiL2F3cy9sYW1iZGEvbmVhci1sb2NhbG5ldC10ZXN0XCIsXG4gICAgICAgICAgICBSZXRlbnRpb25JbkRheXM6IDcsXG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdChcImNyZWF0ZXMgU1NNIERvY3VtZW50IGZvciB0ZXN0IHRyaWdnZXJpbmdcIiwgKCkgPT4ge1xuICAgICAgICBzdGFjayA9IG5ldyBOZWFyVGVzdFN0YWNrKGFwcCwgXCJOZWFyVGVzdFN0YWNrXCIsIHtcbiAgICAgICAgICAgIHZwYyxcbiAgICAgICAgICAgIHNlY3VyaXR5R3JvdXAsXG4gICAgICAgICAgICBycGNVcmw6IFwiaHR0cDovLzEwLjAuMC4xOjMwMzBcIixcbiAgICAgICAgICAgIGluc3RhbmNlSWQ6IFwiaS0xMjM0NTY3ODkwYWJjZGVmMFwiLFxuICAgICAgICAgICAgdGVzdENvbmZpZzoge1xuICAgICAgICAgICAgICAgIGluY2x1ZGVXcml0ZVRlc3RzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICB0ZXN0RGVwdGg6IFwiYmFzaWNcIixcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKTtcblxuICAgICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlNTTTo6RG9jdW1lbnRcIiwge1xuICAgICAgICAgICAgRG9jdW1lbnRUeXBlOiBcIkNvbW1hbmRcIixcbiAgICAgICAgICAgIERvY3VtZW50Rm9ybWF0OiBcIllBTUxcIixcbiAgICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KFwiY3JlYXRlcyBDbG91ZEZvcm1hdGlvbiBDdXN0b20gUmVzb3VyY2UgZm9yIHRlc3QgZXhlY3V0aW9uXCIsICgpID0+IHtcbiAgICAgICAgc3RhY2sgPSBuZXcgTmVhclRlc3RTdGFjayhhcHAsIFwiTmVhclRlc3RTdGFja1wiLCB7XG4gICAgICAgICAgICB2cGMsXG4gICAgICAgICAgICBzZWN1cml0eUdyb3VwLFxuICAgICAgICAgICAgcnBjVXJsOiBcImh0dHA6Ly8xMC4wLjAuMTozMDMwXCIsXG4gICAgICAgICAgICBpbnN0YW5jZUlkOiBcImktMTIzNDU2Nzg5MGFiY2RlZjBcIixcbiAgICAgICAgICAgIHRlc3RDb25maWc6IHtcbiAgICAgICAgICAgICAgICBpbmNsdWRlV3JpdGVUZXN0czogZmFsc2UsXG4gICAgICAgICAgICAgICAgdGVzdERlcHRoOiBcImJhc2ljXCIsXG4gICAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG5cbiAgICAgICAgLy8gQ2hlY2sgQ3VzdG9tIFJlc291cmNlIGV4aXN0c1xuICAgICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkNsb3VkRm9ybWF0aW9uOjpDdXN0b21SZXNvdXJjZVwiLCB7XG4gICAgICAgICAgICBTZXJ2aWNlVG9rZW46IE1hdGNoLmFueVZhbHVlKCksXG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdChcImNyZWF0ZXMgQ2xvdWRXYXRjaCBEYXNoYm9hcmRcIiwgKCkgPT4ge1xuICAgICAgICBzdGFjayA9IG5ldyBOZWFyVGVzdFN0YWNrKGFwcCwgXCJOZWFyVGVzdFN0YWNrXCIsIHtcbiAgICAgICAgICAgIHZwYyxcbiAgICAgICAgICAgIHNlY3VyaXR5R3JvdXAsXG4gICAgICAgICAgICBycGNVcmw6IFwiaHR0cDovLzEwLjAuMC4xOjMwMzBcIixcbiAgICAgICAgICAgIGluc3RhbmNlSWQ6IFwiaS0xMjM0NTY3ODkwYWJjZGVmMFwiLFxuICAgICAgICAgICAgdGVzdENvbmZpZzoge1xuICAgICAgICAgICAgICAgIGluY2x1ZGVXcml0ZVRlc3RzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICB0ZXN0RGVwdGg6IFwiYmFzaWNcIixcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKTtcblxuICAgICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkNsb3VkV2F0Y2g6OkRhc2hib2FyZFwiLCB7XG4gICAgICAgICAgICBEYXNoYm9hcmROYW1lOiBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKFwibmVhci1sb2NhbG5ldC10ZXN0LS4qXCIpLFxuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoXCJjb25maWd1cmVzIHdyaXRlIHRlc3RzIHdoZW4gZW5hYmxlZFwiLCAoKSA9PiB7XG4gICAgICAgIHN0YWNrID0gbmV3IE5lYXJUZXN0U3RhY2soYXBwLCBcIk5lYXJUZXN0U3RhY2tcIiwge1xuICAgICAgICAgICAgdnBjLFxuICAgICAgICAgICAgc2VjdXJpdHlHcm91cCxcbiAgICAgICAgICAgIHJwY1VybDogXCJodHRwOi8vMTAuMC4wLjE6MzAzMFwiLFxuICAgICAgICAgICAgaW5zdGFuY2VJZDogXCJpLTEyMzQ1Njc4OTBhYmNkZWYwXCIsXG4gICAgICAgICAgICB0ZXN0Q29uZmlnOiB7XG4gICAgICAgICAgICAgICAgaW5jbHVkZVdyaXRlVGVzdHM6IHRydWUsXG4gICAgICAgICAgICAgICAgdGVzdERlcHRoOiBcImNvbXByZWhlbnNpdmVcIixcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKTtcblxuICAgICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkxhbWJkYTo6RnVuY3Rpb25cIiwge1xuICAgICAgICAgICAgRW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICAgICAgICBWYXJpYWJsZXM6IHtcbiAgICAgICAgICAgICAgICAgICAgSU5DTFVERV9XUklURV9URVNUUzogXCJ0cnVlXCIsXG4gICAgICAgICAgICAgICAgICAgIFRFU1RfREVQVEg6IFwiY29tcHJlaGVuc2l2ZVwiLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoXCJleHBvcnRzIHN0YWNrIG91dHB1dHNcIiwgKCkgPT4ge1xuICAgICAgICBzdGFjayA9IG5ldyBOZWFyVGVzdFN0YWNrKGFwcCwgXCJOZWFyVGVzdFN0YWNrXCIsIHtcbiAgICAgICAgICAgIHZwYyxcbiAgICAgICAgICAgIHNlY3VyaXR5R3JvdXAsXG4gICAgICAgICAgICBycGNVcmw6IFwiaHR0cDovLzEwLjAuMC4xOjMwMzBcIixcbiAgICAgICAgICAgIGluc3RhbmNlSWQ6IFwiaS0xMjM0NTY3ODkwYWJjZGVmMFwiLFxuICAgICAgICAgICAgdGVzdENvbmZpZzoge1xuICAgICAgICAgICAgICAgIGluY2x1ZGVXcml0ZVRlc3RzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICB0ZXN0RGVwdGg6IFwiYmFzaWNcIixcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKTtcblxuICAgICAgICAvLyBDaGVjayBvdXRwdXRzIGV4aXN0XG4gICAgICAgIHRlbXBsYXRlLmhhc091dHB1dChcIlRlc3RMYW1iZGFBcm5cIiwge1xuICAgICAgICAgICAgRXhwb3J0TmFtZTogXCJOZWFyTG9jYWxuZXRUZXN0TGFtYmRhQXJuXCIsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRlbXBsYXRlLmhhc091dHB1dChcIlRlc3RTc21Eb2N1bWVudE5hbWVcIiwge1xuICAgICAgICAgICAgRXhwb3J0TmFtZTogXCJOZWFyTG9jYWxuZXRUZXN0U3NtRG9jdW1lbnROYW1lXCIsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRlbXBsYXRlLmhhc091dHB1dChcIlRlc3RMb2dHcm91cFwiLCB7XG4gICAgICAgICAgICBFeHBvcnROYW1lOiBcIk5lYXJMb2NhbG5ldFRlc3RMb2dHcm91cFwiLFxuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoXCJjcmVhdGVzIElBTSByb2xlIHdpdGggVlBDIHBlcm1pc3Npb25zXCIsICgpID0+IHtcbiAgICAgICAgc3RhY2sgPSBuZXcgTmVhclRlc3RTdGFjayhhcHAsIFwiTmVhclRlc3RTdGFja1wiLCB7XG4gICAgICAgICAgICB2cGMsXG4gICAgICAgICAgICBzZWN1cml0eUdyb3VwLFxuICAgICAgICAgICAgcnBjVXJsOiBcImh0dHA6Ly8xMC4wLjAuMTozMDMwXCIsXG4gICAgICAgICAgICBpbnN0YW5jZUlkOiBcImktMTIzNDU2Nzg5MGFiY2RlZjBcIixcbiAgICAgICAgICAgIHRlc3RDb25maWc6IHtcbiAgICAgICAgICAgICAgICBpbmNsdWRlV3JpdGVUZXN0czogZmFsc2UsXG4gICAgICAgICAgICAgICAgdGVzdERlcHRoOiBcImJhc2ljXCIsXG4gICAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG5cbiAgICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpJQU06OlJvbGVcIiwge1xuICAgICAgICAgICAgTWFuYWdlZFBvbGljeUFybnM6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgICAgICAgTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cChcIi4qQVdTTGFtYmRhVlBDQWNjZXNzRXhlY3V0aW9uUm9sZS4qXCIpLFxuICAgICAgICAgICAgXSksXG4gICAgICAgIH0pO1xuICAgIH0pO1xufSk7XG5cbiJdfQ==
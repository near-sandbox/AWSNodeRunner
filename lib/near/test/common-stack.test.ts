import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { NearCommonStack } from "../lib/common-stack";

describe("NearCommonStack", () => {
    let app: cdk.App;
    let stack: NearCommonStack;

    beforeEach(() => {
        app = new cdk.App();
        stack = new NearCommonStack(app, "TestStack", {
            env: { account: "123456789012", region: "us-east-1" },
        });
    });

    test("creates VPC with 2 AZs", () => {
        const template = Template.fromStack(stack);
        template.hasResourceProperties("AWS::EC2::VPC", {
            EnableDnsHostnames: true,
            EnableDnsSupport: true,
        });
    });

    test("creates security group", () => {
        const template = Template.fromStack(stack);
        template.hasResourceProperties("AWS::EC2::SecurityGroup", {
            GroupDescription: "NEAR localnet node security group",
        });
    });

    test("creates IAM role for EC2", () => {
        const template = Template.fromStack(stack);
        template.hasResourceProperties("AWS::IAM::Role", {
            AssumeRolePolicyDocument: {
                Statement: [
                    {
                        Action: "sts:AssumeRole",
                        Effect: "Allow",
                        Principal: {
                            Service: "ec2.amazonaws.com",
                        },
                    },
                ],
            },
        });
    });

    test("exports instance role ARN", () => {
        const template = Template.fromStack(stack);
        template.hasOutput("InstanceRoleArn", {
            Export: {
                Name: "NearNodeInstanceRoleArn",
            },
        });
    });

    test("exports VPC ID", () => {
        const template = Template.fromStack(stack);
        template.hasOutput("VpcId", {
            Export: {
                Name: "NearVpcId",
            },
        });
    });

    test("exports security group ID", () => {
        const template = Template.fromStack(stack);
        template.hasOutput("SecurityGroupId", {
            Export: {
                Name: "NearSecurityGroupId",
            },
        });
    });
});


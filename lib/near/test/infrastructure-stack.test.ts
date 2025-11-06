import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { NearInfrastructureStack } from "../lib/infrastructure-stack";
import * as configTypes from "../lib/config/node-config.interface";

describe("NearInfrastructureStack", () => {
    let app: cdk.App;
    let stack: NearInfrastructureStack;

    beforeEach(() => {
        app = new cdk.App();
        
        // First create a common stack to export values
        const commonStack = new cdk.Stack(app, "CommonStack", {
            env: { account: "123456789012", region: "us-east-1" },
        });
        
        // Create mock exports
        new cdk.CfnOutput(commonStack, "NearVpcId", {
            value: "vpc-12345",
            exportName: "NearVpcId",
        });
        
        new cdk.CfnOutput(commonStack, "NearSecurityGroupId", {
            value: "sg-12345",
            exportName: "NearSecurityGroupId",
        });
        
        new cdk.CfnOutput(commonStack, "NearNodeInstanceRoleArn", {
            value: "arn:aws:iam::123456789012:role/test-role",
            exportName: "NearNodeInstanceRoleArn",
        });

        const props: configTypes.NearBaseNodeConfig = {
            instanceType: "t3.large",
            instanceCpuType: "x86_64",
            nearNetwork: "localnet",
            nearVersion: "2.2.0",
            dataVolume: {
                sizeGiB: 30,
                type: "gp3",
            },
            limitOutTrafficMbps: 1000,
        };

        stack = new NearInfrastructureStack(app, "TestStack", {
            ...props,
            env: { account: "123456789012", region: "us-east-1" },
        });
    });

    test("creates EC2 instance", () => {
        const template = Template.fromStack(stack);
        template.hasResourceProperties("AWS::EC2::Instance", {
            InstanceType: "t3.large",
        });
    });

    test("exports instance ID", () => {
        const template = Template.fromStack(stack);
        template.hasOutput("near-instance-id", {
            Export: {
                Name: "NearInstanceId",
            },
        });
    });

    test("exports instance private IP", () => {
        const template = Template.fromStack(stack);
        template.hasOutput("near-instance-private-ip", {
            Export: {
                Name: "NearInstancePrivateIp",
            },
        });
    });
});


import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { NearCommonStack } from "../lib/common-stack";
import { NearInfrastructureStack } from "../lib/infrastructure-stack";
import * as configTypes from "../lib/config/node-config.interface";

describe("NearInfrastructureStack", () => {
    let app: cdk.App;
    let stack: NearInfrastructureStack;

    beforeEach(() => {
        app = new cdk.App();
        
        const commonStack = new NearCommonStack(app, "TestCommonStack", {
            env: { account: "123456789012", region: "us-east-1" },
        });

        const props: configTypes.NearBaseNodeConfig = {
            instanceType: "t3.large",
            instanceCpuType: "x86_64",
            nearNetwork: "localnet",
            nearVersion: "2.10.1",
            dataVolume: {
                sizeGiB: 30,
                type: "gp3",
            },
            limitOutTrafficMbps: 1000,
        };

        stack = new NearInfrastructureStack(app, "TestStack", {
            ...props,
            vpc: commonStack.vpc,
            securityGroup: commonStack.securityGroup,
            instanceRole: commonStack.instanceRole,
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
                Name: "NearLocalnetInstanceId",
            },
        });
    });

    test("exports instance private IP", () => {
        const template = Template.fromStack(stack);
        template.hasOutput("near-instance-private-ip", {
            Export: {
                Name: "NearLocalnetInstancePrivateIp",
            },
        });
    });
});


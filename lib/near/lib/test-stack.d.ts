import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as ec2 from "aws-cdk-lib/aws-ec2";
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
export declare class NearTestStack extends cdk.Stack {
    readonly testLambdaArn: string;
    readonly testLambdaFunction: lambda.Function;
    readonly testSsmDocumentName: string;
    constructor(scope: cdkConstructs.Construct, id: string, props: NearTestStackProps);
}

import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as configTypes from "./config/node-config.interface";
export interface NearInfrastructureStackProps extends cdk.StackProps {
    instanceType: string;
    instanceCpuType: "x86_64" | "arm64";
    nearNetwork: configTypes.NearNetwork;
    nearVersion: string;
    dataVolume: configTypes.NearDataVolumeConfig;
    limitOutTrafficMbps: number;
    vpc?: ec2.IVpc;
    securityGroup?: ec2.ISecurityGroup;
    instanceRole?: iam.IRole;
}
export declare class NearInfrastructureStack extends cdk.Stack {
    readonly instanceId: string;
    readonly instance: ec2.Instance;
    readonly instanceRole: iam.IRole;
    readonly vpc: ec2.IVpc;
    readonly securityGroup: ec2.ISecurityGroup;
    constructor(scope: cdkConstructs.Construct, id: string, props: NearInfrastructureStackProps);
}

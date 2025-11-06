import * as cdk from "aws-cdk-lib";
import * as constructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
export interface NearCommonStackProps extends cdk.StackProps {
}
export declare class NearCommonStack extends cdk.Stack {
    readonly vpc: ec2.Vpc;
    readonly securityGroup: ec2.SecurityGroup;
    readonly instanceRole: iam.Role;
    constructor(scope: constructs.Construct, id: string, props: NearCommonStackProps);
}

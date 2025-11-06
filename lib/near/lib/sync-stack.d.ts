import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as configTypes from "./config/node-config.interface";
export interface NearSyncStackProps extends cdk.StackProps {
    nearNetwork: configTypes.NearNetwork;
    nearVersion: string;
}
export declare class NearSyncStack extends cdk.Stack {
    readonly syncStatus: string;
    readonly rpcUrl: string;
    constructor(scope: cdkConstructs.Construct, id: string, props: NearSyncStackProps);
}

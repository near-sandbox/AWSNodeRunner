import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as configTypes from "./config/node-config.interface";
export interface NearInstallStackProps extends cdk.StackProps {
    nearNetwork: configTypes.NearNetwork;
    nearVersion: string;
}
export declare class NearInstallStack extends cdk.Stack {
    readonly installStatus: string;
    constructor(scope: cdkConstructs.Construct, id: string, props: NearInstallStackProps);
}

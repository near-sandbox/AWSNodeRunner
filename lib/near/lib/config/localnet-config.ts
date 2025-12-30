import * as configTypes from "./node-config.interface";

export const localnetConfig: configTypes.NearBaseNodeConfig = {
    // Use a larger non-burstable instance to reduce nearcore cold-compile time.
    instanceType: "m7a.2xlarge",
    instanceCpuType: "x86_64",
    nearNetwork: "localnet",
    nearVersion: "2.10.1",
    dataVolume: {
        sizeGiB: 30,
        type: "gp3",
    },
    limitOutTrafficMbps: 1000,
    rpcPort: 3030,
};

export const baseConfig: configTypes.NearBaseConfig = {
    accountId: process.env.AWS_ACCOUNT_ID || "311843862895",
    region: process.env.AWS_REGION || "us-east-1",
    nearNetwork: (process.env.NEAR_NETWORK || "localnet") as configTypes.NearNetwork,
    nearVersion: process.env.NEAR_VERSION || "2.10.1",
};


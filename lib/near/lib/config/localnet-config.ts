import * as configTypes from "./node-config.interface";

export const localnetConfig: configTypes.NearBaseNodeConfig = {
    instanceType: "t3.large",
    instanceCpuType: "x86_64",
    nearNetwork: "localnet",
    nearVersion: "2.2.0",
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
    nearVersion: process.env.NEAR_VERSION || "2.2.0",
};


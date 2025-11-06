export type NearNetwork = "mainnet" | "testnet" | "betanet" | "localnet";

export interface NearDataVolumeConfig {
    sizeGiB: number;
    type: "gp3" | "io2" | "io1";
    iops?: number;
    throughput?: number;
}

export interface NearBaseConfig {
    accountId: string;
    region: string;
    nearNetwork: NearNetwork;
    nearVersion: string;
}

export interface NearBaseNodeConfig {
    nearNetwork: NearNetwork;
    nearVersion: string;
    dataVolume: NearDataVolumeConfig;
    limitOutTrafficMbps: number;
    instanceType: string;
    instanceCpuType: "x86_64" | "arm64";
    rpcPort?: number;
}


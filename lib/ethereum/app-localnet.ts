#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { EthereumLocalnetStack } from "./lib/localnet-stack";

const app = new cdk.App();

// Configuration for localnet deployment
const config = {
  account: process.env.CDK_DEFAULT_ACCOUNT || "311843862895",
  region: process.env.CDK_DEFAULT_REGION || "us-east-1",
  vpcId: "vpc-0ad7ab6659e0293ae", // Existing NEAR VPC
  instanceType: "t3.medium",
  devMode: true, // Enable Geth --dev mode
};

new EthereumLocalnetStack(app, "EthereumLocalnetStack", {
  stackName: "ethereum-localnet",
  env: { account: config.account, region: config.region },
  vpcId: config.vpcId,
  instanceType: config.instanceType,
  devMode: config.devMode,
});

cdk.Tags.of(app).add("Project", "NearCrossChainSimulator");
cdk.Tags.of(app).add("Component", "EthereumLocalnet");


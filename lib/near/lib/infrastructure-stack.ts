import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as nag from "cdk-nag";
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

export class NearInfrastructureStack extends cdk.Stack {
    public readonly instanceId: string;
    public readonly instance: ec2.Instance;
    public readonly instanceRole: iam.IRole;
    public readonly vpc: ec2.IVpc;
    public readonly securityGroup: ec2.ISecurityGroup;

    constructor(scope: cdkConstructs.Construct, id: string, props: NearInfrastructureStackProps) {
        super(scope, id, props);

        const REGION = cdk.Stack.of(this).region;
        const STACK_NAME = cdk.Stack.of(this).stackName;
        const STACK_ID = cdk.Stack.of(this).stackId;

        const {
            instanceType,
            instanceCpuType,
            nearNetwork,
            nearVersion,
            dataVolume,
            vpc,
            securityGroup,
            instanceRole,
        } = props;

        // Use provided VPC/security group/role or import from common stack
        if (vpc && securityGroup && instanceRole) {
            this.vpc = vpc;
            this.securityGroup = securityGroup;
            this.instanceRole = instanceRole;
        } else {
            // Fallback to imports (for cross-stack references when stacks are in different apps)
            const vpcId = cdk.Fn.importValue("NearLocalnetVpcId");
            const securityGroupId = cdk.Fn.importValue("NearLocalnetSecurityGroupId");
            const importedInstanceRoleArn = cdk.Fn.importValue("NearLocalnetInstanceRoleArn");
            
            // Note: Vpc.fromLookup requires environment context and won't work with imported values
            // This fallback is for reference but should use direct references in app.ts
            throw new Error("VPC, security group, and instance role must be provided directly when stacks are in the same app");
        }

        // Ubuntu 24.04 LTS image for amd64 (x86_64 required for NEAR)
        let ubuntuStableImageSsmName = "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id";
        if (instanceCpuType === "arm64") {
            ubuntuStableImageSsmName = "/aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id";
        }
        const machineImage = ec2.MachineImage.fromSsmParameter(ubuntuStableImageSsmName);

        // Parse instance type - CDK expects InstanceClass enum and InstanceSize enum
        // "t3.large" -> InstanceClass.T3, InstanceSize.LARGE
        const [instanceClassStr, instanceSizeStr] = instanceType.toLowerCase().split(".");
        // Convert "t3" -> "T3" for InstanceClass enum
        const instanceClass = (instanceClassStr.charAt(0).toUpperCase() + instanceClassStr.slice(1)).toUpperCase() as ec2.InstanceClass;
        const instanceSize = instanceSizeStr.toUpperCase() as ec2.InstanceSize;
        const ec2InstanceType = new ec2.InstanceType(`${instanceClassStr}.${instanceSizeStr}`);

        // UserData script following the working implementation from chain-mobil/cdk
        // This compiles and runs neard on Ubuntu per NEAR's recommendations
        // Modified to add localnet root account to genesis for .localnet naming parity
        // Force replacement: 2025-12-30T05:35:00Z
        const userData = ec2.UserData.forLinux();
        userData.addCommands(
            '#!/bin/bash',
            'set -e',
            'exec > >(tee /var/log/near-setup.log) 2>&1',
            '',
            '# Update system',
            'apt update',
            '',
            '# Install dependencies for NEAR compilation (Ubuntu packages)',
            'apt install -y git binutils-dev libcurl4-openssl-dev zlib1g-dev libdw-dev libiberty-dev cmake gcc g++ python3 python3-pip protobuf-compiler libssl-dev pkg-config clang llvm jq awscli',
            '',
            '# Install Rust as ubuntu user',
            'su - ubuntu -c "curl --proto =https --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y"',
            'su - ubuntu -c "source ~/.cargo/env && rustc --version"',
            '',
            '# Clone nearcore',
            'su - ubuntu -c "cd ~ && git clone https://github.com/near/nearcore.git"',
            `su - ubuntu -c "cd ~/nearcore && git checkout ${nearVersion}"`,
            '',
            '# Compile neard (takes ~10-15 minutes)',
            'su - ubuntu -c "cd ~/nearcore && source ~/.cargo/env && make neard"',
            '',
            '# Install nearup (Ubuntu 24.04 requires --break-system-packages)',
            'su - ubuntu -c "pip3 install --user --break-system-packages nearup"',
            '',
            '# Run nearup localnet with compiled binary (creates genesis.json)',
            'su - ubuntu -c "export PATH=$PATH:~/.local/bin && nearup run localnet --binary-path ~/nearcore/target/release" > /var/log/nearup.log 2>&1 &',
            '',
            '# Wait for genesis.json to be created by nearup',
            'echo "Waiting for genesis.json to be created..."',
            'for i in {1..60}; do',
            '  if [ -f /home/ubuntu/.near/localnet/node0/genesis.json ]; then',
            '    echo "Genesis file found"',
            '    break',
            '  fi',
            '  sleep 2',
            'done',
            '',
            '# Generate localnet keypair using neard',
            'echo "Generating localnet keypair..."',
            'su - ubuntu -c "cd ~/nearcore/target/release && ./neard --home ~/.near/localnet/node0 generate-key localnet"',
            '',
            '# Extract public and secret keys from generated key file',
            '# neard generate-key creates a file named {account_id}_key.json in the home directory',
            'LOCALNET_KEY_FILE="/home/ubuntu/.near/localnet/node0/localnet_key.json"',
            '',
            '# Try to read the key file, if it doesn\'t exist, list all key files to debug',
            'if [ ! -f "$LOCALNET_KEY_FILE" ]; then',
            '  echo "Key file not found at expected location, listing key files..."',
            '  su - ubuntu -c "ls -la ~/.near/localnet/node0/*.json || true"',
            '  # Try to find any key file with localnet in the name',
            '  LOCALNET_KEY_FILE=$(su - ubuntu -c "find ~/.near/localnet/node0 -name \"*localnet*.json\" -type f | head -1" 2>/dev/null || echo "")',
            'fi',
            '',
            'if [ -f "$LOCALNET_KEY_FILE" ]; then',
            '  LOCALNET_PUBLIC_KEY=$(su - ubuntu -c "cat $LOCALNET_KEY_FILE | jq -r \'.public_key\'" 2>/dev/null || echo "")',
            '  LOCALNET_SECRET_KEY=$(su - ubuntu -c "cat $LOCALNET_KEY_FILE | jq -r \'.secret_key\'" 2>/dev/null || echo "")',
            'else',
            '  echo "ERROR: Could not find localnet key file after generation"',
            '  LOCALNET_PUBLIC_KEY=""',
            '  LOCALNET_SECRET_KEY=""',
            'fi',
            '',
            '# Modify genesis.json to add localnet root account',
            'echo "Modifying genesis.json to add localnet account..."',
            'GENESIS_PATH="/home/ubuntu/.near/localnet/node0/genesis.json"',
            'AMOUNT="100000000000000000000000000000"  # 100,000 NEAR',
            '',
            '# Backup genesis',
            'su - ubuntu -c "cp $GENESIS_PATH ${GENESIS_PATH}.backup"',
            '',
            '# Add localnet account and access key to genesis using jq',
            'su - ubuntu -c "jq --arg pubkey \\"$LOCALNET_PUBLIC_KEY\\" --arg amount \\"$AMOUNT\\" \'',
            '  .records += [{',
            '    "Account": {',
            '      "account_id": "localnet",',
            '      "account": {',
            '        "amount": $amount,',
            '        "locked": "0",',
            '        "code_hash": "11111111111111111111111111111111",',
            '        "storage_usage": 182,',
            '        "version": "V1"',
            '      }',
            '    }',
            '  }] |',
            '  .records += [{',
            '    "AccessKey": {',
            '      "account_id": "localnet",',
            '      "public_key": $pubkey,',
            '      "access_key": {',
            '        "nonce": 0,',
            '        "permission": "FullAccess"',
            '      }',
            '    }',
            '  }]',
            '\' $GENESIS_PATH > /tmp/genesis_new.json"',
            '',
            '# Replace genesis for all nodes',
            'for node in node0 node1 node2 node3; do',
            '  if [ -d /home/ubuntu/.near/localnet/$node ]; then',
            '    su - ubuntu -c "cp /tmp/genesis_new.json /home/ubuntu/.near/localnet/$node/genesis.json"',
            '    echo "Updated genesis for $node"',
            '  fi',
            'done',
            '',
            '# Store localnet keypair in SSM Parameter Store',
            'echo "Storing localnet keypair in SSM..."',
            'if [ -n "$LOCALNET_SECRET_KEY" ] && [ "$LOCALNET_SECRET_KEY" != "null" ]; then',
            '  AWS_REGION=$(curl -s http://169.254.169.254/latest/meta-data/placement/region)',
            '  aws ssm put-parameter --name "/near-localnet/localnet-account-key" --value "$LOCALNET_SECRET_KEY" --type "SecureString" --overwrite --region "$AWS_REGION" || true',
            '  aws ssm put-parameter --name "/near-localnet/localnet-account-id" --value "localnet" --type "String" --overwrite --region "$AWS_REGION" || true',
            '  echo "Localnet keypair stored in SSM"',
            'else',
            '  echo "WARNING: Could not extract localnet secret key"',
            'fi',
            '',
            '# Restart nearup with modified genesis',
            'echo "Restarting nearup with modified genesis..."',
            'su - ubuntu -c "pkill -f nearup || true"',
            'sleep 5',
            'su - ubuntu -c "export PATH=$PATH:~/.local/bin && nearup run localnet --binary-path ~/nearcore/target/release" > /var/log/nearup.log 2>&1 &',
            '',
            '# Wait for NEAR to initialize',
            'sleep 60',
            '',
            'echo "NEAR localnet initialization complete with localnet root account" > /var/log/near-init-complete.log'
        );

        // Create EC2 instance (following working chain-mobil implementation)
        // Changed ID to force replacement when version updates
        this.instance = new ec2.Instance(this, `NearLocalnetNodeV${nearVersion.replace(/\./g, "")}`, {
            vpc: this.vpc,
            instanceType: ec2InstanceType,
            machineImage,
            securityGroup: this.securityGroup,
            role: this.instanceRole,
            userData, // Set UserData directly (following working chain-mobil implementation)
            vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC }, // For outbound internet (download Rust, nearcore)
            ssmSessionPermissions: true, // Enable SSM Session Manager
            // Increase root volume size for Rust compilation (default 8GB is too small)
            blockDevices: [{
                deviceName: "/dev/sda1", // Ubuntu root device
                volume: ec2.BlockDeviceVolume.ebs(dataVolume.sizeGiB, {
                    volumeType: ec2.EbsDeviceVolumeType.GP3,
                    deleteOnTermination: true,
                }),
            }],
        });

        // Store the logical ID for cfn-signal
        const nodeCFLogicalId = this.instance.node.defaultChild?.node.id || "NearLocalnetNode";

        // Add version tag to force replacement when version changes
        cdk.Tags.of(this.instance).add("NearVersion", nearVersion);

        this.instanceId = this.instance.instanceId;

        // Stack outputs
        new cdk.CfnOutput(this, "near-instance-id", {
            value: this.instanceId,
            exportName: "NearLocalnetInstanceId",
        });

        new cdk.CfnOutput(this, "near-instance-private-ip", {
            value: this.instance.instancePrivateIp,
            exportName: "NearLocalnetInstancePrivateIp",
        });

        new cdk.CfnOutput(this, "near-instance-public-ip", {
            value: this.instance.instancePublicIp || "N/A",
            exportName: "NearLocalnetInstancePublicIp",
        });

        // Adding suppressions to the stack
        nag.NagSuppressions.addResourceSuppressions(
            this,
            [
                {
                    id: "AwsSolutions-EC23",
                    reason: "SSH access needed for debugging, RPC restricted to VPC",
                },
                {
                    id: "AwsSolutions-EC26",
                    reason: "EBS encryption not required for localnet development environment",
                },
                {
                    id: "AwsSolutions-EC28",
                    reason: "Detailed monitoring not required for localnet development environment",
                },
                {
                    id: "AwsSolutions-EC29",
                    reason: "Termination protection not required for localnet development environment",
                },
            ],
            true
        );
    }
}


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
            '# Force replacement timestamp: 2025-12-30T05:35:00Z',
            '',
            '# Update system',
            'apt update',
            '',
            '# Install dependencies for NEAR compilation (Ubuntu packages)',
            // NOTE: Ubuntu 24.04 no longer provides an `awscli` apt candidate in some images/repos.
            // Install AWS CLI via pip below.
            'apt install -y git binutils-dev libcurl4-openssl-dev zlib1g-dev libdw-dev libiberty-dev cmake gcc g++ python3 python3-pip protobuf-compiler libssl-dev pkg-config clang llvm jq',
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
            '# Install AWS CLI (required for writing SSM parameters during bootstrap)',
            'pip3 install --break-system-packages awscli',
            'aws --version || true',
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
            '# Stop nearup and all neard processes before patching genesis',
            'echo "Stopping nearup and neard processes..."',
            // Stop any running nearup/neard processes before patching genesis.
            // Run as root to avoid permission issues (nearup is started via a root-owned su wrapper).
            'pkill -f nearup || true',
            'pkill -f neard || true',
            'sleep 5',
            '',
            '# Generate localnet keypair using neard init (works in neard 2.10.1)',
            'echo "Generating localnet keypair using neard init..."',
            'su - ubuntu -c "rm -rf ~/.near/localnet-keygen && mkdir -p ~/.near/localnet-keygen"',
            'su - ubuntu -c "~/nearcore/target/release/neard --home ~/.near/localnet-keygen init --account-id localnet --chain-id localnet --fast"',
            '',
            '# Extract public and secret keys from validator_key.json',
            'LOCALNET_KEY_FILE="/home/ubuntu/.near/localnet-keygen/validator_key.json"',
            'if [ ! -f "$LOCALNET_KEY_FILE" ]; then',
            '  echo "ERROR: validator_key.json not found after neard init"',
            '  exit 1',
            'fi',
            'LOCALNET_PUBLIC_KEY=$(su - ubuntu -c "cat $LOCALNET_KEY_FILE | jq -r \'.public_key\'" 2>/dev/null || echo "")',
            'LOCALNET_SECRET_KEY=$(su - ubuntu -c "cat $LOCALNET_KEY_FILE | jq -r \'.secret_key\'" 2>/dev/null || echo "")',
            '',
            'if [ -z "$LOCALNET_PUBLIC_KEY" ] || [ -z "$LOCALNET_SECRET_KEY" ] || [ "$LOCALNET_PUBLIC_KEY" = "null" ] || [ "$LOCALNET_SECRET_KEY" = "null" ]; then',
            '  echo "ERROR: Could not extract localnet keys from validator_key.json"',
            '  exit 1',
            'fi',
            '',
            '# Create Python script for genesis patching with reallocation',
            'cat > /tmp/patch-genesis-localnet.py << \'PYEOF\'',
            '#!/usr/bin/env python3',
            'import json',
            'import sys',
            '',
            'if len(sys.argv) != 5:',
            '    print("Usage: patch-genesis-localnet.py <genesis.json> <public_key> <transfer_amount> <output.json>")',
            '    sys.exit(1)',
            '',
            'genesis_path = sys.argv[1]',
            'public_key = sys.argv[2]',
            'transfer_amount = sys.argv[3]',
            'output_path = sys.argv[4]',
            '',
            'with open(genesis_path, \'r\') as f:',
            '    genesis = json.load(f)',
            '',
            '# Find node0 Account record and subtract transfer_amount',
            'node0_found = False',
            'for record in genesis.get(\'records\', []):',
            '    if \'Account\' in record:',
            '        account = record[\'Account\']',
            '        if account.get(\'account_id\') == \'node0\':',
            '            node0_found = True',
            '            current_amount = int(account[\'account\'][\'amount\'])',
            '            new_amount = current_amount - int(transfer_amount)',
            '            if new_amount < 0:',
            '                print(f"ERROR: node0 balance ({current_amount}) insufficient for transfer ({transfer_amount})")',
            '                sys.exit(1)',
            '            account[\'account\'][\'amount\'] = str(new_amount)',
            '            print(f"Reallocated {transfer_amount} yoctoNEAR from node0 (new balance: {new_amount})")',
            '            break',
            '',
            'if not node0_found:',
            '    print("ERROR: node0 Account record not found in genesis")',
            '    sys.exit(1)',
            '',
            '# Add localnet Account record',
            'localnet_account_record = {',
            '    "Account": {',
            '        "account_id": "localnet",',
            '        "account": {',
            '            "amount": transfer_amount,',
            '            "locked": "0",',
            '            "code_hash": "11111111111111111111111111111111",',
            '            "storage_usage": 182,',
            '            "version": "V1"',
            '        }',
            '    }',
            '}',
            'genesis[\'records\'].append(localnet_account_record)',
            '',
            '# Add localnet AccessKey record',
            'localnet_access_key_record = {',
            '    "AccessKey": {',
            '        "account_id": "localnet",',
            '        "public_key": public_key,',
            '        "access_key": {',
            '            "nonce": 0,',
            '            "permission": "FullAccess"',
            '        }',
            '    }',
            '}',
            'genesis[\'records\'].append(localnet_access_key_record)',
            '',
            'with open(output_path, \'w\') as f:',
            '    json.dump(genesis, f, indent=2)',
            '',
            'print(f"Genesis patched successfully: {output_path}")',
            'PYEOF',
            'chmod +x /tmp/patch-genesis-localnet.py',
            '',
            '# Patch genesis.json with reallocation from node0',
            'echo "Patching genesis.json with localnet account (reallocating from node0)..."',
            'GENESIS_PATH="/home/ubuntu/.near/localnet/node0/genesis.json"',
            'AMOUNT="100000000000000000000000000000"  # 100,000 NEAR',
            '',
            '# Backup genesis',
            'su - ubuntu -c "cp $GENESIS_PATH ${GENESIS_PATH}.backup.$(date +%s)"',
            '',
            '# Run Python script to patch genesis',
            'python3 /tmp/patch-genesis-localnet.py "$GENESIS_PATH" "$LOCALNET_PUBLIC_KEY" "$AMOUNT" /tmp/genesis_patched.json',
            '',
            '# Replace genesis for all nodes',
            'for node in node0 node1 node2 node3; do',
            '  if [ -d /home/ubuntu/.near/localnet/$node ]; then',
            '    su - ubuntu -c "cp /tmp/genesis_patched.json /home/ubuntu/.near/localnet/$node/genesis.json"',
            '    echo "Updated genesis for $node"',
            '  fi',
            'done',
            '',
            '# Remove node data directories so nodes start cleanly with patched genesis',
            'echo "Removing node data directories for clean start..."',
            'for node in node0 node1 node2 node3; do',
            '  if [ -d /home/ubuntu/.near/localnet/$node/data ]; then',
            '    su - ubuntu -c "rm -rf /home/ubuntu/.near/localnet/$node/data"',
            '    echo "Removed data directory for $node"',
            '  fi',
            'done',
            '',
            '# Store localnet keypair in SSM Parameter Store',
            'echo "Storing localnet keypair in SSM..."',
            '# IMDSv2-safe region discovery',
            'TOKEN=$(curl -sS -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" || true)',
            'if [ -n "$TOKEN" ]; then',
            '  AWS_REGION=$(curl -sS -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/placement/region)',
            'else',
            '  AWS_REGION=$(curl -sS http://169.254.169.254/latest/meta-data/placement/region)',
            'fi',
            'aws ssm put-parameter --name "/near-localnet/localnet-account-key" --value "$LOCALNET_SECRET_KEY" --type "SecureString" --overwrite --region "$AWS_REGION" || true',
            'aws ssm put-parameter --name "/near-localnet/localnet-account-id" --value "localnet" --type "String" --overwrite --region "$AWS_REGION" || true',
            'echo "Localnet keypair stored in SSM"',
            '',
            '# Start neard processes directly (not via nearup)',
            'echo "Starting neard processes with patched genesis..."',
            '# Get node0 boot node public key',
            'BOOT_PUB=$(su - ubuntu -c "cat ~/.near/localnet/node0/node_key.json | jq -r \'.public_key\'")',
            '# Get private IP for external P2P access (GOTCHA #6.5: MPC nodes need to peer with NEAR Base)',
            'PRIVATE_IP=$(curl -s http://169.254.169.254/latest/meta-data/local-ipv4)',
            'BOOT_NODE="${BOOT_PUB}@${PRIVATE_IP}:24567"',
            'echo "Boot node configured: $BOOT_NODE"',
            '',
            '# Start node0 with --network-addr to bind P2P to all interfaces (not just localhost)',
            '# This allows MPC nodes in the VPC to establish P2P connections',
            'su - ubuntu -c "nohup ~/nearcore/target/release/neard --home ~/.near/localnet/node0 run --network-addr 0.0.0.0:24567 > ~/neard-node0.log 2>&1 &"',
            'sleep 2',
            '',
            '# Start node1, node2, node3 with boot node',
            'for i in 1 2 3; do',
            '  su - ubuntu -c "nohup ~/nearcore/target/release/neard --home ~/.near/localnet/node$i run --boot-nodes $BOOT_NODE > ~/neard-node$i.log 2>&1 &"',
            'done',
            '',
            '# Wait for nodes to initialize',
            'sleep 10',
            '',
            '# Validation: Check RPC status',
            'echo "Validating NEAR node startup..."',
            'for i in {1..30}; do',
            '  if curl -sS http://127.0.0.1:3030/status > /dev/null 2>&1; then',
            '    echo "RPC endpoint responding"',
            '    break',
            '  fi',
            '  if [ $i -eq 30 ]; then',
            '    echo "WARNING: RPC endpoint not responding after 30 attempts"',
            '  fi',
            '  sleep 2',
            'done',
            '',
            '# Validation: Verify localnet account exists in genesis',
            'if grep -q "\\"account_id\\": \\"localnet\\"" /home/ubuntu/.near/localnet/node0/genesis.json; then',
            '  echo "✅ Genesis contains localnet account"',
            'else',
            '  echo "❌ ERROR: Genesis does not contain localnet account"',
            '  exit 1',
            'fi',
            '',
            'echo "NEAR localnet initialization complete with localnet root account" > /var/log/near-init-complete.log'
        );

        // Create EC2 instance (following working chain-mobil implementation)
        // Changed ID to force replacement when version updates
        // Added timestamp suffix to force new instance creation for genesis modification
        this.instance = new ec2.Instance(this, `NearLocalnetNodeV${nearVersion.replace(/\./g, "")}Localnet`, {
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


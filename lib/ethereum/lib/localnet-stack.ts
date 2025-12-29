import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface EthereumLocalnetStackProps extends cdk.StackProps {
  readonly vpcId: string;
  readonly instanceType: string;
  readonly devMode: boolean;
}

export class EthereumLocalnetStack extends cdk.Stack {
  public readonly rpcUrl: string;
  public readonly instanceId: string;

  constructor(scope: Construct, id: string, props: EthereumLocalnetStackProps) {
    super(scope, id, props);

    // Use existing VPC
    const vpc = ec2.Vpc.fromLookup(this, "ExistingVpc", {
      vpcId: props.vpcId,
    });

    // Security group for Geth
    const securityGroup = new ec2.SecurityGroup(this, "GethSecurityGroup", {
      vpc,
      description: "Geth localnet security group",
      allowAllOutbound: true,
    });

    // Allow JSON-RPC from VPC
    securityGroup.addIngressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(8545),
      "Allow JSON-RPC from VPC"
    );

    // Allow WebSocket from VPC
    securityGroup.addIngressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(8546),
      "Allow WebSocket from VPC"
    );

    // Allow SSH for debugging
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      "SSH access"
    );

    // IAM role for SSM
    const role = new iam.Role(this, "GethInstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore"
        ),
      ],
    });

    // EC2 instance
    const instance = new ec2.Instance(this, "GethInstance", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: new ec2.InstanceType(props.instanceType),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      securityGroup,
      role,
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: ec2.BlockDeviceVolume.ebs(50, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            deleteOnTermination: true,
          }),
        },
      ],
    });

    // UserData: Install Geth in dev mode
    instance.userData.addCommands(
      "#!/bin/bash",
      "set -e",
      "exec > >(tee /var/log/geth-setup.log) 2>&1",
      "",
      "echo 'Installing dependencies...'",
      "sudo yum update -y",
      "sudo yum install -y git make gcc wget",
      "",
      "echo 'Installing Go...'",
      "wget https://go.dev/dl/go1.21.5.linux-amd64.tar.gz",
      "sudo tar -C /usr/local -xzf go1.21.5.linux-amd64.tar.gz",
      "export PATH=$PATH:/usr/local/go/bin",
      "echo 'export PATH=$PATH:/usr/local/go/bin' >> /home/ec2-user/.bashrc",
      "",
      "echo 'Cloning Geth...'",
      "cd /home/ec2-user",
      "sudo -u ec2-user git clone https://github.com/ethereum/go-ethereum.git",
      "cd go-ethereum",
      "sudo -u ec2-user git checkout v1.13.5",
      "",
      "echo 'Building Geth...'",
      "sudo -u ec2-user /usr/local/go/bin/go run build/ci.go install ./cmd/geth",
      "",
      "echo 'Creating systemd service...'",
      "sudo tee /etc/systemd/system/geth.service > /dev/null <<'EOF'",
      "[Unit]",
      "Description=Geth Ethereum Localnet",
      "After=network.target",
      "",
      "[Service]",
      "Type=simple",
      "User=ec2-user",
      "WorkingDirectory=/home/ec2-user/go-ethereum",
      "ExecStart=/home/ec2-user/go-ethereum/build/bin/geth --dev \\",
      "  --http --http.addr 0.0.0.0 --http.port 8545 \\",
      "  --http.api eth,net,web3,debug,txpool,personal \\",
      "  --http.corsdomain '*' \\",
      "  --http.vhosts '*' \\",
      "  --ws --ws.addr 0.0.0.0 --ws.port 8546 \\",
      "  --ws.api eth,net,web3,debug,txpool \\",
      "  --ws.origins '*' \\",
      "  --allow-insecure-unlock \\",
      "  --dev.period 1 \\",
      "  --datadir /home/ec2-user/geth-data",
      "Restart=always",
      "RestartSec=10",
      "StandardOutput=journal",
      "StandardError=journal",
      "",
      "[Install]",
      "WantedBy=multi-user.target",
      "EOF",
      "",
      "echo 'Starting Geth service...'",
      "sudo systemctl daemon-reload",
      "sudo systemctl enable geth",
      "sudo systemctl start geth",
      "",
      "echo 'Waiting for Geth to start...'",
      "sleep 10",
      "",
      "echo 'Verifying Geth is running...'",
      "curl -X POST http://127.0.0.1:8545 \\",
      "  -H 'Content-Type: application/json' \\",
      "  -d '{\"jsonrpc\":\"2.0\",\"method\":\"eth_blockNumber\",\"params\":[],\"id\":1}'",
      "",
      "echo 'Geth localnet setup complete!'"
    );

    // Outputs
    this.rpcUrl = `http://${instance.instancePrivateIp}:8545`;
    this.instanceId = instance.instanceId;

    new cdk.CfnOutput(this, "GethRpcUrl", {
      value: this.rpcUrl,
      description: "Geth JSON-RPC endpoint",
      exportName: "GethLocalnetRpcUrl",
    });

    new cdk.CfnOutput(this, "GethWsUrl", {
      value: `ws://${instance.instancePrivateIp}:8546`,
      description: "Geth WebSocket endpoint",
      exportName: "GethLocalnetWsUrl",
    });

    new cdk.CfnOutput(this, "GethInstanceId", {
      value: this.instanceId,
      description: "Geth EC2 instance ID",
      exportName: "GethLocalnetInstanceId",
    });

    new cdk.CfnOutput(this, "GethPrivateIp", {
      value: instance.instancePrivateIp,
      description: "Geth private IP",
      exportName: "GethLocalnetPrivateIp",
    });

    new cdk.CfnOutput(this, "GethChainId", {
      value: "1337",
      description: "Geth chain ID (dev mode)",
      exportName: "GethLocalnetChainId",
    });
  }
}


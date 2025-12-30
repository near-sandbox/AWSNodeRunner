import * as cdk from "aws-cdk-lib";
import * as constructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as nag from "cdk-nag";

export interface NearCommonStackProps extends cdk.StackProps {}

export class NearCommonStack extends cdk.Stack {
    public readonly vpc: ec2.Vpc;
    public readonly securityGroup: ec2.SecurityGroup;
    public readonly instanceRole: iam.Role;

    constructor(scope: constructs.Construct, id: string, props: NearCommonStackProps) {
        super(scope, id, props);

        // VPC for NEAR Node
        this.vpc = new ec2.Vpc(this, "NearVpc", {
            maxAzs: 2,
            natGateways: 1, // For instance internet access (Rust, nearcore downloads)
        });

        // VPC Endpoints for SSM (required for SSM agent to register)
        this.vpc.addInterfaceEndpoint("SSMEndpoint", {
            service: ec2.InterfaceVpcEndpointAwsService.SSM,
            privateDnsEnabled: true,
        });

        this.vpc.addInterfaceEndpoint("SSMMessagesEndpoint", {
            service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
            privateDnsEnabled: true,
        });

        this.vpc.addInterfaceEndpoint("EC2MessagesEndpoint", {
            service: ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
            privateDnsEnabled: true,
        });

        // Security Group for NEAR Localnet Node
        this.securityGroup = new ec2.SecurityGroup(this, "NearNodeSecurityGroup", {
            vpc: this.vpc,
            description: "NEAR localnet node security group",
            allowAllOutbound: true,
        });

        // Allow VPC access to NEAR RPC on port 3030
        this.securityGroup.addIngressRule(
            ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
            ec2.Port.tcp(3030),
            "Allow NEAR RPC from within VPC"
        );

        // Allow VPC access to NEAR P2P ports (needed for MPC node indexers to peer).
        // NOTE: nearup localnet uses a port per node: 24567, 24568, 24569, 24570 (for 4 nodes).
        this.securityGroup.addIngressRule(
            ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
            ec2.Port.tcpRange(24567, 24570),
            "Allow NEAR P2P from within VPC"
        );

        // Allow SSH for debugging
        this.securityGroup.addIngressRule(
            ec2.Peer.anyIpv4(),
            ec2.Port.tcp(22),
            "SSH access for debugging"
        );

        // IAM role for EC2 instance with SSM permissions
        this.instanceRole = new iam.Role(this, "NearNodeRole", {
            assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"), // Enables SSM agent
            ],
        });

        // Allow CloudFormation signal
        this.instanceRole.addToPolicy(
            new iam.PolicyStatement({
                resources: ["*"],
                actions: ["cloudformation:SignalResource"],
            })
        );

        // Allow SSM parameter write for storing localnet keypair
        this.instanceRole.addToPolicy(
            new iam.PolicyStatement({
                resources: [
                    `arn:aws:ssm:${this.region}:${this.account}:parameter/near-localnet/localnet-account-key`,
                    `arn:aws:ssm:${this.region}:${this.account}:parameter/near-localnet/localnet-account-id`,
                ],
                actions: [
                    "ssm:PutParameter",
                    "ssm:GetParameter",
                ],
            })
        );

        // Export instance role ARN for use in other stacks
        new cdk.CfnOutput(this, "InstanceRoleArn", {
            value: this.instanceRole.roleArn,
            exportName: "NearLocalnetInstanceRoleArn",
        });

        // Export VPC ID
        new cdk.CfnOutput(this, "VpcId", {
            value: this.vpc.vpcId,
            exportName: "NearLocalnetVpcId",
        });

        // Export Security Group ID
        new cdk.CfnOutput(this, "SecurityGroupId", {
            value: this.securityGroup.securityGroupId,
            exportName: "NearLocalnetSecurityGroupId",
        });

        nag.NagSuppressions.addResourceSuppressions(
            this,
            [
                {
                    id: "AwsSolutions-IAM4",
                    reason: "Amazon managed policies used are restrictive enough",
                },
                {
                    id: "AwsSolutions-IAM5",
                    reason: "Wildcard resources required for cloudformation signal",
                },
                {
                    id: "AwsSolutions-EC23",
                    reason: "SSH access needed for debugging, RPC restricted to VPC",
                },
                {
                    id: "AwsSolutions-VPC7",
                    reason: "VPC Flow Logs not required for localnet development environment",
                },
            ],
            true
        );
    }
}


"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.NearCommonStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const nag = __importStar(require("cdk-nag"));
class NearCommonStack extends cdk.Stack {
    constructor(scope, id, props) {
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
        this.securityGroup.addIngressRule(ec2.Peer.ipv4(this.vpc.vpcCidrBlock), ec2.Port.tcp(3030), "Allow NEAR RPC from within VPC");
        // Allow VPC access to NEAR P2P ports (needed for MPC node indexers to peer).
        // NOTE: nearup localnet uses a port per node: 24567, 24568, 24569, 24570 (for 4 nodes).
        this.securityGroup.addIngressRule(ec2.Peer.ipv4(this.vpc.vpcCidrBlock), ec2.Port.tcpRange(24567, 24570), "Allow NEAR P2P from within VPC");
        // Allow SSH for debugging
        this.securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), "SSH access for debugging");
        // IAM role for EC2 instance with SSM permissions
        this.instanceRole = new iam.Role(this, "NearNodeRole", {
            assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"), // Enables SSM agent
            ],
        });
        // Allow CloudFormation signal
        this.instanceRole.addToPolicy(new iam.PolicyStatement({
            resources: ["*"],
            actions: ["cloudformation:SignalResource"],
        }));
        // Allow SSM parameter write for storing localnet keypair
        this.instanceRole.addToPolicy(new iam.PolicyStatement({
            resources: [
                `arn:aws:ssm:${this.region}:${this.account}:parameter/near-localnet/localnet-account-key`,
                `arn:aws:ssm:${this.region}:${this.account}:parameter/near-localnet/localnet-account-id`,
            ],
            actions: [
                "ssm:PutParameter",
                "ssm:GetParameter",
            ],
        }));
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
        nag.NagSuppressions.addResourceSuppressions(this, [
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
        ], true);
    }
}
exports.NearCommonStack = NearCommonStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbW9uLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY29tbW9uLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUVuQyx5REFBMkM7QUFDM0MseURBQTJDO0FBQzNDLDZDQUErQjtBQUkvQixNQUFhLGVBQWdCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFLMUMsWUFBWSxLQUEyQixFQUFFLEVBQVUsRUFBRSxLQUEyQjtRQUM1RSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixvQkFBb0I7UUFDcEIsSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRTtZQUNwQyxNQUFNLEVBQUUsQ0FBQztZQUNULFdBQVcsRUFBRSxDQUFDLEVBQUUsMERBQTBEO1NBQzdFLENBQUMsQ0FBQztRQUVILDZEQUE2RDtRQUM3RCxJQUFJLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLGFBQWEsRUFBRTtZQUN6QyxPQUFPLEVBQUUsR0FBRyxDQUFDLDhCQUE4QixDQUFDLEdBQUc7WUFDL0MsaUJBQWlCLEVBQUUsSUFBSTtTQUMxQixDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLHFCQUFxQixFQUFFO1lBQ2pELE9BQU8sRUFBRSxHQUFHLENBQUMsOEJBQThCLENBQUMsWUFBWTtZQUN4RCxpQkFBaUIsRUFBRSxJQUFJO1NBQzFCLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMscUJBQXFCLEVBQUU7WUFDakQsT0FBTyxFQUFFLEdBQUcsQ0FBQyw4QkFBOEIsQ0FBQyxZQUFZO1lBQ3hELGlCQUFpQixFQUFFLElBQUk7U0FDMUIsQ0FBQyxDQUFDO1FBRUgsd0NBQXdDO1FBQ3hDLElBQUks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QUFlLENBQUMsdUJBQXVCLENBQ3ZDLElBQUksRUFDSjtZQUNJO2dCQUNJLEVBQUUsRUFBRSxtQkFBbUI7Z0JBQ3ZCLE1BQU0sRUFBRSxxREFBcUQ7YUFDaEU7WUFDRDtnQkFDSSxFQUFFLEVBQUUsbUJBQW1CO2dCQUN2QixNQUFNLEVBQUUsdURBQXVEO2FBQ2xFO1lBQ0Q7Z0JBQ0ksRUFBRSxFQUFFLG1CQUFtQjtnQkFDdkIsTUFBTSxFQUFFLHdEQUF3RDthQUNuRTtZQUNEO2dCQUNJLEVBQUUsRUFBRSxtQkFBbUI7Z0JBQ3ZCLE1BQU0sRUFBRSxpRUFBaUU7YUFDNUU7U0FDSixFQUNELElBQUksQ0FDUCxDQUFDO0lBQ04sQ0FBQztDQUNKO0FBbElELDBDQWtJQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCAqIGFzIGNvbnN0cnVjdHMgZnJvbSBcImNvbnN0cnVjdHNcIjtcbmltcG9ydCAqIGFzIGVjMiBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWVjMlwiO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtaWFtXCI7XG5pbXBvcnQgKiBhcyBuYWcgZnJvbSBcImNkay1uYWdcIjtcblxuZXhwb3J0IGludGVyZmFjZSBOZWFyQ29tbW9uU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHt9XG5cbmV4cG9ydCBjbGFzcyBOZWFyQ29tbW9uU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICAgIHB1YmxpYyByZWFkb25seSB2cGM6IGVjMi5WcGM7XG4gICAgcHVibGljIHJlYWRvbmx5IHNlY3VyaXR5R3JvdXA6IGVjMi5TZWN1cml0eUdyb3VwO1xuICAgIHB1YmxpYyByZWFkb25seSBpbnN0YW5jZVJvbGU6IGlhbS5Sb2xlO1xuXG4gICAgY29uc3RydWN0b3Ioc2NvcGU6IGNvbnN0cnVjdHMuQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogTmVhckNvbW1vblN0YWNrUHJvcHMpIHtcbiAgICAgICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAgICAgLy8gVlBDIGZvciBORUFSIE5vZGVcbiAgICAgICAgdGhpcy52cGMgPSBuZXcgZWMyLlZwYyh0aGlzLCBcIk5lYXJWcGNcIiwge1xuICAgICAgICAgICAgbWF4QXpzOiAyLFxuICAgICAgICAgICAgbmF0R2F0ZXdheXM6IDEsIC8vIEZvciBpbnN0YW5jZSBpbnRlcm5ldCBhY2Nlc3MgKFJ1c3QsIG5lYXJjb3JlIGRvd25sb2FkcylcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gVlBDIEVuZHBvaW50cyBmb3IgU1NNIChyZXF1aXJlZCBmb3IgU1NNIGFnZW50IHRvIHJlZ2lzdGVyKVxuICAgICAgICB0aGlzLnZwYy5hZGRJbnRlcmZhY2VFbmRwb2ludChcIlNTTUVuZHBvaW50XCIsIHtcbiAgICAgICAgICAgIHNlcnZpY2U6IGVjMi5JbnRlcmZhY2VWcGNFbmRwb2ludEF3c1NlcnZpY2UuU1NNLFxuICAgICAgICAgICAgcHJpdmF0ZURuc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMudnBjLmFkZEludGVyZmFjZUVuZHBvaW50KFwiU1NNTWVzc2FnZXNFbmRwb2ludFwiLCB7XG4gICAgICAgICAgICBzZXJ2aWNlOiBlYzIuSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLlNTTV9NRVNTQUdFUyxcbiAgICAgICAgICAgIHByaXZhdGVEbnNFbmFibGVkOiB0cnVlLFxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLnZwYy5hZGRJbnRlcmZhY2VFbmRwb2ludChcIkVDMk1lc3NhZ2VzRW5kcG9pbnRcIiwge1xuICAgICAgICAgICAgc2VydmljZTogZWMyLkludGVyZmFjZVZwY0VuZHBvaW50QXdzU2VydmljZS5FQzJfTUVTU0FHRVMsXG4gICAgICAgICAgICBwcml2YXRlRG5zRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gU2VjdXJpdHkgR3JvdXAgZm9yIE5FQVIgTG9jYWxuZXQgTm9kZVxuICAgICAgICB0aGlzLnNlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgXCJOZWFyTm9kZVNlY3VyaXR5R3JvdXBcIiwge1xuICAgICAgICAgICAgdnBjOiB0aGlzLnZwYyxcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBcIk5FQVIgbG9jYWxuZXQgbm9kZSBzZWN1cml0eSBncm91cFwiLFxuICAgICAgICAgICAgYWxsb3dBbGxPdXRib3VuZDogdHJ1ZSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gQWxsb3cgVlBDIGFjY2VzcyB0byBORUFSIFJQQyBvbiBwb3J0IDMwMzBcbiAgICAgICAgdGhpcy5zZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgICAgICAgZWMyLlBlZXIuaXB2NCh0aGlzLnZwYy52cGNDaWRyQmxvY2spLFxuICAgICAgICAgICAgZWMyLlBvcnQudGNwKDMwMzApLFxuICAgICAgICAgICAgXCJBbGxvdyBORUFSIFJQQyBmcm9tIHdpdGhpbiBWUENcIlxuICAgICAgICApO1xuXG4gICAgICAgIC8vIEFsbG93IFZQQyBhY2Nlc3MgdG8gTkVBUiBQMlAgcG9ydHMgKG5lZWRlZCBmb3IgTVBDIG5vZGUgaW5kZXhlcnMgdG8gcGVlcikuXG4gICAgICAgIC8vIE5PVEU6IG5lYXJ1cCBsb2NhbG5ldCB1c2VzIGEgcG9ydCBwZXIgbm9kZTogMjQ1NjcsIDI0NTY4LCAyNDU2OSwgMjQ1NzAgKGZvciA0IG5vZGVzKS5cbiAgICAgICAgdGhpcy5zZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgICAgICAgZWMyLlBlZXIuaXB2NCh0aGlzLnZwYy52cGNDaWRyQmxvY2spLFxuICAgICAgICAgICAgZWMyLlBvcnQudGNwUmFuZ2UoMjQ1NjcsIDI0NTcwKSxcbiAgICAgICAgICAgIFwiQWxsb3cgTkVBUiBQMlAgZnJvbSB3aXRoaW4gVlBDXCJcbiAgICAgICAgKTtcblxuICAgICAgICAvLyBBbGxvdyBTU0ggZm9yIGRlYnVnZ2luZ1xuICAgICAgICB0aGlzLnNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICAgICAgICBlYzIuUGVlci5hbnlJcHY0KCksXG4gICAgICAgICAgICBlYzIuUG9ydC50Y3AoMjIpLFxuICAgICAgICAgICAgXCJTU0ggYWNjZXNzIGZvciBkZWJ1Z2dpbmdcIlxuICAgICAgICApO1xuXG4gICAgICAgIC8vIElBTSByb2xlIGZvciBFQzIgaW5zdGFuY2Ugd2l0aCBTU00gcGVybWlzc2lvbnNcbiAgICAgICAgdGhpcy5pbnN0YW5jZVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgXCJOZWFyTm9kZVJvbGVcIiwge1xuICAgICAgICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoXCJlYzIuYW1hem9uYXdzLmNvbVwiKSxcbiAgICAgICAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICAgICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZShcIkFtYXpvblNTTU1hbmFnZWRJbnN0YW5jZUNvcmVcIiksIC8vIEVuYWJsZXMgU1NNIGFnZW50XG4gICAgICAgICAgICBdLFxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBBbGxvdyBDbG91ZEZvcm1hdGlvbiBzaWduYWxcbiAgICAgICAgdGhpcy5pbnN0YW5jZVJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXCIqXCJdLFxuICAgICAgICAgICAgICAgIGFjdGlvbnM6IFtcImNsb3VkZm9ybWF0aW9uOlNpZ25hbFJlc291cmNlXCJdLFxuICAgICAgICAgICAgfSlcbiAgICAgICAgKTtcblxuICAgICAgICAvLyBBbGxvdyBTU00gcGFyYW1ldGVyIHdyaXRlIGZvciBzdG9yaW5nIGxvY2FsbmV0IGtleXBhaXJcbiAgICAgICAgdGhpcy5pbnN0YW5jZVJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICAgICAgICAgIGBhcm46YXdzOnNzbToke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06cGFyYW1ldGVyL25lYXItbG9jYWxuZXQvbG9jYWxuZXQtYWNjb3VudC1rZXlgLFxuICAgICAgICAgICAgICAgICAgICBgYXJuOmF3czpzc206JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnBhcmFtZXRlci9uZWFyLWxvY2FsbmV0L2xvY2FsbmV0LWFjY291bnQtaWRgLFxuICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICAgICBcInNzbTpQdXRQYXJhbWV0ZXJcIixcbiAgICAgICAgICAgICAgICAgICAgXCJzc206R2V0UGFyYW1ldGVyXCIsXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0pXG4gICAgICAgICk7XG5cbiAgICAgICAgLy8gRXhwb3J0IGluc3RhbmNlIHJvbGUgQVJOIGZvciB1c2UgaW4gb3RoZXIgc3RhY2tzXG4gICAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiSW5zdGFuY2VSb2xlQXJuXCIsIHtcbiAgICAgICAgICAgIHZhbHVlOiB0aGlzLmluc3RhbmNlUm9sZS5yb2xlQXJuLFxuICAgICAgICAgICAgZXhwb3J0TmFtZTogXCJOZWFyTG9jYWxuZXRJbnN0YW5jZVJvbGVBcm5cIixcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gRXhwb3J0IFZQQyBJRFxuICAgICAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIlZwY0lkXCIsIHtcbiAgICAgICAgICAgIHZhbHVlOiB0aGlzLnZwYy52cGNJZCxcbiAgICAgICAgICAgIGV4cG9ydE5hbWU6IFwiTmVhckxvY2FsbmV0VnBjSWRcIixcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gRXhwb3J0IFNlY3VyaXR5IEdyb3VwIElEXG4gICAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiU2VjdXJpdHlHcm91cElkXCIsIHtcbiAgICAgICAgICAgIHZhbHVlOiB0aGlzLnNlY3VyaXR5R3JvdXAuc2VjdXJpdHlHcm91cElkLFxuICAgICAgICAgICAgZXhwb3J0TmFtZTogXCJOZWFyTG9jYWxuZXRTZWN1cml0eUdyb3VwSWRcIixcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbmFnLk5hZ1N1cHByZXNzaW9ucy5hZGRSZXNvdXJjZVN1cHByZXNzaW9ucyhcbiAgICAgICAgICAgIHRoaXMsXG4gICAgICAgICAgICBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBpZDogXCJBd3NTb2x1dGlvbnMtSUFNNFwiLFxuICAgICAgICAgICAgICAgICAgICByZWFzb246IFwiQW1hem9uIG1hbmFnZWQgcG9saWNpZXMgdXNlZCBhcmUgcmVzdHJpY3RpdmUgZW5vdWdoXCIsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGlkOiBcIkF3c1NvbHV0aW9ucy1JQU01XCIsXG4gICAgICAgICAgICAgICAgICAgIHJlYXNvbjogXCJXaWxkY2FyZCByZXNvdXJjZXMgcmVxdWlyZWQgZm9yIGNsb3VkZm9ybWF0aW9uIHNpZ25hbFwiLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBpZDogXCJBd3NTb2x1dGlvbnMtRUMyM1wiLFxuICAgICAgICAgICAgICAgICAgICByZWFzb246IFwiU1NIIGFjY2VzcyBuZWVkZWQgZm9yIGRlYnVnZ2luZywgUlBDIHJlc3RyaWN0ZWQgdG8gVlBDXCIsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGlkOiBcIkF3c1NvbHV0aW9ucy1WUEM3XCIsXG4gICAgICAgICAgICAgICAgICAgIHJlYXNvbjogXCJWUEMgRmxvdyBMb2dzIG5vdCByZXF1aXJlZCBmb3IgbG9jYWxuZXQgZGV2ZWxvcG1lbnQgZW52aXJvbm1lbnRcIixcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcbiAgICB9XG59XG5cbiJdfQ==
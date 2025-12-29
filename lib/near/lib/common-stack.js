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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbW9uLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY29tbW9uLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUVuQyx5REFBMkM7QUFDM0MseURBQTJDO0FBQzNDLDZDQUErQjtBQUkvQixNQUFhLGVBQWdCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFLMUMsWUFBWSxLQUEyQixFQUFFLEVBQVUsRUFBRSxLQUEyQjtRQUM1RSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixvQkFBb0I7UUFDcEIsSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRTtZQUNwQyxNQUFNLEVBQUUsQ0FBQztZQUNULFdBQVcsRUFBRSxDQUFDLEVBQUUsMERBQTBEO1NBQzdFLENBQUMsQ0FBQztRQUVILDZEQUE2RDtRQUM3RCxJQUFJLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLGFBQWEsRUFBRTtZQUN6QyxPQUFPLEVBQUUsR0FBRyxDQUFDLDhCQUE4QixDQUFDLEdBQUc7WUFDL0MsaUJBQWlCLEVBQUUsSUFBSTtTQUMxQixDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLHFCQUFxQixFQUFFO1lBQ2pELE9BQU8sRUFBRSxHQUFHLENBQUMsOEJBQThCLENBQUMsWUFBWTtZQUN4RCxpQkFBaUIsRUFBRSxJQUFJO1NBQzFCLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMscUJBQXFCLEVBQUU7WUFDakQsT0FBTyxFQUFFLEdBQUcsQ0FBQyw4QkFBOEIsQ0FBQyxZQUFZO1lBQ3hELGlCQUFpQixFQUFFLElBQUk7U0FDMUIsQ0FBQyxDQUFDO1FBRUgsd0NBQXdDO1FBQ3hDLElBQUks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Q0QsSUFBSSxDQUNQLENBQUM7SUFDTixDQUFDO0NBQ0o7QUFwSEQsMENBb0hDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0ICogYXMgY29uc3RydWN0cyBmcm9tIFwiY29uc3RydWN0c1wiO1xuaW1wb3J0ICogYXMgZWMyIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtZWMyXCI7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1pYW1cIjtcbmltcG9ydCAqIGFzIG5hZyBmcm9tIFwiY2RrLW5hZ1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIE5lYXJDb21tb25TdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge31cblxuZXhwb3J0IGNsYXNzIE5lYXJDb21tb25TdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gICAgcHVibGljIHJlYWRvbmx5IHZwYzogZWMyLlZwYztcbiAgICBwdWJsaWMgcmVhZG9ubHkgc2VjdXJpdHlHcm91cDogZWMyLlNlY3VyaXR5R3JvdXA7XG4gICAgcHVibGljIHJlYWRvbmx5IGluc3RhbmNlUm9sZTogaWFtLlJvbGU7XG5cbiAgICBjb25zdHJ1Y3RvcihzY29wZTogY29uc3RydWN0cy5Db25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBOZWFyQ29tbW9uU3RhY2tQcm9wcykge1xuICAgICAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgICAgICAvLyBWUEMgZm9yIE5FQVIgTm9kZVxuICAgICAgICB0aGlzLnZwYyA9IG5ldyBlYzIuVnBjKHRoaXMsIFwiTmVhclZwY1wiLCB7XG4gICAgICAgICAgICBtYXhBenM6IDIsXG4gICAgICAgICAgICBuYXRHYXRld2F5czogMSwgLy8gRm9yIGluc3RhbmNlIGludGVybmV0IGFjY2VzcyAoUnVzdCwgbmVhcmNvcmUgZG93bmxvYWRzKVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBWUEMgRW5kcG9pbnRzIGZvciBTU00gKHJlcXVpcmVkIGZvciBTU00gYWdlbnQgdG8gcmVnaXN0ZXIpXG4gICAgICAgIHRoaXMudnBjLmFkZEludGVyZmFjZUVuZHBvaW50KFwiU1NNRW5kcG9pbnRcIiwge1xuICAgICAgICAgICAgc2VydmljZTogZWMyLkludGVyZmFjZVZwY0VuZHBvaW50QXdzU2VydmljZS5TU00sXG4gICAgICAgICAgICBwcml2YXRlRG5zRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy52cGMuYWRkSW50ZXJmYWNlRW5kcG9pbnQoXCJTU01NZXNzYWdlc0VuZHBvaW50XCIsIHtcbiAgICAgICAgICAgIHNlcnZpY2U6IGVjMi5JbnRlcmZhY2VWcGNFbmRwb2ludEF3c1NlcnZpY2UuU1NNX01FU1NBR0VTLFxuICAgICAgICAgICAgcHJpdmF0ZURuc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMudnBjLmFkZEludGVyZmFjZUVuZHBvaW50KFwiRUMyTWVzc2FnZXNFbmRwb2ludFwiLCB7XG4gICAgICAgICAgICBzZXJ2aWNlOiBlYzIuSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLkVDMl9NRVNTQUdFUyxcbiAgICAgICAgICAgIHByaXZhdGVEbnNFbmFibGVkOiB0cnVlLFxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBTZWN1cml0eSBHcm91cCBmb3IgTkVBUiBMb2NhbG5ldCBOb2RlXG4gICAgICAgIHRoaXMuc2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCBcIk5lYXJOb2RlU2VjdXJpdHlHcm91cFwiLCB7XG4gICAgICAgICAgICB2cGM6IHRoaXMudnBjLFxuICAgICAgICAgICAgZGVzY3JpcHRpb246IFwiTkVBUiBsb2NhbG5ldCBub2RlIHNlY3VyaXR5IGdyb3VwXCIsXG4gICAgICAgICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlLFxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBBbGxvdyBWUEMgYWNjZXNzIHRvIE5FQVIgUlBDIG9uIHBvcnQgMzAzMFxuICAgICAgICB0aGlzLnNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICAgICAgICBlYzIuUGVlci5pcHY0KHRoaXMudnBjLnZwY0NpZHJCbG9jayksXG4gICAgICAgICAgICBlYzIuUG9ydC50Y3AoMzAzMCksXG4gICAgICAgICAgICBcIkFsbG93IE5FQVIgUlBDIGZyb20gd2l0aGluIFZQQ1wiXG4gICAgICAgICk7XG5cbiAgICAgICAgLy8gQWxsb3cgVlBDIGFjY2VzcyB0byBORUFSIFAyUCBwb3J0cyAobmVlZGVkIGZvciBNUEMgbm9kZSBpbmRleGVycyB0byBwZWVyKS5cbiAgICAgICAgLy8gTk9URTogbmVhcnVwIGxvY2FsbmV0IHVzZXMgYSBwb3J0IHBlciBub2RlOiAyNDU2NywgMjQ1NjgsIDI0NTY5LCAyNDU3MCAoZm9yIDQgbm9kZXMpLlxuICAgICAgICB0aGlzLnNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICAgICAgICBlYzIuUGVlci5pcHY0KHRoaXMudnBjLnZwY0NpZHJCbG9jayksXG4gICAgICAgICAgICBlYzIuUG9ydC50Y3BSYW5nZSgyNDU2NywgMjQ1NzApLFxuICAgICAgICAgICAgXCJBbGxvdyBORUFSIFAyUCBmcm9tIHdpdGhpbiBWUENcIlxuICAgICAgICApO1xuXG4gICAgICAgIC8vIEFsbG93IFNTSCBmb3IgZGVidWdnaW5nXG4gICAgICAgIHRoaXMuc2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgICAgICAgIGVjMi5QZWVyLmFueUlwdjQoKSxcbiAgICAgICAgICAgIGVjMi5Qb3J0LnRjcCgyMiksXG4gICAgICAgICAgICBcIlNTSCBhY2Nlc3MgZm9yIGRlYnVnZ2luZ1wiXG4gICAgICAgICk7XG5cbiAgICAgICAgLy8gSUFNIHJvbGUgZm9yIEVDMiBpbnN0YW5jZSB3aXRoIFNTTSBwZXJtaXNzaW9uc1xuICAgICAgICB0aGlzLmluc3RhbmNlUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCBcIk5lYXJOb2RlUm9sZVwiLCB7XG4gICAgICAgICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbChcImVjMi5hbWF6b25hd3MuY29tXCIpLFxuICAgICAgICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgICAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKFwiQW1hem9uU1NNTWFuYWdlZEluc3RhbmNlQ29yZVwiKSwgLy8gRW5hYmxlcyBTU00gYWdlbnRcbiAgICAgICAgICAgIF0sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEFsbG93IENsb3VkRm9ybWF0aW9uIHNpZ25hbFxuICAgICAgICB0aGlzLmluc3RhbmNlUm9sZS5hZGRUb1BvbGljeShcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcIipcIl0sXG4gICAgICAgICAgICAgICAgYWN0aW9uczogW1wiY2xvdWRmb3JtYXRpb246U2lnbmFsUmVzb3VyY2VcIl0sXG4gICAgICAgICAgICB9KVxuICAgICAgICApO1xuXG4gICAgICAgIC8vIEV4cG9ydCBpbnN0YW5jZSByb2xlIEFSTiBmb3IgdXNlIGluIG90aGVyIHN0YWNrc1xuICAgICAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIkluc3RhbmNlUm9sZUFyblwiLCB7XG4gICAgICAgICAgICB2YWx1ZTogdGhpcy5pbnN0YW5jZVJvbGUucm9sZUFybixcbiAgICAgICAgICAgIGV4cG9ydE5hbWU6IFwiTmVhckxvY2FsbmV0SW5zdGFuY2VSb2xlQXJuXCIsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEV4cG9ydCBWUEMgSURcbiAgICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJWcGNJZFwiLCB7XG4gICAgICAgICAgICB2YWx1ZTogdGhpcy52cGMudnBjSWQsXG4gICAgICAgICAgICBleHBvcnROYW1lOiBcIk5lYXJMb2NhbG5ldFZwY0lkXCIsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEV4cG9ydCBTZWN1cml0eSBHcm91cCBJRFxuICAgICAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIlNlY3VyaXR5R3JvdXBJZFwiLCB7XG4gICAgICAgICAgICB2YWx1ZTogdGhpcy5zZWN1cml0eUdyb3VwLnNlY3VyaXR5R3JvdXBJZCxcbiAgICAgICAgICAgIGV4cG9ydE5hbWU6IFwiTmVhckxvY2FsbmV0U2VjdXJpdHlHcm91cElkXCIsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIG5hZy5OYWdTdXBwcmVzc2lvbnMuYWRkUmVzb3VyY2VTdXBwcmVzc2lvbnMoXG4gICAgICAgICAgICB0aGlzLFxuICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgaWQ6IFwiQXdzU29sdXRpb25zLUlBTTRcIixcbiAgICAgICAgICAgICAgICAgICAgcmVhc29uOiBcIkFtYXpvbiBtYW5hZ2VkIHBvbGljaWVzIHVzZWQgYXJlIHJlc3RyaWN0aXZlIGVub3VnaFwiLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBpZDogXCJBd3NTb2x1dGlvbnMtSUFNNVwiLFxuICAgICAgICAgICAgICAgICAgICByZWFzb246IFwiV2lsZGNhcmQgcmVzb3VyY2VzIHJlcXVpcmVkIGZvciBjbG91ZGZvcm1hdGlvbiBzaWduYWxcIixcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgaWQ6IFwiQXdzU29sdXRpb25zLUVDMjNcIixcbiAgICAgICAgICAgICAgICAgICAgcmVhc29uOiBcIlNTSCBhY2Nlc3MgbmVlZGVkIGZvciBkZWJ1Z2dpbmcsIFJQQyByZXN0cmljdGVkIHRvIFZQQ1wiLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBpZDogXCJBd3NTb2x1dGlvbnMtVlBDN1wiLFxuICAgICAgICAgICAgICAgICAgICByZWFzb246IFwiVlBDIEZsb3cgTG9ncyBub3QgcmVxdWlyZWQgZm9yIGxvY2FsbmV0IGRldmVsb3BtZW50IGVudmlyb25tZW50XCIsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB0cnVlXG4gICAgICAgICk7XG4gICAgfVxufVxuXG4iXX0=
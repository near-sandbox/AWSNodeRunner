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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbW9uLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY29tbW9uLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUVuQyx5REFBMkM7QUFDM0MseURBQTJDO0FBQzNDLDZDQUErQjtBQUkvQixNQUFhLGVBQWdCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFLMUMsWUFBWSxLQUEyQixFQUFFLEVBQVUsRUFBRSxLQUEyQjtRQUM1RSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixvQkFBb0I7UUFDcEIsSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRTtZQUNwQyxNQUFNLEVBQUUsQ0FBQztZQUNULFdBQVcsRUFBRSxDQUFDLEVBQUUsMERBQTBEO1NBQzdFLENBQUMsQ0FBQztRQUVILDZEQUE2RDtRQUM3RCxJQUFJLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLGFBQWEsRUFBRTtZQUN6QyxPQUFPLEVBQUUsR0FBRyxDQUFDLDhCQUE4QixDQUFDLEdBQUc7WUFDL0MsaUJBQWlCLEVBQUUsSUFBSTtTQUMxQixDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLHFCQUFxQixFQUFFO1lBQ2pELE9BQU8sRUFBRSxHQUFHLENBQUMsOEJBQThCLENBQUMsWUFBWTtZQUN4RCxpQkFBaUIsRUFBRSxJQUFJO1NBQzFCLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMscUJBQXFCLEVBQUU7WUFDakQsT0FBTyxFQUFFLEdBQUcsQ0FBQyw4QkFBOEIsQ0FBQyxZQUFZO1lBQ3hELGlCQUFpQixFQUFFLElBQUk7U0FDMUIsQ0FBQyxDQUFDO1FBRUgsd0NBQXdDO1FBQ3hDLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxHQUFHLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSx1QkFBdUIsRUFBRTtZQUN0RSxHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUc7WUFDYixXQUFXLEVBQUUsbUNBQW1DO1lBQ2hELGdCQUFnQixFQUFFLElBQUk7U0FDekIsQ0FBQyxDQUFDO1FBRUgsNENBQTRDO1FBQzVDLElBQUksQ0FBQyxhQUFhLENBQUMsY0FBYyxDQUM3QixHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxFQUNwQyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFDbEIsZ0NBQWdDLENBQ25DLENBQUM7UUFFRiwwQkFBMEI7UUFDMUIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxjQUFjLENBQzdCLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEVBQ2xCLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUNoQiwwQkFBMEIsQ0FDN0IsQ0FBQztRQUVGLGlEQUFpRDtRQUNqRCxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQ25ELFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxtQkFBbUIsQ0FBQztZQUN4RCxlQUFlLEVBQUU7Z0JBQ2IsR0FBRyxDQUFDLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBQyw4QkFBOEIsQ0FBQyxFQUFFLG9CQUFvQjthQUNuRztTQUNKLENBQUMsQ0FBQztRQUVILDhCQUE4QjtRQUM5QixJQUFJLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FDekIsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1lBQ3BCLFNBQVMsRUFBRSxDQUFDLEdBQUcsQ0FBQztZQUNoQixPQUFPLEVBQUUsQ0FBQywrQkFBK0IsQ0FBQztTQUM3QyxDQUFDLENBQ0wsQ0FBQztRQUVGLG1EQUFtRDtRQUNuRCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFO1lBQ3ZDLEtBQUssRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU87WUFDaEMsVUFBVSxFQUFFLDZCQUE2QjtTQUM1QyxDQUFDLENBQUM7UUFFSCxnQkFBZ0I7UUFDaEIsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUU7WUFDN0IsS0FBSyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSztZQUNyQixVQUFVLEVBQUUsbUJBQW1CO1NBQ2xDLENBQUMsQ0FBQztRQUVILDJCQUEyQjtRQUMzQixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFO1lBQ3ZDLEtBQUssRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLGVBQWU7WUFDekMsVUFBVSxFQUFFLDZCQUE2QjtTQUM1QyxDQUFDLENBQUM7UUFFSCxHQUFHLENBQUMsZUFBZSxDQUFDLHVCQUF1QixDQUN2QyxJQUFJLEVBQ0o7WUFDSTtnQkFDSSxFQUFFLEVBQUUsbUJBQW1CO2dCQUN2QixNQUFNLEVBQUUscURBQXFEO2FBQ2hFO1lBQ0Q7Z0JBQ0ksRUFBRSxFQUFFLG1CQUFtQjtnQkFDdkIsTUFBTSxFQUFFLHVEQUF1RDthQUNsRTtZQUNEO2dCQUNJLEVBQUUsRUFBRSxtQkFBbUI7Z0JBQ3ZCLE1BQU0sRUFBRSx3REFBd0Q7YUFDbkU7WUFDRDtnQkFDSSxFQUFFLEVBQUUsbUJBQW1CO2dCQUN2QixNQUFNLEVBQUUsaUVBQWlFO2FBQzVFO1NBQ0osRUFDRCxJQUFJLENBQ1AsQ0FBQztJQUNOLENBQUM7Q0FDSjtBQTVHRCwwQ0E0R0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgKiBhcyBjb25zdHJ1Y3RzIGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5pbXBvcnQgKiBhcyBlYzIgZnJvbSBcImF3cy1jZGstbGliL2F3cy1lYzJcIjtcbmltcG9ydCAqIGFzIGlhbSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWlhbVwiO1xuaW1wb3J0ICogYXMgbmFnIGZyb20gXCJjZGstbmFnXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTmVhckNvbW1vblN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7fVxuXG5leHBvcnQgY2xhc3MgTmVhckNvbW1vblN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgICBwdWJsaWMgcmVhZG9ubHkgdnBjOiBlYzIuVnBjO1xuICAgIHB1YmxpYyByZWFkb25seSBzZWN1cml0eUdyb3VwOiBlYzIuU2VjdXJpdHlHcm91cDtcbiAgICBwdWJsaWMgcmVhZG9ubHkgaW5zdGFuY2VSb2xlOiBpYW0uUm9sZTtcblxuICAgIGNvbnN0cnVjdG9yKHNjb3BlOiBjb25zdHJ1Y3RzLkNvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IE5lYXJDb21tb25TdGFja1Byb3BzKSB7XG4gICAgICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgICAgIC8vIFZQQyBmb3IgTkVBUiBOb2RlXG4gICAgICAgIHRoaXMudnBjID0gbmV3IGVjMi5WcGModGhpcywgXCJOZWFyVnBjXCIsIHtcbiAgICAgICAgICAgIG1heEF6czogMixcbiAgICAgICAgICAgIG5hdEdhdGV3YXlzOiAxLCAvLyBGb3IgaW5zdGFuY2UgaW50ZXJuZXQgYWNjZXNzIChSdXN0LCBuZWFyY29yZSBkb3dubG9hZHMpXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFZQQyBFbmRwb2ludHMgZm9yIFNTTSAocmVxdWlyZWQgZm9yIFNTTSBhZ2VudCB0byByZWdpc3RlcilcbiAgICAgICAgdGhpcy52cGMuYWRkSW50ZXJmYWNlRW5kcG9pbnQoXCJTU01FbmRwb2ludFwiLCB7XG4gICAgICAgICAgICBzZXJ2aWNlOiBlYzIuSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLlNTTSxcbiAgICAgICAgICAgIHByaXZhdGVEbnNFbmFibGVkOiB0cnVlLFxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLnZwYy5hZGRJbnRlcmZhY2VFbmRwb2ludChcIlNTTU1lc3NhZ2VzRW5kcG9pbnRcIiwge1xuICAgICAgICAgICAgc2VydmljZTogZWMyLkludGVyZmFjZVZwY0VuZHBvaW50QXdzU2VydmljZS5TU01fTUVTU0FHRVMsXG4gICAgICAgICAgICBwcml2YXRlRG5zRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy52cGMuYWRkSW50ZXJmYWNlRW5kcG9pbnQoXCJFQzJNZXNzYWdlc0VuZHBvaW50XCIsIHtcbiAgICAgICAgICAgIHNlcnZpY2U6IGVjMi5JbnRlcmZhY2VWcGNFbmRwb2ludEF3c1NlcnZpY2UuRUMyX01FU1NBR0VTLFxuICAgICAgICAgICAgcHJpdmF0ZURuc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFNlY3VyaXR5IEdyb3VwIGZvciBORUFSIExvY2FsbmV0IE5vZGVcbiAgICAgICAgdGhpcy5zZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsIFwiTmVhck5vZGVTZWN1cml0eUdyb3VwXCIsIHtcbiAgICAgICAgICAgIHZwYzogdGhpcy52cGMsXG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogXCJORUFSIGxvY2FsbmV0IG5vZGUgc2VjdXJpdHkgZ3JvdXBcIixcbiAgICAgICAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IHRydWUsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEFsbG93IFZQQyBhY2Nlc3MgdG8gTkVBUiBSUEMgb24gcG9ydCAzMDMwXG4gICAgICAgIHRoaXMuc2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgICAgICAgIGVjMi5QZWVyLmlwdjQodGhpcy52cGMudnBjQ2lkckJsb2NrKSxcbiAgICAgICAgICAgIGVjMi5Qb3J0LnRjcCgzMDMwKSxcbiAgICAgICAgICAgIFwiQWxsb3cgTkVBUiBSUEMgZnJvbSB3aXRoaW4gVlBDXCJcbiAgICAgICAgKTtcblxuICAgICAgICAvLyBBbGxvdyBTU0ggZm9yIGRlYnVnZ2luZ1xuICAgICAgICB0aGlzLnNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICAgICAgICBlYzIuUGVlci5hbnlJcHY0KCksXG4gICAgICAgICAgICBlYzIuUG9ydC50Y3AoMjIpLFxuICAgICAgICAgICAgXCJTU0ggYWNjZXNzIGZvciBkZWJ1Z2dpbmdcIlxuICAgICAgICApO1xuXG4gICAgICAgIC8vIElBTSByb2xlIGZvciBFQzIgaW5zdGFuY2Ugd2l0aCBTU00gcGVybWlzc2lvbnNcbiAgICAgICAgdGhpcy5pbnN0YW5jZVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgXCJOZWFyTm9kZVJvbGVcIiwge1xuICAgICAgICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoXCJlYzIuYW1hem9uYXdzLmNvbVwiKSxcbiAgICAgICAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICAgICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZShcIkFtYXpvblNTTU1hbmFnZWRJbnN0YW5jZUNvcmVcIiksIC8vIEVuYWJsZXMgU1NNIGFnZW50XG4gICAgICAgICAgICBdLFxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBBbGxvdyBDbG91ZEZvcm1hdGlvbiBzaWduYWxcbiAgICAgICAgdGhpcy5pbnN0YW5jZVJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXCIqXCJdLFxuICAgICAgICAgICAgICAgIGFjdGlvbnM6IFtcImNsb3VkZm9ybWF0aW9uOlNpZ25hbFJlc291cmNlXCJdLFxuICAgICAgICAgICAgfSlcbiAgICAgICAgKTtcblxuICAgICAgICAvLyBFeHBvcnQgaW5zdGFuY2Ugcm9sZSBBUk4gZm9yIHVzZSBpbiBvdGhlciBzdGFja3NcbiAgICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJJbnN0YW5jZVJvbGVBcm5cIiwge1xuICAgICAgICAgICAgdmFsdWU6IHRoaXMuaW5zdGFuY2VSb2xlLnJvbGVBcm4sXG4gICAgICAgICAgICBleHBvcnROYW1lOiBcIk5lYXJMb2NhbG5ldEluc3RhbmNlUm9sZUFyblwiLFxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBFeHBvcnQgVlBDIElEXG4gICAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiVnBjSWRcIiwge1xuICAgICAgICAgICAgdmFsdWU6IHRoaXMudnBjLnZwY0lkLFxuICAgICAgICAgICAgZXhwb3J0TmFtZTogXCJOZWFyTG9jYWxuZXRWcGNJZFwiLFxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBFeHBvcnQgU2VjdXJpdHkgR3JvdXAgSURcbiAgICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJTZWN1cml0eUdyb3VwSWRcIiwge1xuICAgICAgICAgICAgdmFsdWU6IHRoaXMuc2VjdXJpdHlHcm91cC5zZWN1cml0eUdyb3VwSWQsXG4gICAgICAgICAgICBleHBvcnROYW1lOiBcIk5lYXJMb2NhbG5ldFNlY3VyaXR5R3JvdXBJZFwiLFxuICAgICAgICB9KTtcblxuICAgICAgICBuYWcuTmFnU3VwcHJlc3Npb25zLmFkZFJlc291cmNlU3VwcHJlc3Npb25zKFxuICAgICAgICAgICAgdGhpcyxcbiAgICAgICAgICAgIFtcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGlkOiBcIkF3c1NvbHV0aW9ucy1JQU00XCIsXG4gICAgICAgICAgICAgICAgICAgIHJlYXNvbjogXCJBbWF6b24gbWFuYWdlZCBwb2xpY2llcyB1c2VkIGFyZSByZXN0cmljdGl2ZSBlbm91Z2hcIixcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgaWQ6IFwiQXdzU29sdXRpb25zLUlBTTVcIixcbiAgICAgICAgICAgICAgICAgICAgcmVhc29uOiBcIldpbGRjYXJkIHJlc291cmNlcyByZXF1aXJlZCBmb3IgY2xvdWRmb3JtYXRpb24gc2lnbmFsXCIsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGlkOiBcIkF3c1NvbHV0aW9ucy1FQzIzXCIsXG4gICAgICAgICAgICAgICAgICAgIHJlYXNvbjogXCJTU0ggYWNjZXNzIG5lZWRlZCBmb3IgZGVidWdnaW5nLCBSUEMgcmVzdHJpY3RlZCB0byBWUENcIixcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgaWQ6IFwiQXdzU29sdXRpb25zLVZQQzdcIixcbiAgICAgICAgICAgICAgICAgICAgcmVhc29uOiBcIlZQQyBGbG93IExvZ3Mgbm90IHJlcXVpcmVkIGZvciBsb2NhbG5ldCBkZXZlbG9wbWVudCBlbnZpcm9ubWVudFwiLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgIH1cbn1cblxuIl19
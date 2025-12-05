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
exports.NearInfrastructureStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const nag = __importStar(require("cdk-nag"));
class NearInfrastructureStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const REGION = cdk.Stack.of(this).region;
        const STACK_NAME = cdk.Stack.of(this).stackName;
        const STACK_ID = cdk.Stack.of(this).stackId;
        const { instanceType, instanceCpuType, nearNetwork, nearVersion, dataVolume, vpc, securityGroup, instanceRole, } = props;
        // Use provided VPC/security group/role or import from common stack
        if (vpc && securityGroup && instanceRole) {
            this.vpc = vpc;
            this.securityGroup = securityGroup;
            this.instanceRole = instanceRole;
        }
        else {
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
        const instanceClass = (instanceClassStr.charAt(0).toUpperCase() + instanceClassStr.slice(1)).toUpperCase();
        const instanceSize = instanceSizeStr.toUpperCase();
        const ec2InstanceType = new ec2.InstanceType(`${instanceClassStr}.${instanceSizeStr}`);
        // UserData script following the working implementation from chain-mobil/cdk
        // This compiles and runs neard on Ubuntu per NEAR's recommendations
        const userData = ec2.UserData.forLinux();
        userData.addCommands('#!/bin/bash', 'set -e', 'exec > >(tee /var/log/near-setup.log) 2>&1', '', '# Update system', 'apt update', '', '# Install dependencies for NEAR compilation (Ubuntu packages)', 'apt install -y git binutils-dev libcurl4-openssl-dev zlib1g-dev libdw-dev libiberty-dev cmake gcc g++ python3 python3-pip protobuf-compiler libssl-dev pkg-config clang llvm', '', '# Install Rust as ubuntu user', 'su - ubuntu -c "curl --proto =https --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y"', 'su - ubuntu -c "source ~/.cargo/env && rustc --version"', '', '# Clone nearcore', 'su - ubuntu -c "cd ~ && git clone https://github.com/near/nearcore.git"', `su - ubuntu -c "cd ~/nearcore && git checkout ${nearVersion}"`, '', '# Compile neard (takes ~10-15 minutes)', 'su - ubuntu -c "cd ~/nearcore && source ~/.cargo/env && make neard"', '', '# Install nearup (Ubuntu 24.04 requires --break-system-packages)', 'su - ubuntu -c "pip3 install --user --break-system-packages nearup"', '', '# Run nearup localnet with compiled binary', 'su - ubuntu -c "export PATH=$PATH:~/.local/bin && nearup run localnet --binary-path ~/nearcore/target/release" > /var/log/nearup.log 2>&1 &', '', '# Wait for NEAR to initialize', 'sleep 60', '', 'echo "NEAR localnet initialization complete" > /var/log/near-init-complete.log');
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
        nag.NagSuppressions.addResourceSuppressions(this, [
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
        ], true);
    }
}
exports.NearInfrastructureStack = NearInfrastructureStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5mcmFzdHJ1Y3R1cmUtc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmZyYXN0cnVjdHVyZS1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFFbkMseURBQTJDO0FBRTNDLDZDQUErQjtBQWUvQixNQUFhLHVCQUF3QixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBT2xELFlBQVksS0FBOEIsRUFBRSxFQUFVLEVBQUUsS0FBbUM7UUFDdkYsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxNQUFNLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDO1FBQ3pDLE1BQU0sVUFBVSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUNoRCxNQUFNLFFBQVEsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUM7UUFFNUMsTUFBTSxFQUNGLFlBQVksRUFDWixlQUFlLEVBQ2YsV0FBVyxFQUNYLFdBQVcsRUFDWCxVQUFVLEVBQ1YsR0FBRyxFQUNILGFBQWEsRUFDYixZQUFZLEdBQ2YsR0FBRyxLQUFLLENBQUM7UUFFVixtRUFBbUU7UUFDbkUsSUFBSSxHQUFHLElBQUksYUFBYSxJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ3ZDLElBQUksQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO1lBQ2YsSUFBSSxDQUFDLGFBQWEsR0FBRyxhQUFhLENBQUM7WUFDbkMsSUFBSSxDQUFDLFlBQVksR0FBRyxZQUFZLENBQUM7UUFDckMsQ0FBQzthQUFNLENBQUM7WUFDSixxRkFBcUY7WUFDckYsTUFBTSxLQUFLLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsbUJBQW1CLENBQUMsQ0FBQztZQUN0RCxNQUFNLGVBQWUsR0FBRyxHQUFHLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1lBQzFFLE1BQU0sdUJBQXVCLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsNkJBQTZCLENBQUMsQ0FBQztZQUVsRix3RkFBd0Y7WUFDeEYsNEVBQTRFO1lBQzVFLE1BQU0sSUFBSSxLQUFLLENBQUMsa0dBQWtHLENBQUMsQ0FBQztRQUN4SCxDQUFDO1FBRUQsOERBQThEO1FBQzlELElBQUksd0JBQXdCLEdBQUcsb0ZBQW9GLENBQUM7UUFDcEgsSUFBSSxlQUFlLEtBQUssT0FBTyxFQUFFLENBQUM7WUFDOUIsd0JBQXdCLEdBQUcsb0ZBQW9GLENBQUM7UUFDcEgsQ0FBQztRQUNELE1BQU0sWUFBWSxHQUFHLEdBQUcsQ0FBQyxZQUFZLENBQUMsZ0JBQWdCLENBQUMsd0JBQXdCLENBQUMsQ0FBQztRQUVqRiw2RUFBNkU7UUFDN0UscURBQXFEO1FBQ3JELE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRSxlQUFlLENBQUMsR0FBRyxZQUFZLENBQUMsV0FBVyxFQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2xGLDhDQUE4QztRQUM5QyxNQUFNLGFBQWEsR0FBRyxDQUFDLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsR0FBRyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQXVCLENBQUM7UUFDaEksTUFBTSxZQUFZLEdBQUcsZUFBZSxDQUFDLFdBQVcsRUFBc0IsQ0FBQztRQUN2RSxNQUFNLGVBQWUsR0FBRyxJQUFJLEdBQUcsQ0FBQyxZQUFZLENBQUMsR0FBRyxnQkFBZ0IsSUFBSSxlQUFlLEVBQUUsQ0FBQyxDQUFDO1FBRXZGLDRFQUE0RTtRQUM1RSxvRUFBb0U7UUFDcEUsTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUN6QyxRQUFRLENBQUMsV0FBVyxDQUNoQixhQUFhLEVBQ2IsUUFBUSxFQUNSLDRDQUE0QyxFQUM1QyxFQUFFLEVBQ0YsaUJBQWlCLEVBQ2pCLFlBQVksRUFDWixFQUFFLEVBQ0YsK0RBQStELEVBQy9ELDhLQUE4SyxFQUM5SyxFQUFFLEVBQ0YsK0JBQStCLEVBQy9CLHdGQUF3RixFQUN4Rix5REFBeUQsRUFDekQsRUFBRSxFQUNGLGtCQUFrQixFQUNsQix5RUFBeUUsRUFDekUsaURBQWlELFdBQVcsR0FBRyxFQUMvRCxFQUFFLEVBQ0Ysd0NBQXdDLEVBQ3hDLHFFQUFxRSxFQUNyRSxFQUFFLEVBQ0Ysa0VBQWtFLEVBQ2xFLHFFQUFxRSxFQUNyRSxFQUFFLEVBQ0YsNENBQTRDLEVBQzVDLDZJQUE2SSxFQUM3SSxFQUFFLEVBQ0YsK0JBQStCLEVBQy9CLFVBQVUsRUFDVixFQUFFLEVBQ0YsZ0ZBQWdGLENBQ25GLENBQUM7UUFFRixxRUFBcUU7UUFDckUsdURBQXVEO1FBQ3ZELElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxvQkFBb0IsV0FBVyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUN6RixHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUc7WUFDYixZQUFZLEVBQUUsZUFBZTtZQUM3QixZQUFZO1lBQ1osYUFBYSxFQUFFLElBQUksQ0FBQyxhQUFhO1lBQ2pDLElBQUksRUFBRSxJQUFJLENBQUMsWUFBWTtZQUN2QixRQUFRLEVBQUUsdUVBQXVFO1lBQ2pGLFVBQVUsRUFBRSxFQUFFLFVBQVUsRUFBRSxHQUFHLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxFQUFFLGtEQUFrRDtZQUNyRyxxQkFBcUIsRUFBRSxJQUFJLEVBQUUsNkJBQTZCO1lBQzFELDRFQUE0RTtZQUM1RSxZQUFZLEVBQUUsQ0FBQztvQkFDWCxVQUFVLEVBQUUsV0FBVyxFQUFFLHFCQUFxQjtvQkFDOUMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRTt3QkFDbEQsVUFBVSxFQUFFLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHO3dCQUN2QyxtQkFBbUIsRUFBRSxJQUFJO3FCQUM1QixDQUFDO2lCQUNMLENBQUM7U0FDTCxDQUFDLENBQUM7UUFFSCxzQ0FBc0M7UUFDdEMsTUFBTSxlQUFlLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxFQUFFLElBQUksa0JBQWtCLENBQUM7UUFFdkYsNERBQTREO1FBQzVELEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBRTNELElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUM7UUFFM0MsZ0JBQWdCO1FBQ2hCLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDeEMsS0FBSyxFQUFFLElBQUksQ0FBQyxVQUFVO1lBQ3RCLFVBQVUsRUFBRSx3QkFBd0I7U0FDdkMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSwwQkFBMEIsRUFBRTtZQUNoRCxLQUFLLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxpQkFBaUI7WUFDdEMsVUFBVSxFQUFFLCtCQUErQjtTQUM5QyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHlCQUF5QixFQUFFO1lBQy9DLEtBQUssRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLGdCQUFnQixJQUFJLEtBQUs7WUFDOUMsVUFBVSxFQUFFLDhCQUE4QjtTQUM3QyxDQUFDLENBQUM7UUFFSCxtQ0FBbUM7UUFDbkMsR0FBRyxDQUFDLGVBQWUsQ0FBQyx1QkFBdUIsQ0FDdkMsSUFBSSxFQUNKO1lBQ0k7Z0JBQ0ksRUFBRSxFQUFFLG1CQUFtQjtnQkFDdkIsTUFBTSxFQUFFLHdEQUF3RDthQUNuRTtZQUNEO2dCQUNJLEVBQUUsRUFBRSxtQkFBbUI7Z0JBQ3ZCLE1BQU0sRUFBRSxrRUFBa0U7YUFDN0U7WUFDRDtnQkFDSSxFQUFFLEVBQUUsbUJBQW1CO2dCQUN2QixNQUFNLEVBQUUsdUVBQXVFO2FBQ2xGO1lBQ0Q7Z0JBQ0ksRUFBRSxFQUFFLG1CQUFtQjtnQkFDdkIsTUFBTSxFQUFFLDBFQUEwRTthQUNyRjtTQUNKLEVBQ0QsSUFBSSxDQUNQLENBQUM7SUFDTixDQUFDO0NBQ0o7QUFsS0QsMERBa0tDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0ICogYXMgY2RrQ29uc3RydWN0cyBmcm9tIFwiY29uc3RydWN0c1wiO1xuaW1wb3J0ICogYXMgZWMyIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtZWMyXCI7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1pYW1cIjtcbmltcG9ydCAqIGFzIG5hZyBmcm9tIFwiY2RrLW5hZ1wiO1xuaW1wb3J0ICogYXMgY29uZmlnVHlwZXMgZnJvbSBcIi4vY29uZmlnL25vZGUtY29uZmlnLmludGVyZmFjZVwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIE5lYXJJbmZyYXN0cnVjdHVyZVN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gICAgaW5zdGFuY2VUeXBlOiBzdHJpbmc7XG4gICAgaW5zdGFuY2VDcHVUeXBlOiBcIng4Nl82NFwiIHwgXCJhcm02NFwiO1xuICAgIG5lYXJOZXR3b3JrOiBjb25maWdUeXBlcy5OZWFyTmV0d29yaztcbiAgICBuZWFyVmVyc2lvbjogc3RyaW5nO1xuICAgIGRhdGFWb2x1bWU6IGNvbmZpZ1R5cGVzLk5lYXJEYXRhVm9sdW1lQ29uZmlnO1xuICAgIGxpbWl0T3V0VHJhZmZpY01icHM6IG51bWJlcjtcbiAgICB2cGM/OiBlYzIuSVZwYztcbiAgICBzZWN1cml0eUdyb3VwPzogZWMyLklTZWN1cml0eUdyb3VwO1xuICAgIGluc3RhbmNlUm9sZT86IGlhbS5JUm9sZTtcbn1cblxuZXhwb3J0IGNsYXNzIE5lYXJJbmZyYXN0cnVjdHVyZVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgICBwdWJsaWMgcmVhZG9ubHkgaW5zdGFuY2VJZDogc3RyaW5nO1xuICAgIHB1YmxpYyByZWFkb25seSBpbnN0YW5jZTogZWMyLkluc3RhbmNlO1xuICAgIHB1YmxpYyByZWFkb25seSBpbnN0YW5jZVJvbGU6IGlhbS5JUm9sZTtcbiAgICBwdWJsaWMgcmVhZG9ubHkgdnBjOiBlYzIuSVZwYztcbiAgICBwdWJsaWMgcmVhZG9ubHkgc2VjdXJpdHlHcm91cDogZWMyLklTZWN1cml0eUdyb3VwO1xuXG4gICAgY29uc3RydWN0b3Ioc2NvcGU6IGNka0NvbnN0cnVjdHMuQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogTmVhckluZnJhc3RydWN0dXJlU3RhY2tQcm9wcykge1xuICAgICAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgICAgICBjb25zdCBSRUdJT04gPSBjZGsuU3RhY2sub2YodGhpcykucmVnaW9uO1xuICAgICAgICBjb25zdCBTVEFDS19OQU1FID0gY2RrLlN0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZTtcbiAgICAgICAgY29uc3QgU1RBQ0tfSUQgPSBjZGsuU3RhY2sub2YodGhpcykuc3RhY2tJZDtcblxuICAgICAgICBjb25zdCB7XG4gICAgICAgICAgICBpbnN0YW5jZVR5cGUsXG4gICAgICAgICAgICBpbnN0YW5jZUNwdVR5cGUsXG4gICAgICAgICAgICBuZWFyTmV0d29yayxcbiAgICAgICAgICAgIG5lYXJWZXJzaW9uLFxuICAgICAgICAgICAgZGF0YVZvbHVtZSxcbiAgICAgICAgICAgIHZwYyxcbiAgICAgICAgICAgIHNlY3VyaXR5R3JvdXAsXG4gICAgICAgICAgICBpbnN0YW5jZVJvbGUsXG4gICAgICAgIH0gPSBwcm9wcztcblxuICAgICAgICAvLyBVc2UgcHJvdmlkZWQgVlBDL3NlY3VyaXR5IGdyb3VwL3JvbGUgb3IgaW1wb3J0IGZyb20gY29tbW9uIHN0YWNrXG4gICAgICAgIGlmICh2cGMgJiYgc2VjdXJpdHlHcm91cCAmJiBpbnN0YW5jZVJvbGUpIHtcbiAgICAgICAgICAgIHRoaXMudnBjID0gdnBjO1xuICAgICAgICAgICAgdGhpcy5zZWN1cml0eUdyb3VwID0gc2VjdXJpdHlHcm91cDtcbiAgICAgICAgICAgIHRoaXMuaW5zdGFuY2VSb2xlID0gaW5zdGFuY2VSb2xlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gRmFsbGJhY2sgdG8gaW1wb3J0cyAoZm9yIGNyb3NzLXN0YWNrIHJlZmVyZW5jZXMgd2hlbiBzdGFja3MgYXJlIGluIGRpZmZlcmVudCBhcHBzKVxuICAgICAgICAgICAgY29uc3QgdnBjSWQgPSBjZGsuRm4uaW1wb3J0VmFsdWUoXCJOZWFyTG9jYWxuZXRWcGNJZFwiKTtcbiAgICAgICAgICAgIGNvbnN0IHNlY3VyaXR5R3JvdXBJZCA9IGNkay5Gbi5pbXBvcnRWYWx1ZShcIk5lYXJMb2NhbG5ldFNlY3VyaXR5R3JvdXBJZFwiKTtcbiAgICAgICAgICAgIGNvbnN0IGltcG9ydGVkSW5zdGFuY2VSb2xlQXJuID0gY2RrLkZuLmltcG9ydFZhbHVlKFwiTmVhckxvY2FsbmV0SW5zdGFuY2VSb2xlQXJuXCIpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBOb3RlOiBWcGMuZnJvbUxvb2t1cCByZXF1aXJlcyBlbnZpcm9ubWVudCBjb250ZXh0IGFuZCB3b24ndCB3b3JrIHdpdGggaW1wb3J0ZWQgdmFsdWVzXG4gICAgICAgICAgICAvLyBUaGlzIGZhbGxiYWNrIGlzIGZvciByZWZlcmVuY2UgYnV0IHNob3VsZCB1c2UgZGlyZWN0IHJlZmVyZW5jZXMgaW4gYXBwLnRzXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJWUEMsIHNlY3VyaXR5IGdyb3VwLCBhbmQgaW5zdGFuY2Ugcm9sZSBtdXN0IGJlIHByb3ZpZGVkIGRpcmVjdGx5IHdoZW4gc3RhY2tzIGFyZSBpbiB0aGUgc2FtZSBhcHBcIik7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBVYnVudHUgMjQuMDQgTFRTIGltYWdlIGZvciBhbWQ2NCAoeDg2XzY0IHJlcXVpcmVkIGZvciBORUFSKVxuICAgICAgICBsZXQgdWJ1bnR1U3RhYmxlSW1hZ2VTc21OYW1lID0gXCIvYXdzL3NlcnZpY2UvY2Fub25pY2FsL3VidW50dS9zZXJ2ZXIvMjQuMDQvc3RhYmxlL2N1cnJlbnQvYW1kNjQvaHZtL2Vicy1ncDMvYW1pLWlkXCI7XG4gICAgICAgIGlmIChpbnN0YW5jZUNwdVR5cGUgPT09IFwiYXJtNjRcIikge1xuICAgICAgICAgICAgdWJ1bnR1U3RhYmxlSW1hZ2VTc21OYW1lID0gXCIvYXdzL3NlcnZpY2UvY2Fub25pY2FsL3VidW50dS9zZXJ2ZXIvMjQuMDQvc3RhYmxlL2N1cnJlbnQvYXJtNjQvaHZtL2Vicy1ncDMvYW1pLWlkXCI7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgbWFjaGluZUltYWdlID0gZWMyLk1hY2hpbmVJbWFnZS5mcm9tU3NtUGFyYW1ldGVyKHVidW50dVN0YWJsZUltYWdlU3NtTmFtZSk7XG5cbiAgICAgICAgLy8gUGFyc2UgaW5zdGFuY2UgdHlwZSAtIENESyBleHBlY3RzIEluc3RhbmNlQ2xhc3MgZW51bSBhbmQgSW5zdGFuY2VTaXplIGVudW1cbiAgICAgICAgLy8gXCJ0My5sYXJnZVwiIC0+IEluc3RhbmNlQ2xhc3MuVDMsIEluc3RhbmNlU2l6ZS5MQVJHRVxuICAgICAgICBjb25zdCBbaW5zdGFuY2VDbGFzc1N0ciwgaW5zdGFuY2VTaXplU3RyXSA9IGluc3RhbmNlVHlwZS50b0xvd2VyQ2FzZSgpLnNwbGl0KFwiLlwiKTtcbiAgICAgICAgLy8gQ29udmVydCBcInQzXCIgLT4gXCJUM1wiIGZvciBJbnN0YW5jZUNsYXNzIGVudW1cbiAgICAgICAgY29uc3QgaW5zdGFuY2VDbGFzcyA9IChpbnN0YW5jZUNsYXNzU3RyLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgaW5zdGFuY2VDbGFzc1N0ci5zbGljZSgxKSkudG9VcHBlckNhc2UoKSBhcyBlYzIuSW5zdGFuY2VDbGFzcztcbiAgICAgICAgY29uc3QgaW5zdGFuY2VTaXplID0gaW5zdGFuY2VTaXplU3RyLnRvVXBwZXJDYXNlKCkgYXMgZWMyLkluc3RhbmNlU2l6ZTtcbiAgICAgICAgY29uc3QgZWMySW5zdGFuY2VUeXBlID0gbmV3IGVjMi5JbnN0YW5jZVR5cGUoYCR7aW5zdGFuY2VDbGFzc1N0cn0uJHtpbnN0YW5jZVNpemVTdHJ9YCk7XG5cbiAgICAgICAgLy8gVXNlckRhdGEgc2NyaXB0IGZvbGxvd2luZyB0aGUgd29ya2luZyBpbXBsZW1lbnRhdGlvbiBmcm9tIGNoYWluLW1vYmlsL2Nka1xuICAgICAgICAvLyBUaGlzIGNvbXBpbGVzIGFuZCBydW5zIG5lYXJkIG9uIFVidW50dSBwZXIgTkVBUidzIHJlY29tbWVuZGF0aW9uc1xuICAgICAgICBjb25zdCB1c2VyRGF0YSA9IGVjMi5Vc2VyRGF0YS5mb3JMaW51eCgpO1xuICAgICAgICB1c2VyRGF0YS5hZGRDb21tYW5kcyhcbiAgICAgICAgICAgICcjIS9iaW4vYmFzaCcsXG4gICAgICAgICAgICAnc2V0IC1lJyxcbiAgICAgICAgICAgICdleGVjID4gPih0ZWUgL3Zhci9sb2cvbmVhci1zZXR1cC5sb2cpIDI+JjEnLFxuICAgICAgICAgICAgJycsXG4gICAgICAgICAgICAnIyBVcGRhdGUgc3lzdGVtJyxcbiAgICAgICAgICAgICdhcHQgdXBkYXRlJyxcbiAgICAgICAgICAgICcnLFxuICAgICAgICAgICAgJyMgSW5zdGFsbCBkZXBlbmRlbmNpZXMgZm9yIE5FQVIgY29tcGlsYXRpb24gKFVidW50dSBwYWNrYWdlcyknLFxuICAgICAgICAgICAgJ2FwdCBpbnN0YWxsIC15IGdpdCBiaW51dGlscy1kZXYgbGliY3VybDQtb3BlbnNzbC1kZXYgemxpYjFnLWRldiBsaWJkdy1kZXYgbGliaWJlcnR5LWRldiBjbWFrZSBnY2MgZysrIHB5dGhvbjMgcHl0aG9uMy1waXAgcHJvdG9idWYtY29tcGlsZXIgbGlic3NsLWRldiBwa2ctY29uZmlnIGNsYW5nIGxsdm0nLFxuICAgICAgICAgICAgJycsXG4gICAgICAgICAgICAnIyBJbnN0YWxsIFJ1c3QgYXMgdWJ1bnR1IHVzZXInLFxuICAgICAgICAgICAgJ3N1IC0gdWJ1bnR1IC1jIFwiY3VybCAtLXByb3RvID1odHRwcyAtLXRsc3YxLjIgLXNTZiBodHRwczovL3NoLnJ1c3R1cC5ycyB8IHNoIC1zIC0tIC15XCInLFxuICAgICAgICAgICAgJ3N1IC0gdWJ1bnR1IC1jIFwic291cmNlIH4vLmNhcmdvL2VudiAmJiBydXN0YyAtLXZlcnNpb25cIicsXG4gICAgICAgICAgICAnJyxcbiAgICAgICAgICAgICcjIENsb25lIG5lYXJjb3JlJyxcbiAgICAgICAgICAgICdzdSAtIHVidW50dSAtYyBcImNkIH4gJiYgZ2l0IGNsb25lIGh0dHBzOi8vZ2l0aHViLmNvbS9uZWFyL25lYXJjb3JlLmdpdFwiJyxcbiAgICAgICAgICAgIGBzdSAtIHVidW50dSAtYyBcImNkIH4vbmVhcmNvcmUgJiYgZ2l0IGNoZWNrb3V0ICR7bmVhclZlcnNpb259XCJgLFxuICAgICAgICAgICAgJycsXG4gICAgICAgICAgICAnIyBDb21waWxlIG5lYXJkICh0YWtlcyB+MTAtMTUgbWludXRlcyknLFxuICAgICAgICAgICAgJ3N1IC0gdWJ1bnR1IC1jIFwiY2Qgfi9uZWFyY29yZSAmJiBzb3VyY2Ugfi8uY2FyZ28vZW52ICYmIG1ha2UgbmVhcmRcIicsXG4gICAgICAgICAgICAnJyxcbiAgICAgICAgICAgICcjIEluc3RhbGwgbmVhcnVwIChVYnVudHUgMjQuMDQgcmVxdWlyZXMgLS1icmVhay1zeXN0ZW0tcGFja2FnZXMpJyxcbiAgICAgICAgICAgICdzdSAtIHVidW50dSAtYyBcInBpcDMgaW5zdGFsbCAtLXVzZXIgLS1icmVhay1zeXN0ZW0tcGFja2FnZXMgbmVhcnVwXCInLFxuICAgICAgICAgICAgJycsXG4gICAgICAgICAgICAnIyBSdW4gbmVhcnVwIGxvY2FsbmV0IHdpdGggY29tcGlsZWQgYmluYXJ5JyxcbiAgICAgICAgICAgICdzdSAtIHVidW50dSAtYyBcImV4cG9ydCBQQVRIPSRQQVRIOn4vLmxvY2FsL2JpbiAmJiBuZWFydXAgcnVuIGxvY2FsbmV0IC0tYmluYXJ5LXBhdGggfi9uZWFyY29yZS90YXJnZXQvcmVsZWFzZVwiID4gL3Zhci9sb2cvbmVhcnVwLmxvZyAyPiYxICYnLFxuICAgICAgICAgICAgJycsXG4gICAgICAgICAgICAnIyBXYWl0IGZvciBORUFSIHRvIGluaXRpYWxpemUnLFxuICAgICAgICAgICAgJ3NsZWVwIDYwJyxcbiAgICAgICAgICAgICcnLFxuICAgICAgICAgICAgJ2VjaG8gXCJORUFSIGxvY2FsbmV0IGluaXRpYWxpemF0aW9uIGNvbXBsZXRlXCIgPiAvdmFyL2xvZy9uZWFyLWluaXQtY29tcGxldGUubG9nJ1xuICAgICAgICApO1xuXG4gICAgICAgIC8vIENyZWF0ZSBFQzIgaW5zdGFuY2UgKGZvbGxvd2luZyB3b3JraW5nIGNoYWluLW1vYmlsIGltcGxlbWVudGF0aW9uKVxuICAgICAgICAvLyBDaGFuZ2VkIElEIHRvIGZvcmNlIHJlcGxhY2VtZW50IHdoZW4gdmVyc2lvbiB1cGRhdGVzXG4gICAgICAgIHRoaXMuaW5zdGFuY2UgPSBuZXcgZWMyLkluc3RhbmNlKHRoaXMsIGBOZWFyTG9jYWxuZXROb2RlViR7bmVhclZlcnNpb24ucmVwbGFjZSgvXFwuL2csIFwiXCIpfWAsIHtcbiAgICAgICAgICAgIHZwYzogdGhpcy52cGMsXG4gICAgICAgICAgICBpbnN0YW5jZVR5cGU6IGVjMkluc3RhbmNlVHlwZSxcbiAgICAgICAgICAgIG1hY2hpbmVJbWFnZSxcbiAgICAgICAgICAgIHNlY3VyaXR5R3JvdXA6IHRoaXMuc2VjdXJpdHlHcm91cCxcbiAgICAgICAgICAgIHJvbGU6IHRoaXMuaW5zdGFuY2VSb2xlLFxuICAgICAgICAgICAgdXNlckRhdGEsIC8vIFNldCBVc2VyRGF0YSBkaXJlY3RseSAoZm9sbG93aW5nIHdvcmtpbmcgY2hhaW4tbW9iaWwgaW1wbGVtZW50YXRpb24pXG4gICAgICAgICAgICB2cGNTdWJuZXRzOiB7IHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBVQkxJQyB9LCAvLyBGb3Igb3V0Ym91bmQgaW50ZXJuZXQgKGRvd25sb2FkIFJ1c3QsIG5lYXJjb3JlKVxuICAgICAgICAgICAgc3NtU2Vzc2lvblBlcm1pc3Npb25zOiB0cnVlLCAvLyBFbmFibGUgU1NNIFNlc3Npb24gTWFuYWdlclxuICAgICAgICAgICAgLy8gSW5jcmVhc2Ugcm9vdCB2b2x1bWUgc2l6ZSBmb3IgUnVzdCBjb21waWxhdGlvbiAoZGVmYXVsdCA4R0IgaXMgdG9vIHNtYWxsKVxuICAgICAgICAgICAgYmxvY2tEZXZpY2VzOiBbe1xuICAgICAgICAgICAgICAgIGRldmljZU5hbWU6IFwiL2Rldi9zZGExXCIsIC8vIFVidW50dSByb290IGRldmljZVxuICAgICAgICAgICAgICAgIHZvbHVtZTogZWMyLkJsb2NrRGV2aWNlVm9sdW1lLmVicyhkYXRhVm9sdW1lLnNpemVHaUIsIHtcbiAgICAgICAgICAgICAgICAgICAgdm9sdW1lVHlwZTogZWMyLkVic0RldmljZVZvbHVtZVR5cGUuR1AzLFxuICAgICAgICAgICAgICAgICAgICBkZWxldGVPblRlcm1pbmF0aW9uOiB0cnVlLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgfV0sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFN0b3JlIHRoZSBsb2dpY2FsIElEIGZvciBjZm4tc2lnbmFsXG4gICAgICAgIGNvbnN0IG5vZGVDRkxvZ2ljYWxJZCA9IHRoaXMuaW5zdGFuY2Uubm9kZS5kZWZhdWx0Q2hpbGQ/Lm5vZGUuaWQgfHwgXCJOZWFyTG9jYWxuZXROb2RlXCI7XG5cbiAgICAgICAgLy8gQWRkIHZlcnNpb24gdGFnIHRvIGZvcmNlIHJlcGxhY2VtZW50IHdoZW4gdmVyc2lvbiBjaGFuZ2VzXG4gICAgICAgIGNkay5UYWdzLm9mKHRoaXMuaW5zdGFuY2UpLmFkZChcIk5lYXJWZXJzaW9uXCIsIG5lYXJWZXJzaW9uKTtcblxuICAgICAgICB0aGlzLmluc3RhbmNlSWQgPSB0aGlzLmluc3RhbmNlLmluc3RhbmNlSWQ7XG5cbiAgICAgICAgLy8gU3RhY2sgb3V0cHV0c1xuICAgICAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIm5lYXItaW5zdGFuY2UtaWRcIiwge1xuICAgICAgICAgICAgdmFsdWU6IHRoaXMuaW5zdGFuY2VJZCxcbiAgICAgICAgICAgIGV4cG9ydE5hbWU6IFwiTmVhckxvY2FsbmV0SW5zdGFuY2VJZFwiLFxuICAgICAgICB9KTtcblxuICAgICAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIm5lYXItaW5zdGFuY2UtcHJpdmF0ZS1pcFwiLCB7XG4gICAgICAgICAgICB2YWx1ZTogdGhpcy5pbnN0YW5jZS5pbnN0YW5jZVByaXZhdGVJcCxcbiAgICAgICAgICAgIGV4cG9ydE5hbWU6IFwiTmVhckxvY2FsbmV0SW5zdGFuY2VQcml2YXRlSXBcIixcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJuZWFyLWluc3RhbmNlLXB1YmxpYy1pcFwiLCB7XG4gICAgICAgICAgICB2YWx1ZTogdGhpcy5pbnN0YW5jZS5pbnN0YW5jZVB1YmxpY0lwIHx8IFwiTi9BXCIsXG4gICAgICAgICAgICBleHBvcnROYW1lOiBcIk5lYXJMb2NhbG5ldEluc3RhbmNlUHVibGljSXBcIixcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gQWRkaW5nIHN1cHByZXNzaW9ucyB0byB0aGUgc3RhY2tcbiAgICAgICAgbmFnLk5hZ1N1cHByZXNzaW9ucy5hZGRSZXNvdXJjZVN1cHByZXNzaW9ucyhcbiAgICAgICAgICAgIHRoaXMsXG4gICAgICAgICAgICBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBpZDogXCJBd3NTb2x1dGlvbnMtRUMyM1wiLFxuICAgICAgICAgICAgICAgICAgICByZWFzb246IFwiU1NIIGFjY2VzcyBuZWVkZWQgZm9yIGRlYnVnZ2luZywgUlBDIHJlc3RyaWN0ZWQgdG8gVlBDXCIsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGlkOiBcIkF3c1NvbHV0aW9ucy1FQzI2XCIsXG4gICAgICAgICAgICAgICAgICAgIHJlYXNvbjogXCJFQlMgZW5jcnlwdGlvbiBub3QgcmVxdWlyZWQgZm9yIGxvY2FsbmV0IGRldmVsb3BtZW50IGVudmlyb25tZW50XCIsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGlkOiBcIkF3c1NvbHV0aW9ucy1FQzI4XCIsXG4gICAgICAgICAgICAgICAgICAgIHJlYXNvbjogXCJEZXRhaWxlZCBtb25pdG9yaW5nIG5vdCByZXF1aXJlZCBmb3IgbG9jYWxuZXQgZGV2ZWxvcG1lbnQgZW52aXJvbm1lbnRcIixcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgaWQ6IFwiQXdzU29sdXRpb25zLUVDMjlcIixcbiAgICAgICAgICAgICAgICAgICAgcmVhc29uOiBcIlRlcm1pbmF0aW9uIHByb3RlY3Rpb24gbm90IHJlcXVpcmVkIGZvciBsb2NhbG5ldCBkZXZlbG9wbWVudCBlbnZpcm9ubWVudFwiLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgIH1cbn1cblxuIl19
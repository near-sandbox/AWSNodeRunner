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
        this.instance = new ec2.Instance(this, "NearLocalnetNode", {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5mcmFzdHJ1Y3R1cmUtc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmZyYXN0cnVjdHVyZS1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFFbkMseURBQTJDO0FBRTNDLDZDQUErQjtBQWUvQixNQUFhLHVCQUF3QixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBT2xELFlBQVksS0FBOEIsRUFBRSxFQUFVLEVBQUUsS0FBbUM7UUFDdkYsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxNQUFNLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDO1FBQ3pDLE1BQU0sVUFBVSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUNoRCxNQUFNLFFBQVEsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUM7UUFFNUMsTUFBTSxFQUNGLFlBQVksRUFDWixlQUFlLEVBQ2YsV0FBVyxFQUNYLFdBQVcsRUFDWCxVQUFVLEVBQ1YsR0FBRyxFQUNILGFBQWEsRUFDYixZQUFZLEdBQ2YsR0FBRyxLQUFLLENBQUM7UUFFVixtRUFBbUU7UUFDbkUsSUFBSSxHQUFHLElBQUksYUFBYSxJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ3ZDLElBQUksQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO1lBQ2YsSUFBSSxDQUFDLGFBQWEsR0FBRyxhQUFhLENBQUM7WUFDbkMsSUFBSSxDQUFDLFlBQVksR0FBRyxZQUFZLENBQUM7UUFDckMsQ0FBQzthQUFNLENBQUM7WUFDSixxRkFBcUY7WUFDckYsTUFBTSxLQUFLLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FB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QUFFLHVFQUF1RTthQUNsRjtZQUNEO2dCQUNJLEVBQUUsRUFBRSxtQkFBbUI7Z0JBQ3ZCLE1BQU0sRUFBRSwwRUFBMEU7YUFDckY7U0FDSixFQUNELElBQUksQ0FDUCxDQUFDO0lBQ04sQ0FBQztDQUNKO0FBOUpELDBEQThKQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCAqIGFzIGNka0NvbnN0cnVjdHMgZnJvbSBcImNvbnN0cnVjdHNcIjtcbmltcG9ydCAqIGFzIGVjMiBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWVjMlwiO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtaWFtXCI7XG5pbXBvcnQgKiBhcyBuYWcgZnJvbSBcImNkay1uYWdcIjtcbmltcG9ydCAqIGFzIGNvbmZpZ1R5cGVzIGZyb20gXCIuL2NvbmZpZy9ub2RlLWNvbmZpZy5pbnRlcmZhY2VcIjtcblxuZXhwb3J0IGludGVyZmFjZSBOZWFySW5mcmFzdHJ1Y3R1cmVTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICAgIGluc3RhbmNlVHlwZTogc3RyaW5nO1xuICAgIGluc3RhbmNlQ3B1VHlwZTogXCJ4ODZfNjRcIiB8IFwiYXJtNjRcIjtcbiAgICBuZWFyTmV0d29yazogY29uZmlnVHlwZXMuTmVhck5ldHdvcms7XG4gICAgbmVhclZlcnNpb246IHN0cmluZztcbiAgICBkYXRhVm9sdW1lOiBjb25maWdUeXBlcy5OZWFyRGF0YVZvbHVtZUNvbmZpZztcbiAgICBsaW1pdE91dFRyYWZmaWNNYnBzOiBudW1iZXI7XG4gICAgdnBjPzogZWMyLklWcGM7XG4gICAgc2VjdXJpdHlHcm91cD86IGVjMi5JU2VjdXJpdHlHcm91cDtcbiAgICBpbnN0YW5jZVJvbGU/OiBpYW0uSVJvbGU7XG59XG5cbmV4cG9ydCBjbGFzcyBOZWFySW5mcmFzdHJ1Y3R1cmVTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gICAgcHVibGljIHJlYWRvbmx5IGluc3RhbmNlSWQ6IHN0cmluZztcbiAgICBwdWJsaWMgcmVhZG9ubHkgaW5zdGFuY2U6IGVjMi5JbnN0YW5jZTtcbiAgICBwdWJsaWMgcmVhZG9ubHkgaW5zdGFuY2VSb2xlOiBpYW0uSVJvbGU7XG4gICAgcHVibGljIHJlYWRvbmx5IHZwYzogZWMyLklWcGM7XG4gICAgcHVibGljIHJlYWRvbmx5IHNlY3VyaXR5R3JvdXA6IGVjMi5JU2VjdXJpdHlHcm91cDtcblxuICAgIGNvbnN0cnVjdG9yKHNjb3BlOiBjZGtDb25zdHJ1Y3RzLkNvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IE5lYXJJbmZyYXN0cnVjdHVyZVN0YWNrUHJvcHMpIHtcbiAgICAgICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAgICAgY29uc3QgUkVHSU9OID0gY2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvbjtcbiAgICAgICAgY29uc3QgU1RBQ0tfTkFNRSA9IGNkay5TdGFjay5vZih0aGlzKS5zdGFja05hbWU7XG4gICAgICAgIGNvbnN0IFNUQUNLX0lEID0gY2RrLlN0YWNrLm9mKHRoaXMpLnN0YWNrSWQ7XG5cbiAgICAgICAgY29uc3Qge1xuICAgICAgICAgICAgaW5zdGFuY2VUeXBlLFxuICAgICAgICAgICAgaW5zdGFuY2VDcHVUeXBlLFxuICAgICAgICAgICAgbmVhck5ldHdvcmssXG4gICAgICAgICAgICBuZWFyVmVyc2lvbixcbiAgICAgICAgICAgIGRhdGFWb2x1bWUsXG4gICAgICAgICAgICB2cGMsXG4gICAgICAgICAgICBzZWN1cml0eUdyb3VwLFxuICAgICAgICAgICAgaW5zdGFuY2VSb2xlLFxuICAgICAgICB9ID0gcHJvcHM7XG5cbiAgICAgICAgLy8gVXNlIHByb3ZpZGVkIFZQQy9zZWN1cml0eSBncm91cC9yb2xlIG9yIGltcG9ydCBmcm9tIGNvbW1vbiBzdGFja1xuICAgICAgICBpZiAodnBjICYmIHNlY3VyaXR5R3JvdXAgJiYgaW5zdGFuY2VSb2xlKSB7XG4gICAgICAgICAgICB0aGlzLnZwYyA9IHZwYztcbiAgICAgICAgICAgIHRoaXMuc2VjdXJpdHlHcm91cCA9IHNlY3VyaXR5R3JvdXA7XG4gICAgICAgICAgICB0aGlzLmluc3RhbmNlUm9sZSA9IGluc3RhbmNlUm9sZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIEZhbGxiYWNrIHRvIGltcG9ydHMgKGZvciBjcm9zcy1zdGFjayByZWZlcmVuY2VzIHdoZW4gc3RhY2tzIGFyZSBpbiBkaWZmZXJlbnQgYXBwcylcbiAgICAgICAgICAgIGNvbnN0IHZwY0lkID0gY2RrLkZuLmltcG9ydFZhbHVlKFwiTmVhckxvY2FsbmV0VnBjSWRcIik7XG4gICAgICAgICAgICBjb25zdCBzZWN1cml0eUdyb3VwSWQgPSBjZGsuRm4uaW1wb3J0VmFsdWUoXCJOZWFyTG9jYWxuZXRTZWN1cml0eUdyb3VwSWRcIik7XG4gICAgICAgICAgICBjb25zdCBpbXBvcnRlZEluc3RhbmNlUm9sZUFybiA9IGNkay5Gbi5pbXBvcnRWYWx1ZShcIk5lYXJMb2NhbG5ldEluc3RhbmNlUm9sZUFyblwiKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gTm90ZTogVnBjLmZyb21Mb29rdXAgcmVxdWlyZXMgZW52aXJvbm1lbnQgY29udGV4dCBhbmQgd29uJ3Qgd29yayB3aXRoIGltcG9ydGVkIHZhbHVlc1xuICAgICAgICAgICAgLy8gVGhpcyBmYWxsYmFjayBpcyBmb3IgcmVmZXJlbmNlIGJ1dCBzaG91bGQgdXNlIGRpcmVjdCByZWZlcmVuY2VzIGluIGFwcC50c1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVlBDLCBzZWN1cml0eSBncm91cCwgYW5kIGluc3RhbmNlIHJvbGUgbXVzdCBiZSBwcm92aWRlZCBkaXJlY3RseSB3aGVuIHN0YWNrcyBhcmUgaW4gdGhlIHNhbWUgYXBwXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gVWJ1bnR1IDI0LjA0IExUUyBpbWFnZSBmb3IgYW1kNjQgKHg4Nl82NCByZXF1aXJlZCBmb3IgTkVBUilcbiAgICAgICAgbGV0IHVidW50dVN0YWJsZUltYWdlU3NtTmFtZSA9IFwiL2F3cy9zZXJ2aWNlL2Nhbm9uaWNhbC91YnVudHUvc2VydmVyLzI0LjA0L3N0YWJsZS9jdXJyZW50L2FtZDY0L2h2bS9lYnMtZ3AzL2FtaS1pZFwiO1xuICAgICAgICBpZiAoaW5zdGFuY2VDcHVUeXBlID09PSBcImFybTY0XCIpIHtcbiAgICAgICAgICAgIHVidW50dVN0YWJsZUltYWdlU3NtTmFtZSA9IFwiL2F3cy9zZXJ2aWNlL2Nhbm9uaWNhbC91YnVudHUvc2VydmVyLzI0LjA0L3N0YWJsZS9jdXJyZW50L2FybTY0L2h2bS9lYnMtZ3AzL2FtaS1pZFwiO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IG1hY2hpbmVJbWFnZSA9IGVjMi5NYWNoaW5lSW1hZ2UuZnJvbVNzbVBhcmFtZXRlcih1YnVudHVTdGFibGVJbWFnZVNzbU5hbWUpO1xuXG4gICAgICAgIC8vIFBhcnNlIGluc3RhbmNlIHR5cGUgLSBDREsgZXhwZWN0cyBJbnN0YW5jZUNsYXNzIGVudW0gYW5kIEluc3RhbmNlU2l6ZSBlbnVtXG4gICAgICAgIC8vIFwidDMubGFyZ2VcIiAtPiBJbnN0YW5jZUNsYXNzLlQzLCBJbnN0YW5jZVNpemUuTEFSR0VcbiAgICAgICAgY29uc3QgW2luc3RhbmNlQ2xhc3NTdHIsIGluc3RhbmNlU2l6ZVN0cl0gPSBpbnN0YW5jZVR5cGUudG9Mb3dlckNhc2UoKS5zcGxpdChcIi5cIik7XG4gICAgICAgIC8vIENvbnZlcnQgXCJ0M1wiIC0+IFwiVDNcIiBmb3IgSW5zdGFuY2VDbGFzcyBlbnVtXG4gICAgICAgIGNvbnN0IGluc3RhbmNlQ2xhc3MgPSAoaW5zdGFuY2VDbGFzc1N0ci5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGluc3RhbmNlQ2xhc3NTdHIuc2xpY2UoMSkpLnRvVXBwZXJDYXNlKCkgYXMgZWMyLkluc3RhbmNlQ2xhc3M7XG4gICAgICAgIGNvbnN0IGluc3RhbmNlU2l6ZSA9IGluc3RhbmNlU2l6ZVN0ci50b1VwcGVyQ2FzZSgpIGFzIGVjMi5JbnN0YW5jZVNpemU7XG4gICAgICAgIGNvbnN0IGVjMkluc3RhbmNlVHlwZSA9IG5ldyBlYzIuSW5zdGFuY2VUeXBlKGAke2luc3RhbmNlQ2xhc3NTdHJ9LiR7aW5zdGFuY2VTaXplU3RyfWApO1xuXG4gICAgICAgIC8vIFVzZXJEYXRhIHNjcmlwdCBmb2xsb3dpbmcgdGhlIHdvcmtpbmcgaW1wbGVtZW50YXRpb24gZnJvbSBjaGFpbi1tb2JpbC9jZGtcbiAgICAgICAgLy8gVGhpcyBjb21waWxlcyBhbmQgcnVucyBuZWFyZCBvbiBVYnVudHUgcGVyIE5FQVIncyByZWNvbW1lbmRhdGlvbnNcbiAgICAgICAgY29uc3QgdXNlckRhdGEgPSBlYzIuVXNlckRhdGEuZm9yTGludXgoKTtcbiAgICAgICAgdXNlckRhdGEuYWRkQ29tbWFuZHMoXG4gICAgICAgICAgICAnIyEvYmluL2Jhc2gnLFxuICAgICAgICAgICAgJ3NldCAtZScsXG4gICAgICAgICAgICAnZXhlYyA+ID4odGVlIC92YXIvbG9nL25lYXItc2V0dXAubG9nKSAyPiYxJyxcbiAgICAgICAgICAgICcnLFxuICAgICAgICAgICAgJyMgVXBkYXRlIHN5c3RlbScsXG4gICAgICAgICAgICAnYXB0IHVwZGF0ZScsXG4gICAgICAgICAgICAnJyxcbiAgICAgICAgICAgICcjIEluc3RhbGwgZGVwZW5kZW5jaWVzIGZvciBORUFSIGNvbXBpbGF0aW9uIChVYnVudHUgcGFja2FnZXMpJyxcbiAgICAgICAgICAgICdhcHQgaW5zdGFsbCAteSBnaXQgYmludXRpbHMtZGV2IGxpYmN1cmw0LW9wZW5zc2wtZGV2IHpsaWIxZy1kZXYgbGliZHctZGV2IGxpYmliZXJ0eS1kZXYgY21ha2UgZ2NjIGcrKyBweXRob24zIHB5dGhvbjMtcGlwIHByb3RvYnVmLWNvbXBpbGVyIGxpYnNzbC1kZXYgcGtnLWNvbmZpZyBjbGFuZyBsbHZtJyxcbiAgICAgICAgICAgICcnLFxuICAgICAgICAgICAgJyMgSW5zdGFsbCBSdXN0IGFzIHVidW50dSB1c2VyJyxcbiAgICAgICAgICAgICdzdSAtIHVidW50dSAtYyBcImN1cmwgLS1wcm90byA9aHR0cHMgLS10bHN2MS4yIC1zU2YgaHR0cHM6Ly9zaC5ydXN0dXAucnMgfCBzaCAtcyAtLSAteVwiJyxcbiAgICAgICAgICAgICdzdSAtIHVidW50dSAtYyBcInNvdXJjZSB+Ly5jYXJnby9lbnYgJiYgcnVzdGMgLS12ZXJzaW9uXCInLFxuICAgICAgICAgICAgJycsXG4gICAgICAgICAgICAnIyBDbG9uZSBuZWFyY29yZScsXG4gICAgICAgICAgICAnc3UgLSB1YnVudHUgLWMgXCJjZCB+ICYmIGdpdCBjbG9uZSBodHRwczovL2dpdGh1Yi5jb20vbmVhci9uZWFyY29yZS5naXRcIicsXG4gICAgICAgICAgICBgc3UgLSB1YnVudHUgLWMgXCJjZCB+L25lYXJjb3JlICYmIGdpdCBjaGVja291dCAke25lYXJWZXJzaW9ufVwiYCxcbiAgICAgICAgICAgICcnLFxuICAgICAgICAgICAgJyMgQ29tcGlsZSBuZWFyZCAodGFrZXMgfjEwLTE1IG1pbnV0ZXMpJyxcbiAgICAgICAgICAgICdzdSAtIHVidW50dSAtYyBcImNkIH4vbmVhcmNvcmUgJiYgc291cmNlIH4vLmNhcmdvL2VudiAmJiBtYWtlIG5lYXJkXCInLFxuICAgICAgICAgICAgJycsXG4gICAgICAgICAgICAnIyBJbnN0YWxsIG5lYXJ1cCAoVWJ1bnR1IDI0LjA0IHJlcXVpcmVzIC0tYnJlYWstc3lzdGVtLXBhY2thZ2VzKScsXG4gICAgICAgICAgICAnc3UgLSB1YnVudHUgLWMgXCJwaXAzIGluc3RhbGwgLS11c2VyIC0tYnJlYWstc3lzdGVtLXBhY2thZ2VzIG5lYXJ1cFwiJyxcbiAgICAgICAgICAgICcnLFxuICAgICAgICAgICAgJyMgUnVuIG5lYXJ1cCBsb2NhbG5ldCB3aXRoIGNvbXBpbGVkIGJpbmFyeScsXG4gICAgICAgICAgICAnc3UgLSB1YnVudHUgLWMgXCJleHBvcnQgUEFUSD0kUEFUSDp+Ly5sb2NhbC9iaW4gJiYgbmVhcnVwIHJ1biBsb2NhbG5ldCAtLWJpbmFyeS1wYXRoIH4vbmVhcmNvcmUvdGFyZ2V0L3JlbGVhc2VcIiA+IC92YXIvbG9nL25lYXJ1cC5sb2cgMj4mMSAmJyxcbiAgICAgICAgICAgICcnLFxuICAgICAgICAgICAgJyMgV2FpdCBmb3IgTkVBUiB0byBpbml0aWFsaXplJyxcbiAgICAgICAgICAgICdzbGVlcCA2MCcsXG4gICAgICAgICAgICAnJyxcbiAgICAgICAgICAgICdlY2hvIFwiTkVBUiBsb2NhbG5ldCBpbml0aWFsaXphdGlvbiBjb21wbGV0ZVwiID4gL3Zhci9sb2cvbmVhci1pbml0LWNvbXBsZXRlLmxvZydcbiAgICAgICAgKTtcblxuICAgICAgICAvLyBDcmVhdGUgRUMyIGluc3RhbmNlIChmb2xsb3dpbmcgd29ya2luZyBjaGFpbi1tb2JpbCBpbXBsZW1lbnRhdGlvbilcbiAgICAgICAgdGhpcy5pbnN0YW5jZSA9IG5ldyBlYzIuSW5zdGFuY2UodGhpcywgXCJOZWFyTG9jYWxuZXROb2RlXCIsIHtcbiAgICAgICAgICAgIHZwYzogdGhpcy52cGMsXG4gICAgICAgICAgICBpbnN0YW5jZVR5cGU6IGVjMkluc3RhbmNlVHlwZSxcbiAgICAgICAgICAgIG1hY2hpbmVJbWFnZSxcbiAgICAgICAgICAgIHNlY3VyaXR5R3JvdXA6IHRoaXMuc2VjdXJpdHlHcm91cCxcbiAgICAgICAgICAgIHJvbGU6IHRoaXMuaW5zdGFuY2VSb2xlLFxuICAgICAgICAgICAgdXNlckRhdGEsIC8vIFNldCBVc2VyRGF0YSBkaXJlY3RseSAoZm9sbG93aW5nIHdvcmtpbmcgY2hhaW4tbW9iaWwgaW1wbGVtZW50YXRpb24pXG4gICAgICAgICAgICB2cGNTdWJuZXRzOiB7IHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBVQkxJQyB9LCAvLyBGb3Igb3V0Ym91bmQgaW50ZXJuZXQgKGRvd25sb2FkIFJ1c3QsIG5lYXJjb3JlKVxuICAgICAgICAgICAgc3NtU2Vzc2lvblBlcm1pc3Npb25zOiB0cnVlLCAvLyBFbmFibGUgU1NNIFNlc3Npb24gTWFuYWdlclxuICAgICAgICAgICAgLy8gSW5jcmVhc2Ugcm9vdCB2b2x1bWUgc2l6ZSBmb3IgUnVzdCBjb21waWxhdGlvbiAoZGVmYXVsdCA4R0IgaXMgdG9vIHNtYWxsKVxuICAgICAgICAgICAgYmxvY2tEZXZpY2VzOiBbe1xuICAgICAgICAgICAgICAgIGRldmljZU5hbWU6IFwiL2Rldi9zZGExXCIsIC8vIFVidW50dSByb290IGRldmljZVxuICAgICAgICAgICAgICAgIHZvbHVtZTogZWMyLkJsb2NrRGV2aWNlVm9sdW1lLmVicyhkYXRhVm9sdW1lLnNpemVHaUIsIHtcbiAgICAgICAgICAgICAgICAgICAgdm9sdW1lVHlwZTogZWMyLkVic0RldmljZVZvbHVtZVR5cGUuR1AzLFxuICAgICAgICAgICAgICAgICAgICBkZWxldGVPblRlcm1pbmF0aW9uOiB0cnVlLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgfV0sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFN0b3JlIHRoZSBsb2dpY2FsIElEIGZvciBjZm4tc2lnbmFsXG4gICAgICAgIGNvbnN0IG5vZGVDRkxvZ2ljYWxJZCA9IHRoaXMuaW5zdGFuY2Uubm9kZS5kZWZhdWx0Q2hpbGQ/Lm5vZGUuaWQgfHwgXCJOZWFyTG9jYWxuZXROb2RlXCI7XG5cbiAgICAgICAgdGhpcy5pbnN0YW5jZUlkID0gdGhpcy5pbnN0YW5jZS5pbnN0YW5jZUlkO1xuXG4gICAgICAgIC8vIFN0YWNrIG91dHB1dHNcbiAgICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJuZWFyLWluc3RhbmNlLWlkXCIsIHtcbiAgICAgICAgICAgIHZhbHVlOiB0aGlzLmluc3RhbmNlSWQsXG4gICAgICAgICAgICBleHBvcnROYW1lOiBcIk5lYXJMb2NhbG5ldEluc3RhbmNlSWRcIixcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJuZWFyLWluc3RhbmNlLXByaXZhdGUtaXBcIiwge1xuICAgICAgICAgICAgdmFsdWU6IHRoaXMuaW5zdGFuY2UuaW5zdGFuY2VQcml2YXRlSXAsXG4gICAgICAgICAgICBleHBvcnROYW1lOiBcIk5lYXJMb2NhbG5ldEluc3RhbmNlUHJpdmF0ZUlwXCIsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwibmVhci1pbnN0YW5jZS1wdWJsaWMtaXBcIiwge1xuICAgICAgICAgICAgdmFsdWU6IHRoaXMuaW5zdGFuY2UuaW5zdGFuY2VQdWJsaWNJcCB8fCBcIk4vQVwiLFxuICAgICAgICAgICAgZXhwb3J0TmFtZTogXCJOZWFyTG9jYWxuZXRJbnN0YW5jZVB1YmxpY0lwXCIsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEFkZGluZyBzdXBwcmVzc2lvbnMgdG8gdGhlIHN0YWNrXG4gICAgICAgIG5hZy5OYWdTdXBwcmVzc2lvbnMuYWRkUmVzb3VyY2VTdXBwcmVzc2lvbnMoXG4gICAgICAgICAgICB0aGlzLFxuICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgaWQ6IFwiQXdzU29sdXRpb25zLUVDMjNcIixcbiAgICAgICAgICAgICAgICAgICAgcmVhc29uOiBcIlNTSCBhY2Nlc3MgbmVlZGVkIGZvciBkZWJ1Z2dpbmcsIFJQQyByZXN0cmljdGVkIHRvIFZQQ1wiLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBpZDogXCJBd3NTb2x1dGlvbnMtRUMyNlwiLFxuICAgICAgICAgICAgICAgICAgICByZWFzb246IFwiRUJTIGVuY3J5cHRpb24gbm90IHJlcXVpcmVkIGZvciBsb2NhbG5ldCBkZXZlbG9wbWVudCBlbnZpcm9ubWVudFwiLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBpZDogXCJBd3NTb2x1dGlvbnMtRUMyOFwiLFxuICAgICAgICAgICAgICAgICAgICByZWFzb246IFwiRGV0YWlsZWQgbW9uaXRvcmluZyBub3QgcmVxdWlyZWQgZm9yIGxvY2FsbmV0IGRldmVsb3BtZW50IGVudmlyb25tZW50XCIsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGlkOiBcIkF3c1NvbHV0aW9ucy1FQzI5XCIsXG4gICAgICAgICAgICAgICAgICAgIHJlYXNvbjogXCJUZXJtaW5hdGlvbiBwcm90ZWN0aW9uIG5vdCByZXF1aXJlZCBmb3IgbG9jYWxuZXQgZGV2ZWxvcG1lbnQgZW52aXJvbm1lbnRcIixcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcbiAgICB9XG59XG5cbiJdfQ==
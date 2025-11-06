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
exports.NearSyncStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const ssm = __importStar(require("aws-cdk-lib/aws-ssm"));
const cw = __importStar(require("aws-cdk-lib/aws-cloudwatch"));
const nag = __importStar(require("cdk-nag"));
class NearSyncStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { nearNetwork } = props;
        // Import values from previous stacks
        const instanceId = cdk.Fn.importValue("NearLocalnetInstanceId");
        const instancePrivateIp = cdk.Fn.importValue("NearLocalnetInstancePrivateIp");
        const installStatus = cdk.Fn.importValue("NearLocalnetInstallStatus");
        // For localnet, nearup is already running from UserData script
        // This stack validates the service is running and exposes RPC endpoint
        const validateServiceDoc = new ssm.CfnDocument(this, "near-validate-service", {
            documentType: "Command",
            documentFormat: "YAML",
            name: `near-validate-service-${this.stackName}`,
            content: {
                schemaVersion: "2.2",
                description: "Validate NEAR localnet service is running",
                parameters: {
                    nearNetwork: {
                        type: "String",
                        description: "NEAR network",
                        default: nearNetwork
                    }
                },
                mainSteps: [
                    {
                        action: "aws:runShellScript",
                        name: "validateServiceRunning",
                        inputs: {
                            timeoutSeconds: "300",
                            runCommand: [
                                "#!/bin/bash",
                                "set -euo pipefail",
                                "echo '[SYNC-STACK] Validating NEAR localnet service...'",
                                "",
                                "# Check if nearup process is running",
                                "if ! pgrep -f 'nearup' > /dev/null; then",
                                "  echo '[SYNC-STACK] ERROR: nearup process not found'",
                                "  exit 1",
                                "fi",
                                "",
                                "# Wait for RPC endpoint to be available",
                                "MAX_WAIT=300",
                                "ELAPSED=0",
                                "while [ $ELAPSED -lt $MAX_WAIT ]; do",
                                "  if curl -s http://127.0.0.1:3030/status > /dev/null 2>&1; then",
                                "    echo '[SYNC-STACK] RPC endpoint is available'",
                                "    break",
                                "  fi",
                                "  echo '[SYNC-STACK] Waiting for RPC endpoint... ($ELAPSED seconds)'",
                                "  sleep 10",
                                "  ELAPSED=$((ELAPSED + 10))",
                                "done",
                                "",
                                "# Final check",
                                "if ! curl -s http://127.0.0.1:3030/status > /dev/null 2>&1; then",
                                "  echo '[SYNC-STACK] ERROR: RPC endpoint not available after $MAX_WAIT seconds'",
                                "  exit 1",
                                "fi",
                                "",
                                "# Get status for verification",
                                "STATUS=$(curl -s http://127.0.0.1:3030/status | jq -r '.chain_id // \"unknown\"')",
                                "echo '[SYNC-STACK] NEAR localnet chain_id: $STATUS'",
                                "echo '[SYNC-STACK] Service validation complete'"
                            ]
                        }
                    }
                ]
            }
        });
        // Execute the validation via SSM association
        const validateExecution = new ssm.CfnAssociation(this, "near-validate-service-execution", {
            name: validateServiceDoc.ref,
            targets: [
                {
                    key: "InstanceIds",
                    values: [instanceId]
                }
            ],
            parameters: {
                nearNetwork: [nearNetwork]
            },
            applyOnlyAtCronInterval: false,
            maxConcurrency: "1",
            maxErrors: "0"
        });
        // Construct RPC URL
        this.rpcUrl = `http://${instancePrivateIp}:3030`;
        // Create CloudWatch dashboard for monitoring
        const dashboard = new cw.Dashboard(this, "near-localnet-dashboard", {
            dashboardName: `near-localnet-${this.stackName}`,
            widgets: [
                [
                    new cw.GraphWidget({
                        title: "Instance Status",
                        left: [
                            new cw.Metric({
                                namespace: "AWS/EC2",
                                metricName: "CPUUtilization",
                                dimensionsMap: { InstanceId: instanceId },
                                statistic: "Average"
                            })
                        ],
                        right: [
                            new cw.Metric({
                                namespace: "AWS/EC2",
                                metricName: "NetworkIn",
                                dimensionsMap: { InstanceId: instanceId },
                                statistic: "Sum"
                            }),
                            new cw.Metric({
                                namespace: "AWS/EC2",
                                metricName: "NetworkOut",
                                dimensionsMap: { InstanceId: instanceId },
                                statistic: "Sum"
                            })
                        ],
                        width: 12,
                        height: 6
                    })
                ]
            ]
        });
        // Stack outputs
        new cdk.CfnOutput(this, "sync-status", {
            value: validateExecution.ref,
            exportName: "NearLocalnetSyncStatus",
        });
        new cdk.CfnOutput(this, "near-rpc-url", {
            value: this.rpcUrl,
            description: "NEAR localnet RPC endpoint",
            exportName: "NearLocalnetRpcUrl"
        });
        new cdk.CfnOutput(this, "near-network-id", {
            value: "localnet",
            description: "NEAR network identifier",
            exportName: "NearLocalnetNetworkId"
        });
        this.syncStatus = "Service validation initiated";
        // Adding suppressions to the stack
        nag.NagSuppressions.addResourceSuppressions(this, [
            {
                id: "AwsSolutions-IAM5",
                reason: "SSM wildcard permissions needed for command execution",
            },
        ], true);
    }
}
exports.NearSyncStack = NearSyncStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3luYy1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInN5bmMtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBRW5DLHlEQUEyQztBQUMzQywrREFBaUQ7QUFDakQsNkNBQStCO0FBUS9CLE1BQWEsYUFBYyxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBSXhDLFlBQVksS0FBOEIsRUFBRSxFQUFVLEVBQUUsS0FBeUI7UUFDN0UsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLFdBQVcsRUFBRSxHQUFHLEtBQUssQ0FBQztRQUU5QixxQ0FBcUM7UUFDckMsTUFBTSxVQUFVLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsd0JBQXdCLENBQUMsQ0FBQztRQUNoRSxNQUFNLGlCQUFpQixHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLCtCQUErQixDQUFDLENBQUM7UUFDOUUsTUFBTSxhQUFhLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsMkJBQTJCLENBQUMsQ0FBQztRQUV0RSwrREFBK0Q7UUFDL0QsdUVBQXVFO1FBQ3ZFLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxHQUFHLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSx1QkFBdUIsRUFBRTtZQUMxRSxZQUFZLEVBQUUsU0FBUztZQUN2QixjQUFjLEVBQUUsTUFBTTtZQUN0QixJQUFJLEVBQUUseUJBQXlCLElBQUksQ0FBQyxTQUFTLEVBQUU7WUFDL0MsT0FBTyxFQUFFO2dCQUNMLGFBQWEsRUFBRSxLQUFLO2dCQUNwQixXQUFXLEVBQUUsMkNBQTJDO2dCQUN4RCxVQUFVLEVBQUU7b0JBQ1IsV0FBVyxFQUFFO3dCQUNULElBQUksRUFBRSxRQUFRO3dCQUNkLFdBQVcsRUFBRSxjQUFjO3dCQUMzQixP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SSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUU7WUFDbkMsS0FBSyxFQUFFLGlCQUFpQixDQUFDLEdBQUc7WUFDNUIsVUFBVSxFQUFFLHdCQUF3QjtTQUN2QyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRTtZQUNwQyxLQUFLLEVBQUUsSUFBSSxDQUFDLE1BQU07WUFDbEIsV0FBVyxFQUFFLDRCQUE0QjtZQUN6QyxVQUFVLEVBQUUsb0JBQW9CO1NBQ25DLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUU7WUFDdkMsS0FBSyxFQUFFLFVBQVU7WUFDakIsV0FBVyxFQUFFLHlCQUF5QjtZQUN0QyxVQUFVLEVBQUUsdUJBQXVCO1NBQ3RDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxVQUFVLEdBQUcsOEJBQThCLENBQUM7UUFFakQsbUNBQW1DO1FBQ25DLEdBQUcsQ0FBQyxlQUFlLENBQUMsdUJBQXVCLENBQ3ZDLElBQUksRUFDSjtZQUNJO2dCQUNJLEVBQUUsRUFBRSxtQkFBbUI7Z0JBQ3ZCLE1BQU0sRUFBRSx1REFBdUQ7YUFDbEU7U0FDSixFQUNELElBQUksQ0FDUCxDQUFDO0lBQ04sQ0FBQztDQUNKO0FBcktELHNDQXFLQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCAqIGFzIGNka0NvbnN0cnVjdHMgZnJvbSBcImNvbnN0cnVjdHNcIjtcbmltcG9ydCAqIGFzIHNzbSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXNzbVwiO1xuaW1wb3J0ICogYXMgY3cgZnJvbSBcImF3cy1jZGstbGliL2F3cy1jbG91ZHdhdGNoXCI7XG5pbXBvcnQgKiBhcyBuYWcgZnJvbSBcImNkay1uYWdcIjtcbmltcG9ydCAqIGFzIGNvbmZpZ1R5cGVzIGZyb20gXCIuL2NvbmZpZy9ub2RlLWNvbmZpZy5pbnRlcmZhY2VcIjtcblxuZXhwb3J0IGludGVyZmFjZSBOZWFyU3luY1N0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gICAgbmVhck5ldHdvcms6IGNvbmZpZ1R5cGVzLk5lYXJOZXR3b3JrO1xuICAgIG5lYXJWZXJzaW9uOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBOZWFyU3luY1N0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgICBwdWJsaWMgcmVhZG9ubHkgc3luY1N0YXR1czogc3RyaW5nO1xuICAgIHB1YmxpYyByZWFkb25seSBycGNVcmw6IHN0cmluZztcblxuICAgIGNvbnN0cnVjdG9yKHNjb3BlOiBjZGtDb25zdHJ1Y3RzLkNvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IE5lYXJTeW5jU3RhY2tQcm9wcykge1xuICAgICAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgICAgICBjb25zdCB7IG5lYXJOZXR3b3JrIH0gPSBwcm9wcztcblxuICAgICAgICAvLyBJbXBvcnQgdmFsdWVzIGZyb20gcHJldmlvdXMgc3RhY2tzXG4gICAgICAgIGNvbnN0IGluc3RhbmNlSWQgPSBjZGsuRm4uaW1wb3J0VmFsdWUoXCJOZWFyTG9jYWxuZXRJbnN0YW5jZUlkXCIpO1xuICAgICAgICBjb25zdCBpbnN0YW5jZVByaXZhdGVJcCA9IGNkay5Gbi5pbXBvcnRWYWx1ZShcIk5lYXJMb2NhbG5ldEluc3RhbmNlUHJpdmF0ZUlwXCIpO1xuICAgICAgICBjb25zdCBpbnN0YWxsU3RhdHVzID0gY2RrLkZuLmltcG9ydFZhbHVlKFwiTmVhckxvY2FsbmV0SW5zdGFsbFN0YXR1c1wiKTtcblxuICAgICAgICAvLyBGb3IgbG9jYWxuZXQsIG5lYXJ1cCBpcyBhbHJlYWR5IHJ1bm5pbmcgZnJvbSBVc2VyRGF0YSBzY3JpcHRcbiAgICAgICAgLy8gVGhpcyBzdGFjayB2YWxpZGF0ZXMgdGhlIHNlcnZpY2UgaXMgcnVubmluZyBhbmQgZXhwb3NlcyBSUEMgZW5kcG9pbnRcbiAgICAgICAgY29uc3QgdmFsaWRhdGVTZXJ2aWNlRG9jID0gbmV3IHNzbS5DZm5Eb2N1bWVudCh0aGlzLCBcIm5lYXItdmFsaWRhdGUtc2VydmljZVwiLCB7XG4gICAgICAgICAgICBkb2N1bWVudFR5cGU6IFwiQ29tbWFuZFwiLFxuICAgICAgICAgICAgZG9jdW1lbnRGb3JtYXQ6IFwiWUFNTFwiLFxuICAgICAgICAgICAgbmFtZTogYG5lYXItdmFsaWRhdGUtc2VydmljZS0ke3RoaXMuc3RhY2tOYW1lfWAsXG4gICAgICAgICAgICBjb250ZW50OiB7XG4gICAgICAgICAgICAgICAgc2NoZW1hVmVyc2lvbjogXCIyLjJcIixcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogXCJWYWxpZGF0ZSBORUFSIGxvY2FsbmV0IHNlcnZpY2UgaXMgcnVubmluZ1wiLFxuICAgICAgICAgICAgICAgIHBhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgICAgICAgICAgbmVhck5ldHdvcms6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IFwiU3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogXCJORUFSIG5ldHdvcmtcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6IG5lYXJOZXR3b3JrXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIG1haW5TdGVwczogW1xuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhY3Rpb246IFwiYXdzOnJ1blNoZWxsU2NyaXB0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBcInZhbGlkYXRlU2VydmljZVJ1bm5pbmdcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGlucHV0czoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRpbWVvdXRTZWNvbmRzOiBcIjMwMFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJ1bkNvbW1hbmQ6IFtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIjIS9iaW4vYmFzaFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInNldCAtZXVvIHBpcGVmYWlsXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZWNobyAnW1NZTkMtU1RBQ0tdIFZhbGlkYXRpbmcgTkVBUiBsb2NhbG5ldCBzZXJ2aWNlLi4uJ1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIlwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiMgQ2hlY2sgaWYgbmVhcnVwIHByb2Nlc3MgaXMgcnVubmluZ1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImlmICEgcGdyZXAgLWYgJ25lYXJ1cCcgPiAvZGV2L251bGw7IHRoZW5cIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIgIGVjaG8gJ1tTWU5DLVNUQUNLXSBFUlJPUjogbmVhcnVwIHByb2Nlc3Mgbm90IGZvdW5kJ1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiAgZXhpdCAxXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZmlcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIjIFdhaXQgZm9yIFJQQyBlbmRwb2ludCB0byBiZSBhdmFpbGFibGVcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJNQVhfV0FJVD0zMDBcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJFTEFQU0VEPTBcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJ3aGlsZSBbICRFTEFQU0VEIC1sdCAkTUFYX1dBSVQgXTsgZG9cIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIgIGlmIGN1cmwgLXMgaHR0cDovLzEyNy4wLjAuMTozMDMwL3N0YXR1cyA+IC9kZXYvbnVsbCAyPiYxOyB0aGVuXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiICAgIGVjaG8gJ1tTWU5DLVNUQUNLXSBSUEMgZW5kcG9pbnQgaXMgYXZhaWxhYmxlJ1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiAgICBicmVha1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiAgZmlcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIgIGVjaG8gJ1tTWU5DLVNUQUNLXSBXYWl0aW5nIGZvciBSUEMgZW5kcG9pbnQuLi4gKCRFTEFQU0VEIHNlY29uZHMpJ1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiAgc2xlZXAgMTBcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIgIEVMQVBTRUQ9JCgoRUxBUFNFRCArIDEwKSlcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJkb25lXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiIyBGaW5hbCBjaGVja1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImlmICEgY3VybCAtcyBodHRwOi8vMTI3LjAuMC4xOjMwMzAvc3RhdHVzID4gL2Rldi9udWxsIDI+JjE7IHRoZW5cIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIgIGVjaG8gJ1tTWU5DLVNUQUNLXSBFUlJPUjogUlBDIGVuZHBvaW50IG5vdCBhdmFpbGFibGUgYWZ0ZXIgJE1BWF9XQUlUIHNlY29uZHMnXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiICBleGl0IDFcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJmaVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIlwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiMgR2V0IHN0YXR1cyBmb3IgdmVyaWZpY2F0aW9uXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiU1RBVFVTPSQoY3VybCAtcyBodHRwOi8vMTI3LjAuMC4xOjMwMzAvc3RhdHVzIHwganEgLXIgJy5jaGFpbl9pZCAvLyBcXFwidW5rbm93blxcXCInKVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImVjaG8gJ1tTWU5DLVNUQUNLXSBORUFSIGxvY2FsbmV0IGNoYWluX2lkOiAkU1RBVFVTJ1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImVjaG8gJ1tTWU5DLVNUQUNLXSBTZXJ2aWNlIHZhbGlkYXRpb24gY29tcGxldGUnXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEV4ZWN1dGUgdGhlIHZhbGlkYXRpb24gdmlhIFNTTSBhc3NvY2lhdGlvblxuICAgICAgICBjb25zdCB2YWxpZGF0ZUV4ZWN1dGlvbiA9IG5ldyBzc20uQ2ZuQXNzb2NpYXRpb24odGhpcywgXCJuZWFyLXZhbGlkYXRlLXNlcnZpY2UtZXhlY3V0aW9uXCIsIHtcbiAgICAgICAgICAgIG5hbWU6IHZhbGlkYXRlU2VydmljZURvYy5yZWYsXG4gICAgICAgICAgICB0YXJnZXRzOiBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBrZXk6IFwiSW5zdGFuY2VJZHNcIixcbiAgICAgICAgICAgICAgICAgICAgdmFsdWVzOiBbaW5zdGFuY2VJZF1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgcGFyYW1ldGVyczoge1xuICAgICAgICAgICAgICAgIG5lYXJOZXR3b3JrOiBbbmVhck5ldHdvcmtdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgYXBwbHlPbmx5QXRDcm9uSW50ZXJ2YWw6IGZhbHNlLFxuICAgICAgICAgICAgbWF4Q29uY3VycmVuY3k6IFwiMVwiLFxuICAgICAgICAgICAgbWF4RXJyb3JzOiBcIjBcIlxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBDb25zdHJ1Y3QgUlBDIFVSTFxuICAgICAgICB0aGlzLnJwY1VybCA9IGBodHRwOi8vJHtpbnN0YW5jZVByaXZhdGVJcH06MzAzMGA7XG5cbiAgICAgICAgLy8gQ3JlYXRlIENsb3VkV2F0Y2ggZGFzaGJvYXJkIGZvciBtb25pdG9yaW5nXG4gICAgICAgIGNvbnN0IGRhc2hib2FyZCA9IG5ldyBjdy5EYXNoYm9hcmQodGhpcywgXCJuZWFyLWxvY2FsbmV0LWRhc2hib2FyZFwiLCB7XG4gICAgICAgICAgICBkYXNoYm9hcmROYW1lOiBgbmVhci1sb2NhbG5ldC0ke3RoaXMuc3RhY2tOYW1lfWAsXG4gICAgICAgICAgICB3aWRnZXRzOiBbXG4gICAgICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgICAgICBuZXcgY3cuR3JhcGhXaWRnZXQoe1xuICAgICAgICAgICAgICAgICAgICAgICAgdGl0bGU6IFwiSW5zdGFuY2UgU3RhdHVzXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBsZWZ0OiBbXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV3IGN3Lk1ldHJpYyh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWVzcGFjZTogXCJBV1MvRUMyXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1ldHJpY05hbWU6IFwiQ1BVVXRpbGl6YXRpb25cIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGltZW5zaW9uc01hcDogeyBJbnN0YW5jZUlkOiBpbnN0YW5jZUlkIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRpc3RpYzogXCJBdmVyYWdlXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJpZ2h0OiBbXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV3IGN3Lk1ldHJpYyh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWVzcGFjZTogXCJBV1MvRUMyXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1ldHJpY05hbWU6IFwiTmV0d29ya0luXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRpbWVuc2lvbnNNYXA6IHsgSW5zdGFuY2VJZDogaW5zdGFuY2VJZCB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0aXN0aWM6IFwiU3VtXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXcgY3cuTWV0cmljKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZXNwYWNlOiBcIkFXUy9FQzJcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWV0cmljTmFtZTogXCJOZXR3b3JrT3V0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRpbWVuc2lvbnNNYXA6IHsgSW5zdGFuY2VJZDogaW5zdGFuY2VJZCB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0aXN0aWM6IFwiU3VtXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoOiAxMixcbiAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodDogNlxuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIF1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gU3RhY2sgb3V0cHV0c1xuICAgICAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcInN5bmMtc3RhdHVzXCIsIHtcbiAgICAgICAgICAgIHZhbHVlOiB2YWxpZGF0ZUV4ZWN1dGlvbi5yZWYsXG4gICAgICAgICAgICBleHBvcnROYW1lOiBcIk5lYXJMb2NhbG5ldFN5bmNTdGF0dXNcIixcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJuZWFyLXJwYy11cmxcIiwge1xuICAgICAgICAgICAgdmFsdWU6IHRoaXMucnBjVXJsLFxuICAgICAgICAgICAgZGVzY3JpcHRpb246IFwiTkVBUiBsb2NhbG5ldCBSUEMgZW5kcG9pbnRcIixcbiAgICAgICAgICAgIGV4cG9ydE5hbWU6IFwiTmVhckxvY2FsbmV0UnBjVXJsXCJcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJuZWFyLW5ldHdvcmstaWRcIiwge1xuICAgICAgICAgICAgdmFsdWU6IFwibG9jYWxuZXRcIixcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBcIk5FQVIgbmV0d29yayBpZGVudGlmaWVyXCIsXG4gICAgICAgICAgICBleHBvcnROYW1lOiBcIk5lYXJMb2NhbG5ldE5ldHdvcmtJZFwiXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuc3luY1N0YXR1cyA9IFwiU2VydmljZSB2YWxpZGF0aW9uIGluaXRpYXRlZFwiO1xuXG4gICAgICAgIC8vIEFkZGluZyBzdXBwcmVzc2lvbnMgdG8gdGhlIHN0YWNrXG4gICAgICAgIG5hZy5OYWdTdXBwcmVzc2lvbnMuYWRkUmVzb3VyY2VTdXBwcmVzc2lvbnMoXG4gICAgICAgICAgICB0aGlzLFxuICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgaWQ6IFwiQXdzU29sdXRpb25zLUlBTTVcIixcbiAgICAgICAgICAgICAgICAgICAgcmVhc29uOiBcIlNTTSB3aWxkY2FyZCBwZXJtaXNzaW9ucyBuZWVkZWQgZm9yIGNvbW1hbmQgZXhlY3V0aW9uXCIsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB0cnVlXG4gICAgICAgICk7XG4gICAgfVxufVxuXG4iXX0=
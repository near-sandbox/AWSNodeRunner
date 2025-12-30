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
        // For localnet, the node processes are started by UserData (nearup or direct neard).
        // This stack validates the service is running and exposes RPC endpoint.
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
                                "# Check if the node process is running (nearup or neard)",
                                "if pgrep -f 'nearup' > /dev/null; then",
                                "  echo '[SYNC-STACK] nearup process found'",
                                "elif pgrep -f 'neard' > /dev/null; then",
                                "  echo '[SYNC-STACK] neard process found'",
                                "else",
                                "  echo '[SYNC-STACK] ERROR: neither nearup nor neard process found'",
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3luYy1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInN5bmMtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBRW5DLHlEQUEyQztBQUMzQywrREFBaUQ7QUFDakQsNkNBQStCO0FBUS9CLE1BQWEsYUFBYyxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBSXhDLFlBQVksS0FBOEIsRUFBRSxFQUFVLEVBQUUsS0FBeUI7UUFDN0UsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLFdBQVcsRUFBRSxHQUFHLEtBQUssQ0FBQztRQUU5QixxQ0FBcUM7UUFDckMsTUFBTSxVQUFVLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsd0JBQXdCLENBQUMsQ0FBQztRQUNoRSxNQUFNLGlCQUFpQixHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLCtCQUErQixDQUFDLENBQUM7UUFDOUUsTUFBTSxhQUFhLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsMkJBQTJCLENBQUMsQ0FBQztRQUV0RSxxRkFBcUY7UUFDckYsd0VBQXdFO1FBQ3hFLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxHQUFHLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSx1QkFBdUIsRUFBRTtZQUMxRSxZQUFZLEVBQUUsU0FBUztZQUN2QixjQUFjLEVBQUUsTUFBTTtZQUN0QixJQUFJLEVBQUUseUJBQXlCLElBQUksQ0FBQyxTQUFTLEVBQUU7WUFDL0MsT0FBTyxFQUFFO2dCQUNMLGFBQWEsRUFBRSxLQUFLO2dCQUNwQixXQUFXLEVBQUUsMkNBQTJDO2dCQUN4RCxVQUFVLEVBQUU7b0JBQ1IsV0FBVyxFQUFFO3dCQUNULElBQUksRUFBRSxRQUFRO3dCQUNkLFdBQVcsRUFBRSxjQUFjO3dCQUMzQixP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LENBQUM7aUJBQ0w7YUFDSjtTQUNKLENBQUMsQ0FBQztRQUVILGdCQUFnQjtRQUNoQixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUNuQyxLQUFLLEVBQUUsaUJBQWlCLENBQUMsR0FBRztZQUM1QixVQUFVLEVBQUUsd0JBQXdCO1NBQ3ZDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQ3BDLEtBQUssRUFBRSxJQUFJLENBQUMsTUFBTTtZQUNsQixXQUFXLEVBQUUsNEJBQTRCO1lBQ3pDLFVBQVUsRUFBRSxvQkFBb0I7U0FDbkMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxpQkFBaUIsRUFBRTtZQUN2QyxLQUFLLEVBQUUsVUFBVTtZQUNqQixXQUFXLEVBQUUseUJBQXlCO1lBQ3RDLFVBQVUsRUFBRSx1QkFBdUI7U0FDdEMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLFVBQVUsR0FBRyw4QkFBOEIsQ0FBQztRQUVqRCxtQ0FBbUM7UUFDbkMsR0FBRyxDQUFDLGVBQWUsQ0FBQyx1QkFBdUIsQ0FDdkMsSUFBSSxFQUNKO1lBQ0k7Z0JBQ0ksRUFBRSxFQUFFLG1CQUFtQjtnQkFDdkIsTUFBTSxFQUFFLHVEQUF1RDthQUNsRTtTQUNKLEVBQ0QsSUFBSSxDQUNQLENBQUM7SUFDTixDQUFDO0NBQ0o7QUF6S0Qsc0NBeUtDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0ICogYXMgY2RrQ29uc3RydWN0cyBmcm9tIFwiY29uc3RydWN0c1wiO1xuaW1wb3J0ICogYXMgc3NtIGZyb20gXCJhd3MtY2RrLWxpYi9hd3Mtc3NtXCI7XG5pbXBvcnQgKiBhcyBjdyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWNsb3Vkd2F0Y2hcIjtcbmltcG9ydCAqIGFzIG5hZyBmcm9tIFwiY2RrLW5hZ1wiO1xuaW1wb3J0ICogYXMgY29uZmlnVHlwZXMgZnJvbSBcIi4vY29uZmlnL25vZGUtY29uZmlnLmludGVyZmFjZVwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIE5lYXJTeW5jU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgICBuZWFyTmV0d29yazogY29uZmlnVHlwZXMuTmVhck5ldHdvcms7XG4gICAgbmVhclZlcnNpb246IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIE5lYXJTeW5jU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICAgIHB1YmxpYyByZWFkb25seSBzeW5jU3RhdHVzOiBzdHJpbmc7XG4gICAgcHVibGljIHJlYWRvbmx5IHJwY1VybDogc3RyaW5nO1xuXG4gICAgY29uc3RydWN0b3Ioc2NvcGU6IGNka0NvbnN0cnVjdHMuQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogTmVhclN5bmNTdGFja1Byb3BzKSB7XG4gICAgICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgICAgIGNvbnN0IHsgbmVhck5ldHdvcmsgfSA9IHByb3BzO1xuXG4gICAgICAgIC8vIEltcG9ydCB2YWx1ZXMgZnJvbSBwcmV2aW91cyBzdGFja3NcbiAgICAgICAgY29uc3QgaW5zdGFuY2VJZCA9IGNkay5Gbi5pbXBvcnRWYWx1ZShcIk5lYXJMb2NhbG5ldEluc3RhbmNlSWRcIik7XG4gICAgICAgIGNvbnN0IGluc3RhbmNlUHJpdmF0ZUlwID0gY2RrLkZuLmltcG9ydFZhbHVlKFwiTmVhckxvY2FsbmV0SW5zdGFuY2VQcml2YXRlSXBcIik7XG4gICAgICAgIGNvbnN0IGluc3RhbGxTdGF0dXMgPSBjZGsuRm4uaW1wb3J0VmFsdWUoXCJOZWFyTG9jYWxuZXRJbnN0YWxsU3RhdHVzXCIpO1xuXG4gICAgICAgIC8vIEZvciBsb2NhbG5ldCwgdGhlIG5vZGUgcHJvY2Vzc2VzIGFyZSBzdGFydGVkIGJ5IFVzZXJEYXRhIChuZWFydXAgb3IgZGlyZWN0IG5lYXJkKS5cbiAgICAgICAgLy8gVGhpcyBzdGFjayB2YWxpZGF0ZXMgdGhlIHNlcnZpY2UgaXMgcnVubmluZyBhbmQgZXhwb3NlcyBSUEMgZW5kcG9pbnQuXG4gICAgICAgIGNvbnN0IHZhbGlkYXRlU2VydmljZURvYyA9IG5ldyBzc20uQ2ZuRG9jdW1lbnQodGhpcywgXCJuZWFyLXZhbGlkYXRlLXNlcnZpY2VcIiwge1xuICAgICAgICAgICAgZG9jdW1lbnRUeXBlOiBcIkNvbW1hbmRcIixcbiAgICAgICAgICAgIGRvY3VtZW50Rm9ybWF0OiBcIllBTUxcIixcbiAgICAgICAgICAgIG5hbWU6IGBuZWFyLXZhbGlkYXRlLXNlcnZpY2UtJHt0aGlzLnN0YWNrTmFtZX1gLFxuICAgICAgICAgICAgY29udGVudDoge1xuICAgICAgICAgICAgICAgIHNjaGVtYVZlcnNpb246IFwiMi4yXCIsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IFwiVmFsaWRhdGUgTkVBUiBsb2NhbG5ldCBzZXJ2aWNlIGlzIHJ1bm5pbmdcIixcbiAgICAgICAgICAgICAgICBwYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICAgICAgICAgIG5lYXJOZXR3b3JrOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBcIlN0cmluZ1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IFwiTkVBUiBuZXR3b3JrXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OiBuZWFyTmV0d29ya1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBtYWluU3RlcHM6IFtcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgYWN0aW9uOiBcImF3czpydW5TaGVsbFNjcmlwdFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogXCJ2YWxpZGF0ZVNlcnZpY2VSdW5uaW5nXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBpbnB1dHM6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aW1lb3V0U2Vjb25kczogXCIzMDBcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBydW5Db21tYW5kOiBbXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiIyEvYmluL2Jhc2hcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJzZXQgLWV1byBwaXBlZmFpbFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImVjaG8gJ1tTWU5DLVNUQUNLXSBWYWxpZGF0aW5nIE5FQVIgbG9jYWxuZXQgc2VydmljZS4uLidcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIjIENoZWNrIGlmIHRoZSBub2RlIHByb2Nlc3MgaXMgcnVubmluZyAobmVhcnVwIG9yIG5lYXJkKVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImlmIHBncmVwIC1mICduZWFydXAnID4gL2Rldi9udWxsOyB0aGVuXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiICBlY2hvICdbU1lOQy1TVEFDS10gbmVhcnVwIHByb2Nlc3MgZm91bmQnXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZWxpZiBwZ3JlcCAtZiAnbmVhcmQnID4gL2Rldi9udWxsOyB0aGVuXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiICBlY2hvICdbU1lOQy1TVEFDS10gbmVhcmQgcHJvY2VzcyBmb3VuZCdcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJlbHNlXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiICBlY2hvICdbU1lOQy1TVEFDS10gRVJST1I6IG5laXRoZXIgbmVhcnVwIG5vciBuZWFyZCBwcm9jZXNzIGZvdW5kJ1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiAgZXhpdCAxXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZmlcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIjIFdhaXQgZm9yIFJQQyBlbmRwb2ludCB0byBiZSBhdmFpbGFibGVcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJNQVhfV0FJVD0zMDBcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJFTEFQU0VEPTBcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJ3aGlsZSBbICRFTEFQU0VEIC1sdCAkTUFYX1dBSVQgXTsgZG9cIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIgIGlmIGN1cmwgLXMgaHR0cDovLzEyNy4wLjAuMTozMDMwL3N0YXR1cyA+IC9kZXYvbnVsbCAyPiYxOyB0aGVuXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiICAgIGVjaG8gJ1tTWU5DLVNUQUNLXSBSUEMgZW5kcG9pbnQgaXMgYXZhaWxhYmxlJ1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiAgICBicmVha1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiAgZmlcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIgIGVjaG8gJ1tTWU5DLVNUQUNLXSBXYWl0aW5nIGZvciBSUEMgZW5kcG9pbnQuLi4gKCRFTEFQU0VEIHNlY29uZHMpJ1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiAgc2xlZXAgMTBcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIgIEVMQVBTRUQ9JCgoRUxBUFNFRCArIDEwKSlcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJkb25lXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiIyBGaW5hbCBjaGVja1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImlmICEgY3VybCAtcyBodHRwOi8vMTI3LjAuMC4xOjMwMzAvc3RhdHVzID4gL2Rldi9udWxsIDI+JjE7IHRoZW5cIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIgIGVjaG8gJ1tTWU5DLVNUQUNLXSBFUlJPUjogUlBDIGVuZHBvaW50IG5vdCBhdmFpbGFibGUgYWZ0ZXIgJE1BWF9XQUlUIHNlY29uZHMnXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiICBleGl0IDFcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJmaVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIlwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiMgR2V0IHN0YXR1cyBmb3IgdmVyaWZpY2F0aW9uXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiU1RBVFVTPSQoY3VybCAtcyBodHRwOi8vMTI3LjAuMC4xOjMwMzAvc3RhdHVzIHwganEgLXIgJy5jaGFpbl9pZCAvLyBcXFwidW5rbm93blxcXCInKVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImVjaG8gJ1tTWU5DLVNUQUNLXSBORUFSIGxvY2FsbmV0IGNoYWluX2lkOiAkU1RBVFVTJ1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImVjaG8gJ1tTWU5DLVNUQUNLXSBTZXJ2aWNlIHZhbGlkYXRpb24gY29tcGxldGUnXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEV4ZWN1dGUgdGhlIHZhbGlkYXRpb24gdmlhIFNTTSBhc3NvY2lhdGlvblxuICAgICAgICBjb25zdCB2YWxpZGF0ZUV4ZWN1dGlvbiA9IG5ldyBzc20uQ2ZuQXNzb2NpYXRpb24odGhpcywgXCJuZWFyLXZhbGlkYXRlLXNlcnZpY2UtZXhlY3V0aW9uXCIsIHtcbiAgICAgICAgICAgIG5hbWU6IHZhbGlkYXRlU2VydmljZURvYy5yZWYsXG4gICAgICAgICAgICB0YXJnZXRzOiBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBrZXk6IFwiSW5zdGFuY2VJZHNcIixcbiAgICAgICAgICAgICAgICAgICAgdmFsdWVzOiBbaW5zdGFuY2VJZF1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgcGFyYW1ldGVyczoge1xuICAgICAgICAgICAgICAgIG5lYXJOZXR3b3JrOiBbbmVhck5ldHdvcmtdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgYXBwbHlPbmx5QXRDcm9uSW50ZXJ2YWw6IGZhbHNlLFxuICAgICAgICAgICAgbWF4Q29uY3VycmVuY3k6IFwiMVwiLFxuICAgICAgICAgICAgbWF4RXJyb3JzOiBcIjBcIlxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBDb25zdHJ1Y3QgUlBDIFVSTFxuICAgICAgICB0aGlzLnJwY1VybCA9IGBodHRwOi8vJHtpbnN0YW5jZVByaXZhdGVJcH06MzAzMGA7XG5cbiAgICAgICAgLy8gQ3JlYXRlIENsb3VkV2F0Y2ggZGFzaGJvYXJkIGZvciBtb25pdG9yaW5nXG4gICAgICAgIGNvbnN0IGRhc2hib2FyZCA9IG5ldyBjdy5EYXNoYm9hcmQodGhpcywgXCJuZWFyLWxvY2FsbmV0LWRhc2hib2FyZFwiLCB7XG4gICAgICAgICAgICBkYXNoYm9hcmROYW1lOiBgbmVhci1sb2NhbG5ldC0ke3RoaXMuc3RhY2tOYW1lfWAsXG4gICAgICAgICAgICB3aWRnZXRzOiBbXG4gICAgICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgICAgICBuZXcgY3cuR3JhcGhXaWRnZXQoe1xuICAgICAgICAgICAgICAgICAgICAgICAgdGl0bGU6IFwiSW5zdGFuY2UgU3RhdHVzXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBsZWZ0OiBbXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV3IGN3Lk1ldHJpYyh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWVzcGFjZTogXCJBV1MvRUMyXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1ldHJpY05hbWU6IFwiQ1BVVXRpbGl6YXRpb25cIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGltZW5zaW9uc01hcDogeyBJbnN0YW5jZUlkOiBpbnN0YW5jZUlkIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRpc3RpYzogXCJBdmVyYWdlXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJpZ2h0OiBbXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV3IGN3Lk1ldHJpYyh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWVzcGFjZTogXCJBV1MvRUMyXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1ldHJpY05hbWU6IFwiTmV0d29ya0luXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRpbWVuc2lvbnNNYXA6IHsgSW5zdGFuY2VJZDogaW5zdGFuY2VJZCB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0aXN0aWM6IFwiU3VtXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXcgY3cuTWV0cmljKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZXNwYWNlOiBcIkFXUy9FQzJcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWV0cmljTmFtZTogXCJOZXR3b3JrT3V0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRpbWVuc2lvbnNNYXA6IHsgSW5zdGFuY2VJZDogaW5zdGFuY2VJZCB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0aXN0aWM6IFwiU3VtXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoOiAxMixcbiAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodDogNlxuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIF1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gU3RhY2sgb3V0cHV0c1xuICAgICAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcInN5bmMtc3RhdHVzXCIsIHtcbiAgICAgICAgICAgIHZhbHVlOiB2YWxpZGF0ZUV4ZWN1dGlvbi5yZWYsXG4gICAgICAgICAgICBleHBvcnROYW1lOiBcIk5lYXJMb2NhbG5ldFN5bmNTdGF0dXNcIixcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJuZWFyLXJwYy11cmxcIiwge1xuICAgICAgICAgICAgdmFsdWU6IHRoaXMucnBjVXJsLFxuICAgICAgICAgICAgZGVzY3JpcHRpb246IFwiTkVBUiBsb2NhbG5ldCBSUEMgZW5kcG9pbnRcIixcbiAgICAgICAgICAgIGV4cG9ydE5hbWU6IFwiTmVhckxvY2FsbmV0UnBjVXJsXCJcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJuZWFyLW5ldHdvcmstaWRcIiwge1xuICAgICAgICAgICAgdmFsdWU6IFwibG9jYWxuZXRcIixcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBcIk5FQVIgbmV0d29yayBpZGVudGlmaWVyXCIsXG4gICAgICAgICAgICBleHBvcnROYW1lOiBcIk5lYXJMb2NhbG5ldE5ldHdvcmtJZFwiXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuc3luY1N0YXR1cyA9IFwiU2VydmljZSB2YWxpZGF0aW9uIGluaXRpYXRlZFwiO1xuXG4gICAgICAgIC8vIEFkZGluZyBzdXBwcmVzc2lvbnMgdG8gdGhlIHN0YWNrXG4gICAgICAgIG5hZy5OYWdTdXBwcmVzc2lvbnMuYWRkUmVzb3VyY2VTdXBwcmVzc2lvbnMoXG4gICAgICAgICAgICB0aGlzLFxuICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgaWQ6IFwiQXdzU29sdXRpb25zLUlBTTVcIixcbiAgICAgICAgICAgICAgICAgICAgcmVhc29uOiBcIlNTTSB3aWxkY2FyZCBwZXJtaXNzaW9ucyBuZWVkZWQgZm9yIGNvbW1hbmQgZXhlY3V0aW9uXCIsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB0cnVlXG4gICAgICAgICk7XG4gICAgfVxufVxuXG4iXX0=
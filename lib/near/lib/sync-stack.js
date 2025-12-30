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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3luYy1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInN5bmMtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBRW5DLHlEQUEyQztBQUMzQywrREFBaUQ7QUFDakQsNkNBQStCO0FBUS9CLE1BQWEsYUFBYyxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBSXhDLFlBQVksS0FBOEIsRUFBRSxFQUFVLEVBQUUsS0FBeUI7UUFDN0UsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLFdBQVcsRUFBRSxHQUFHLEtBQUssQ0FBQztRQUU5QixxQ0FBcUM7UUFDckMsTUFBTSxVQUFVLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsd0JBQXdCLENBQUMsQ0FBQztRQUNoRSxNQUFNLGlCQUFpQixHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLCtCQUErQixDQUFDLENBQUM7UUFDOUUsTUFBTSxhQUFhLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsMkJBQTJCLENBQUMsQ0FBQztRQUV0RSxxRkFBcUY7UUFDckYsd0VBQXdFO1FBQ3hFLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxHQUFHLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSx1QkFBdUIsRUFBRTtZQUMxRSxZQUFZLEVBQUUsU0FBUztZQUN2QixjQUFjLEVBQUUsTUFBTTtZQUN0QixPQUFPLEVBQUU7Z0JBQ0wsYUFBYSxFQUFFLEtBQUs7Z0JBQ3BCLFdBQVcsRUFBRSwyQ0FBMkM7Z0JBQ3hELFVBQVUsRUFBRTtvQkFDUixXQUFXLEVBQUU7d0JBQ1QsSUFBSSxFQUFFLFFBQVE7d0JBQ2QsV0FBVyxFQUFFLGNBQWM7d0JBQzNCLE9BQU8sRUFBRSxXQUFXO3FCQUN2QjtpQkFDSjtnQkFDRCxTQUFTLEVBQUU7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O1FBQ2hCLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFO1lBQ25DLEtBQUssRUFBRSxpQkFBaUIsQ0FBQyxHQUFHO1lBQzVCLFVBQVUsRUFBRSx3QkFBd0I7U0FDdkMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxjQUFjLEVBQUU7WUFDcEMsS0FBSyxFQUFFLElBQUksQ0FBQyxNQUFNO1lBQ2xCLFdBQVcsRUFBRSw0QkFBNEI7WUFDekMsVUFBVSxFQUFFLG9CQUFvQjtTQUNuQyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFO1lBQ3ZDLEtBQUssRUFBRSxVQUFVO1lBQ2pCLFdBQVcsRUFBRSx5QkFBeUI7WUFDdEMsVUFBVSxFQUFFLHVCQUF1QjtTQUN0QyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsVUFBVSxHQUFHLDhCQUE4QixDQUFDO1FBRWpELG1DQUFtQztRQUNuQyxHQUFHLENBQUMsZUFBZSxDQUFDLHVCQUF1QixDQUN2QyxJQUFJLEVBQ0o7WUFDSTtnQkFDSSxFQUFFLEVBQUUsbUJBQW1CO2dCQUN2QixNQUFNLEVBQUUsdURBQXVEO2FBQ2xFO1NBQ0osRUFDRCxJQUFJLENBQ1AsQ0FBQztJQUNOLENBQUM7Q0FDSjtBQXhLRCxzQ0F3S0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgKiBhcyBjZGtDb25zdHJ1Y3RzIGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5pbXBvcnQgKiBhcyBzc20gZnJvbSBcImF3cy1jZGstbGliL2F3cy1zc21cIjtcbmltcG9ydCAqIGFzIGN3IGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaFwiO1xuaW1wb3J0ICogYXMgbmFnIGZyb20gXCJjZGstbmFnXCI7XG5pbXBvcnQgKiBhcyBjb25maWdUeXBlcyBmcm9tIFwiLi9jb25maWcvbm9kZS1jb25maWcuaW50ZXJmYWNlXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTmVhclN5bmNTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICAgIG5lYXJOZXR3b3JrOiBjb25maWdUeXBlcy5OZWFyTmV0d29yaztcbiAgICBuZWFyVmVyc2lvbjogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgTmVhclN5bmNTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gICAgcHVibGljIHJlYWRvbmx5IHN5bmNTdGF0dXM6IHN0cmluZztcbiAgICBwdWJsaWMgcmVhZG9ubHkgcnBjVXJsOiBzdHJpbmc7XG5cbiAgICBjb25zdHJ1Y3RvcihzY29wZTogY2RrQ29uc3RydWN0cy5Db25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBOZWFyU3luY1N0YWNrUHJvcHMpIHtcbiAgICAgICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAgICAgY29uc3QgeyBuZWFyTmV0d29yayB9ID0gcHJvcHM7XG5cbiAgICAgICAgLy8gSW1wb3J0IHZhbHVlcyBmcm9tIHByZXZpb3VzIHN0YWNrc1xuICAgICAgICBjb25zdCBpbnN0YW5jZUlkID0gY2RrLkZuLmltcG9ydFZhbHVlKFwiTmVhckxvY2FsbmV0SW5zdGFuY2VJZFwiKTtcbiAgICAgICAgY29uc3QgaW5zdGFuY2VQcml2YXRlSXAgPSBjZGsuRm4uaW1wb3J0VmFsdWUoXCJOZWFyTG9jYWxuZXRJbnN0YW5jZVByaXZhdGVJcFwiKTtcbiAgICAgICAgY29uc3QgaW5zdGFsbFN0YXR1cyA9IGNkay5Gbi5pbXBvcnRWYWx1ZShcIk5lYXJMb2NhbG5ldEluc3RhbGxTdGF0dXNcIik7XG5cbiAgICAgICAgLy8gRm9yIGxvY2FsbmV0LCB0aGUgbm9kZSBwcm9jZXNzZXMgYXJlIHN0YXJ0ZWQgYnkgVXNlckRhdGEgKG5lYXJ1cCBvciBkaXJlY3QgbmVhcmQpLlxuICAgICAgICAvLyBUaGlzIHN0YWNrIHZhbGlkYXRlcyB0aGUgc2VydmljZSBpcyBydW5uaW5nIGFuZCBleHBvc2VzIFJQQyBlbmRwb2ludC5cbiAgICAgICAgY29uc3QgdmFsaWRhdGVTZXJ2aWNlRG9jID0gbmV3IHNzbS5DZm5Eb2N1bWVudCh0aGlzLCBcIm5lYXItdmFsaWRhdGUtc2VydmljZVwiLCB7XG4gICAgICAgICAgICBkb2N1bWVudFR5cGU6IFwiQ29tbWFuZFwiLFxuICAgICAgICAgICAgZG9jdW1lbnRGb3JtYXQ6IFwiWUFNTFwiLFxuICAgICAgICAgICAgY29udGVudDoge1xuICAgICAgICAgICAgICAgIHNjaGVtYVZlcnNpb246IFwiMi4yXCIsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IFwiVmFsaWRhdGUgTkVBUiBsb2NhbG5ldCBzZXJ2aWNlIGlzIHJ1bm5pbmdcIixcbiAgICAgICAgICAgICAgICBwYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICAgICAgICAgIG5lYXJOZXR3b3JrOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBcIlN0cmluZ1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IFwiTkVBUiBuZXR3b3JrXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OiBuZWFyTmV0d29ya1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBtYWluU3RlcHM6IFtcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgYWN0aW9uOiBcImF3czpydW5TaGVsbFNjcmlwdFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogXCJ2YWxpZGF0ZVNlcnZpY2VSdW5uaW5nXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBpbnB1dHM6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aW1lb3V0U2Vjb25kczogXCIzMDBcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBydW5Db21tYW5kOiBbXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiIyEvYmluL2Jhc2hcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJzZXQgLWV1byBwaXBlZmFpbFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImVjaG8gJ1tTWU5DLVNUQUNLXSBWYWxpZGF0aW5nIE5FQVIgbG9jYWxuZXQgc2VydmljZS4uLidcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIjIENoZWNrIGlmIHRoZSBub2RlIHByb2Nlc3MgaXMgcnVubmluZyAobmVhcnVwIG9yIG5lYXJkKVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImlmIHBncmVwIC1mICduZWFydXAnID4gL2Rldi9udWxsOyB0aGVuXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiICBlY2hvICdbU1lOQy1TVEFDS10gbmVhcnVwIHByb2Nlc3MgZm91bmQnXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZWxpZiBwZ3JlcCAtZiAnbmVhcmQnID4gL2Rldi9udWxsOyB0aGVuXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiICBlY2hvICdbU1lOQy1TVEFDS10gbmVhcmQgcHJvY2VzcyBmb3VuZCdcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJlbHNlXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiICBlY2hvICdbU1lOQy1TVEFDS10gRVJST1I6IG5laXRoZXIgbmVhcnVwIG5vciBuZWFyZCBwcm9jZXNzIGZvdW5kJ1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiAgZXhpdCAxXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZmlcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIjIFdhaXQgZm9yIFJQQyBlbmRwb2ludCB0byBiZSBhdmFpbGFibGVcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJNQVhfV0FJVD0zMDBcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJFTEFQU0VEPTBcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJ3aGlsZSBbICRFTEFQU0VEIC1sdCAkTUFYX1dBSVQgXTsgZG9cIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIgIGlmIGN1cmwgLXMgaHR0cDovLzEyNy4wLjAuMTozMDMwL3N0YXR1cyA+IC9kZXYvbnVsbCAyPiYxOyB0aGVuXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiICAgIGVjaG8gJ1tTWU5DLVNUQUNLXSBSUEMgZW5kcG9pbnQgaXMgYXZhaWxhYmxlJ1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiAgICBicmVha1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiAgZmlcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIgIGVjaG8gJ1tTWU5DLVNUQUNLXSBXYWl0aW5nIGZvciBSUEMgZW5kcG9pbnQuLi4gKCRFTEFQU0VEIHNlY29uZHMpJ1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiAgc2xlZXAgMTBcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIgIEVMQVBTRUQ9JCgoRUxBUFNFRCArIDEwKSlcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJkb25lXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiIyBGaW5hbCBjaGVja1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImlmICEgY3VybCAtcyBodHRwOi8vMTI3LjAuMC4xOjMwMzAvc3RhdHVzID4gL2Rldi9udWxsIDI+JjE7IHRoZW5cIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIgIGVjaG8gJ1tTWU5DLVNUQUNLXSBFUlJPUjogUlBDIGVuZHBvaW50IG5vdCBhdmFpbGFibGUgYWZ0ZXIgJE1BWF9XQUlUIHNlY29uZHMnXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiICBleGl0IDFcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJmaVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIlwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiMgR2V0IHN0YXR1cyBmb3IgdmVyaWZpY2F0aW9uXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiU1RBVFVTPSQoY3VybCAtcyBodHRwOi8vMTI3LjAuMC4xOjMwMzAvc3RhdHVzIHwganEgLXIgJy5jaGFpbl9pZCAvLyBcXFwidW5rbm93blxcXCInKVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImVjaG8gJ1tTWU5DLVNUQUNLXSBORUFSIGxvY2FsbmV0IGNoYWluX2lkOiAkU1RBVFVTJ1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImVjaG8gJ1tTWU5DLVNUQUNLXSBTZXJ2aWNlIHZhbGlkYXRpb24gY29tcGxldGUnXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEV4ZWN1dGUgdGhlIHZhbGlkYXRpb24gdmlhIFNTTSBhc3NvY2lhdGlvblxuICAgICAgICBjb25zdCB2YWxpZGF0ZUV4ZWN1dGlvbiA9IG5ldyBzc20uQ2ZuQXNzb2NpYXRpb24odGhpcywgXCJuZWFyLXZhbGlkYXRlLXNlcnZpY2UtZXhlY3V0aW9uXCIsIHtcbiAgICAgICAgICAgIG5hbWU6IHZhbGlkYXRlU2VydmljZURvYy5yZWYsXG4gICAgICAgICAgICB0YXJnZXRzOiBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBrZXk6IFwiSW5zdGFuY2VJZHNcIixcbiAgICAgICAgICAgICAgICAgICAgdmFsdWVzOiBbaW5zdGFuY2VJZF1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgcGFyYW1ldGVyczoge1xuICAgICAgICAgICAgICAgIG5lYXJOZXR3b3JrOiBbbmVhck5ldHdvcmtdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgYXBwbHlPbmx5QXRDcm9uSW50ZXJ2YWw6IGZhbHNlLFxuICAgICAgICAgICAgbWF4Q29uY3VycmVuY3k6IFwiMVwiLFxuICAgICAgICAgICAgbWF4RXJyb3JzOiBcIjBcIlxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBDb25zdHJ1Y3QgUlBDIFVSTFxuICAgICAgICB0aGlzLnJwY1VybCA9IGBodHRwOi8vJHtpbnN0YW5jZVByaXZhdGVJcH06MzAzMGA7XG5cbiAgICAgICAgLy8gQ3JlYXRlIENsb3VkV2F0Y2ggZGFzaGJvYXJkIGZvciBtb25pdG9yaW5nXG4gICAgICAgIGNvbnN0IGRhc2hib2FyZCA9IG5ldyBjdy5EYXNoYm9hcmQodGhpcywgXCJuZWFyLWxvY2FsbmV0LWRhc2hib2FyZFwiLCB7XG4gICAgICAgICAgICBkYXNoYm9hcmROYW1lOiBgbmVhci1sb2NhbG5ldC0ke3RoaXMuc3RhY2tOYW1lfWAsXG4gICAgICAgICAgICB3aWRnZXRzOiBbXG4gICAgICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgICAgICBuZXcgY3cuR3JhcGhXaWRnZXQoe1xuICAgICAgICAgICAgICAgICAgICAgICAgdGl0bGU6IFwiSW5zdGFuY2UgU3RhdHVzXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBsZWZ0OiBbXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV3IGN3Lk1ldHJpYyh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWVzcGFjZTogXCJBV1MvRUMyXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1ldHJpY05hbWU6IFwiQ1BVVXRpbGl6YXRpb25cIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGltZW5zaW9uc01hcDogeyBJbnN0YW5jZUlkOiBpbnN0YW5jZUlkIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRpc3RpYzogXCJBdmVyYWdlXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJpZ2h0OiBbXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV3IGN3Lk1ldHJpYyh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWVzcGFjZTogXCJBV1MvRUMyXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1ldHJpY05hbWU6IFwiTmV0d29ya0luXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRpbWVuc2lvbnNNYXA6IHsgSW5zdGFuY2VJZDogaW5zdGFuY2VJZCB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0aXN0aWM6IFwiU3VtXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXcgY3cuTWV0cmljKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZXNwYWNlOiBcIkFXUy9FQzJcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWV0cmljTmFtZTogXCJOZXR3b3JrT3V0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRpbWVuc2lvbnNNYXA6IHsgSW5zdGFuY2VJZDogaW5zdGFuY2VJZCB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0aXN0aWM6IFwiU3VtXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoOiAxMixcbiAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodDogNlxuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIF1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gU3RhY2sgb3V0cHV0c1xuICAgICAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcInN5bmMtc3RhdHVzXCIsIHtcbiAgICAgICAgICAgIHZhbHVlOiB2YWxpZGF0ZUV4ZWN1dGlvbi5yZWYsXG4gICAgICAgICAgICBleHBvcnROYW1lOiBcIk5lYXJMb2NhbG5ldFN5bmNTdGF0dXNcIixcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJuZWFyLXJwYy11cmxcIiwge1xuICAgICAgICAgICAgdmFsdWU6IHRoaXMucnBjVXJsLFxuICAgICAgICAgICAgZGVzY3JpcHRpb246IFwiTkVBUiBsb2NhbG5ldCBSUEMgZW5kcG9pbnRcIixcbiAgICAgICAgICAgIGV4cG9ydE5hbWU6IFwiTmVhckxvY2FsbmV0UnBjVXJsXCJcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJuZWFyLW5ldHdvcmstaWRcIiwge1xuICAgICAgICAgICAgdmFsdWU6IFwibG9jYWxuZXRcIixcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBcIk5FQVIgbmV0d29yayBpZGVudGlmaWVyXCIsXG4gICAgICAgICAgICBleHBvcnROYW1lOiBcIk5lYXJMb2NhbG5ldE5ldHdvcmtJZFwiXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuc3luY1N0YXR1cyA9IFwiU2VydmljZSB2YWxpZGF0aW9uIGluaXRpYXRlZFwiO1xuXG4gICAgICAgIC8vIEFkZGluZyBzdXBwcmVzc2lvbnMgdG8gdGhlIHN0YWNrXG4gICAgICAgIG5hZy5OYWdTdXBwcmVzc2lvbnMuYWRkUmVzb3VyY2VTdXBwcmVzc2lvbnMoXG4gICAgICAgICAgICB0aGlzLFxuICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgaWQ6IFwiQXdzU29sdXRpb25zLUlBTTVcIixcbiAgICAgICAgICAgICAgICAgICAgcmVhc29uOiBcIlNTTSB3aWxkY2FyZCBwZXJtaXNzaW9ucyBuZWVkZWQgZm9yIGNvbW1hbmQgZXhlY3V0aW9uXCIsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB0cnVlXG4gICAgICAgICk7XG4gICAgfVxufVxuXG4iXX0=
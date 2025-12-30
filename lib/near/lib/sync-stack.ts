import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as cw from "aws-cdk-lib/aws-cloudwatch";
import * as nag from "cdk-nag";
import * as configTypes from "./config/node-config.interface";

export interface NearSyncStackProps extends cdk.StackProps {
    nearNetwork: configTypes.NearNetwork;
    nearVersion: string;
}

export class NearSyncStack extends cdk.Stack {
    public readonly syncStatus: string;
    public readonly rpcUrl: string;

    constructor(scope: cdkConstructs.Construct, id: string, props: NearSyncStackProps) {
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
        nag.NagSuppressions.addResourceSuppressions(
            this,
            [
                {
                    id: "AwsSolutions-IAM5",
                    reason: "SSM wildcard permissions needed for command execution",
                },
            ],
            true
        );
    }
}


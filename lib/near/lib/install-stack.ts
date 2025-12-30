import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as nag from "cdk-nag";
import * as configTypes from "./config/node-config.interface";

export interface NearInstallStackProps extends cdk.StackProps {
    nearNetwork: configTypes.NearNetwork;
    nearVersion: string;
}

export class NearInstallStack extends cdk.Stack {
    public readonly installStatus: string;

    constructor(scope: cdkConstructs.Construct, id: string, props: NearInstallStackProps) {
        super(scope, id, props);

        const { nearNetwork, nearVersion } = props;

        // Import instance ID from infrastructure stack
        const instanceId = cdk.Fn.importValue("NearLocalnetInstanceId");

        // For localnet, the UserData script already compiles and installs NEAR
        // This stack validates the installation is complete via SSM document
        const validateInstallDoc = new ssm.CfnDocument(this, "near-validate-install", {
            documentType: "Command",
            documentFormat: "YAML",
            content: {
                schemaVersion: "2.2",
                description: "Validate NEAR localnet installation is complete",
                parameters: {
                    nearVersion: {
                        type: "String",
                        description: "NEAR Protocol version to validate",
                        default: nearVersion
                    },
                    nearNetwork: {
                        type: "String",
                        description: "NEAR network",
                        default: nearNetwork
                    }
                },
                mainSteps: [
                    {
                        action: "aws:runShellScript",
                        name: "waitForInstallComplete",
                        inputs: {
                            timeoutSeconds: "900", // 15 minutes max wait
                            runCommand: [
                                "#!/bin/bash",
                                "set -euo pipefail",
                                "echo '[INSTALL-STACK] Waiting for NEAR installation to complete...'",
                                "source /etc/near-environment || true",
                                "",
                                "# Check if initialization log exists (created by UserData)",
                                "MAX_WAIT=900  # 15 minutes",
                                "ELAPSED=0",
                                "while [ ! -f /var/log/near-init-complete.log ] && [ $ELAPSED -lt $MAX_WAIT ]; do",
                                "  echo '[INSTALL-STACK] Waiting for installation... ($ELAPSED seconds)'",
                                "  sleep 30",
                                "  ELAPSED=$((ELAPSED + 30))",
                                "done",
                                "",
                                "if [ ! -f /var/log/near-init-complete.log ]; then",
                                "  echo '[INSTALL-STACK] ERROR: Installation timeout'",
                                "  exit 1",
                                "fi",
                                "",
                                "# Check if neard binary exists",
                                "if [ ! -f ~ubuntu/nearcore/target/release/neard ]; then",
                                "  echo '[INSTALL-STACK] ERROR: neard binary not found'",
                                "  exit 1",
                                "fi",
                                "",
                                "# Check if nearup is installed",
                                "if ! command -v ~ubuntu/.local/bin/nearup &> /dev/null; then",
                                "  echo '[INSTALL-STACK] ERROR: nearup not found'",
                                "  exit 1",
                                "fi",
                                "",
                                "echo '[INSTALL-STACK] Installation validation complete'",
                                "echo '[INSTALL-STACK] NEAR localnet is ready'"
                            ]
                        }
                    }
                ]
            }
        });

        // Execute the validation via SSM association
        const validateExecution = new ssm.CfnAssociation(this, "near-validate-execution", {
            name: validateInstallDoc.ref,
            targets: [
                {
                    key: "InstanceIds",
                    values: [instanceId]
                }
            ],
            parameters: {
                nearVersion: [nearVersion],
                nearNetwork: [nearNetwork]
            },
            applyOnlyAtCronInterval: false,
            maxConcurrency: "1",
            maxErrors: "0"
        });

        // Stack outputs
        new cdk.CfnOutput(this, "install-document-name", {
            value: validateInstallDoc.ref,
            exportName: "NearLocalnetInstallDocumentName",
        });

        new cdk.CfnOutput(this, "install-status", {
            value: "Installation validation initiated - monitor via SSM",
            exportName: "NearLocalnetInstallStatus",
            description: "Validates NEAR localnet installation from UserData script"
        });

        this.installStatus = "Installation validation initiated";

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


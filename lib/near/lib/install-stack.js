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
exports.NearInstallStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const ssm = __importStar(require("aws-cdk-lib/aws-ssm"));
const nag = __importStar(require("cdk-nag"));
class NearInstallStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { nearNetwork, nearVersion } = props;
        // Import instance ID from infrastructure stack
        const instanceId = cdk.Fn.importValue("NearLocalnetInstanceId");
        // For localnet, the UserData script already compiles and installs NEAR
        // This stack validates the installation is complete via SSM document
        const validateInstallDoc = new ssm.CfnDocument(this, "near-validate-install", {
            documentType: "Command",
            documentFormat: "YAML",
            name: `near-validate-install-${this.stackName}`,
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
        nag.NagSuppressions.addResourceSuppressions(this, [
            {
                id: "AwsSolutions-IAM5",
                reason: "SSM wildcard permissions needed for command execution",
            },
        ], true);
    }
}
exports.NearInstallStack = NearInstallStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5zdGFsbC1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImluc3RhbGwtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBRW5DLHlEQUEyQztBQUMzQyw2Q0FBK0I7QUFRL0IsTUFBYSxnQkFBaUIsU0FBUSxHQUFHLENBQUMsS0FBSztJQUczQyxZQUFZLEtBQThCLEVBQUUsRUFBVSxFQUFFLEtBQTRCO1FBQ2hGLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sRUFBRSxXQUFXLEVBQUUsV0FBVyxFQUFFLEdBQUcsS0FBSyxDQUFDO1FBRTNDLCtDQUErQztRQUMvQyxNQUFNLFVBQVUsR0FBRyxHQUFHLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO1FBRWhFLHVFQUF1RTtRQUN2RSxxRUFBcUU7UUFDckUsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLEdBQUcsQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLHVCQUF1QixFQUFFO1lBQzFFLFlBQVksRUFBRSxTQUFTO1lBQ3ZCLGNBQWMsRUFBRSxNQUFNO1lBQ3RCLElBQUksRUFBRSx5QkFBeUIsSUFBSSxDQUFDLFNBQVMsRUFBRTtZQUMvQyxPQUFPLEVBQUU7Z0JBQ0wsYUFBYSxFQUFFLEtBQUs7Z0JBQ3BCLFdBQVcsRUFBRSxpREFBaUQ7Z0JBQzlELFVBQVUsRUFBRTtvQkFDUixXQUFXLEVBQUU7d0JBQ1QsSUFBSSxFQUFFLFFBQVE7d0JBQ2QsV0FBVyxFQUFFLG1DQUFtQzt3QkFDaEQsT0FBTyxFQUFFLFdBQVc7cUJBQ3ZCO29CQUNELFdBQVcsRUFBRTt3QkFDVCxJQUFJLEVBQUUsUUFBUTt3QkFDZCxXQUFXLEVBQUUsY0FBYzt3QkFDM0IsT0FBTyxFQUFFLFdBQVc7cUJBQ3ZCO2lCQUNKO2dCQUNELFNBQVMsRUFBRTtvQkFDUDt3QkFDSSxNQUFNLEVBQUUsb0JBQW9CO3dCQUM1QixJQUFJLEVBQUUsd0JBQXdCO3dCQUM5QixNQUFNLEVBQUU7NEJBQ0osY0FBYyxFQUFFLEtBQUssRUFBRSxzQkFBc0I7NEJBQzdDLFVBQVUsRUFBRTtnQ0FDUixhQUFhO2dDQUNiLG1CQUFtQjtnQ0FDbkIscUVBQXFFO2dDQUNyRSxzQ0FBc0M7Z0NBQ3RDLEVBQUU7Z0NBQ0YsNERBQTREO2dDQUM1RCw0QkFBNEI7Z0NBQzVCLFdBQVc7Z0NBQ1gsa0ZBQWtGO2dDQUNsRix5RUFBeUU7Z0NBQ3pFLFlBQVk7Z0NBQ1osNkJBQTZCO2dDQUM3QixNQUFNO2dDQUNOLEVBQUU7Z0NBQ0YsbURBQW1EO2dDQUNuRCxzREFBc0Q7Z0NBQ3RELFVBQVU7Z0NBQ1YsSUFBSTtnQ0FDSixFQUFFO2dDQUNGLGdDQUFnQztnQ0FDaEMseURBQXlEO2dDQUN6RCx3REFBd0Q7Z0NBQ3hELFVBQVU7Z0NBQ1YsSUFBSTtnQ0FDSixFQUFFO2dDQUNGLGdDQUFnQztnQ0FDaEMsOERBQThEO2dDQUM5RCxrREFBa0Q7Z0NBQ2xELFVBQVU7Z0NBQ1YsSUFBSTtnQ0FDSixFQUFFO2dDQUNGLHlEQUF5RDtnQ0FDekQsK0NBQStDOzZCQUNsRDt5QkFDSjtxQkFDSjtpQkFDSjthQUNKO1NBQ0osQ0FBQyxDQUFDO1FBRUgsNkNBQTZDO1FBQzdDLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxHQUFHLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSx5QkFBeUIsRUFBRTtZQUM5RSxJQUFJLEVBQUUsa0JBQWtCLENBQUMsR0FBRztZQUM1QixPQUFPLEVBQUU7Z0JBQ0w7b0JBQ0ksR0FBRyxFQUFFLGFBQWE7b0JBQ2xCLE1BQU0sRUFBRSxDQUFDLFVBQVUsQ0FBQztpQkFDdkI7YUFDSjtZQUNELFVBQVUsRUFBRTtnQkFDUixXQUFXLEVBQUUsQ0FBQyxXQUFXLENBQUM7Z0JBQzFCLFdBQVcsRUFBRSxDQUFDLFdBQVcsQ0FBQzthQUM3QjtZQUNELHVCQUF1QixFQUFFLEtBQUs7WUFDOUIsY0FBYyxFQUFFLEdBQUc7WUFDbkIsU0FBUyxFQUFFLEdBQUc7U0FDakIsQ0FBQyxDQUFDO1FBRUgsZ0JBQWdCO1FBQ2hCLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsdUJBQXVCLEVBQUU7WUFDN0MsS0FBSyxFQUFFLGtCQUFrQixDQUFDLEdBQUc7WUFDN0IsVUFBVSxFQUFFLGlDQUFpQztTQUNoRCxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFO1lBQ3RDLEtBQUssRUFBRSxxREFBcUQ7WUFDNUQsVUFBVSxFQUFFLDJCQUEyQjtZQUN2QyxXQUFXLEVBQUUsMkRBQTJEO1NBQzNFLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxhQUFhLEdBQUcsbUNBQW1DLENBQUM7UUFFekQsbUNBQW1DO1FBQ25DLEdBQUcsQ0FBQyxlQUFlLENBQUMsdUJBQXVCLENBQ3ZDLElBQUksRUFDSjtZQUNJO2dCQUNJLEVBQUUsRUFBRSxtQkFBbUI7Z0JBQ3ZCLE1BQU0sRUFBRSx1REFBdUQ7YUFDbEU7U0FDSixFQUNELElBQUksQ0FDUCxDQUFDO0lBQ04sQ0FBQztDQUNKO0FBM0hELDRDQTJIQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCAqIGFzIGNka0NvbnN0cnVjdHMgZnJvbSBcImNvbnN0cnVjdHNcIjtcbmltcG9ydCAqIGFzIHNzbSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXNzbVwiO1xuaW1wb3J0ICogYXMgbmFnIGZyb20gXCJjZGstbmFnXCI7XG5pbXBvcnQgKiBhcyBjb25maWdUeXBlcyBmcm9tIFwiLi9jb25maWcvbm9kZS1jb25maWcuaW50ZXJmYWNlXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTmVhckluc3RhbGxTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICAgIG5lYXJOZXR3b3JrOiBjb25maWdUeXBlcy5OZWFyTmV0d29yaztcbiAgICBuZWFyVmVyc2lvbjogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgTmVhckluc3RhbGxTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gICAgcHVibGljIHJlYWRvbmx5IGluc3RhbGxTdGF0dXM6IHN0cmluZztcblxuICAgIGNvbnN0cnVjdG9yKHNjb3BlOiBjZGtDb25zdHJ1Y3RzLkNvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IE5lYXJJbnN0YWxsU3RhY2tQcm9wcykge1xuICAgICAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgICAgICBjb25zdCB7IG5lYXJOZXR3b3JrLCBuZWFyVmVyc2lvbiB9ID0gcHJvcHM7XG5cbiAgICAgICAgLy8gSW1wb3J0IGluc3RhbmNlIElEIGZyb20gaW5mcmFzdHJ1Y3R1cmUgc3RhY2tcbiAgICAgICAgY29uc3QgaW5zdGFuY2VJZCA9IGNkay5Gbi5pbXBvcnRWYWx1ZShcIk5lYXJMb2NhbG5ldEluc3RhbmNlSWRcIik7XG5cbiAgICAgICAgLy8gRm9yIGxvY2FsbmV0LCB0aGUgVXNlckRhdGEgc2NyaXB0IGFscmVhZHkgY29tcGlsZXMgYW5kIGluc3RhbGxzIE5FQVJcbiAgICAgICAgLy8gVGhpcyBzdGFjayB2YWxpZGF0ZXMgdGhlIGluc3RhbGxhdGlvbiBpcyBjb21wbGV0ZSB2aWEgU1NNIGRvY3VtZW50XG4gICAgICAgIGNvbnN0IHZhbGlkYXRlSW5zdGFsbERvYyA9IG5ldyBzc20uQ2ZuRG9jdW1lbnQodGhpcywgXCJuZWFyLXZhbGlkYXRlLWluc3RhbGxcIiwge1xuICAgICAgICAgICAgZG9jdW1lbnRUeXBlOiBcIkNvbW1hbmRcIixcbiAgICAgICAgICAgIGRvY3VtZW50Rm9ybWF0OiBcIllBTUxcIixcbiAgICAgICAgICAgIG5hbWU6IGBuZWFyLXZhbGlkYXRlLWluc3RhbGwtJHt0aGlzLnN0YWNrTmFtZX1gLFxuICAgICAgICAgICAgY29udGVudDoge1xuICAgICAgICAgICAgICAgIHNjaGVtYVZlcnNpb246IFwiMi4yXCIsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IFwiVmFsaWRhdGUgTkVBUiBsb2NhbG5ldCBpbnN0YWxsYXRpb24gaXMgY29tcGxldGVcIixcbiAgICAgICAgICAgICAgICBwYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICAgICAgICAgIG5lYXJWZXJzaW9uOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBcIlN0cmluZ1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IFwiTkVBUiBQcm90b2NvbCB2ZXJzaW9uIHRvIHZhbGlkYXRlXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OiBuZWFyVmVyc2lvblxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBuZWFyTmV0d29yazoge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJTdHJpbmdcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBcIk5FQVIgbmV0d29ya1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDogbmVhck5ldHdvcmtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgbWFpblN0ZXBzOiBbXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjdGlvbjogXCJhd3M6cnVuU2hlbGxTY3JpcHRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IFwid2FpdEZvckluc3RhbGxDb21wbGV0ZVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgaW5wdXRzOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGltZW91dFNlY29uZHM6IFwiOTAwXCIsIC8vIDE1IG1pbnV0ZXMgbWF4IHdhaXRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBydW5Db21tYW5kOiBbXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiIyEvYmluL2Jhc2hcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJzZXQgLWV1byBwaXBlZmFpbFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImVjaG8gJ1tJTlNUQUxMLVNUQUNLXSBXYWl0aW5nIGZvciBORUFSIGluc3RhbGxhdGlvbiB0byBjb21wbGV0ZS4uLidcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJzb3VyY2UgL2V0Yy9uZWFyLWVudmlyb25tZW50IHx8IHRydWVcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIjIENoZWNrIGlmIGluaXRpYWxpemF0aW9uIGxvZyBleGlzdHMgKGNyZWF0ZWQgYnkgVXNlckRhdGEpXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiTUFYX1dBSVQ9OTAwICAjIDE1IG1pbnV0ZXNcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJFTEFQU0VEPTBcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJ3aGlsZSBbICEgLWYgL3Zhci9sb2cvbmVhci1pbml0LWNvbXBsZXRlLmxvZyBdICYmIFsgJEVMQVBTRUQgLWx0ICRNQVhfV0FJVCBdOyBkb1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiAgZWNobyAnW0lOU1RBTEwtU1RBQ0tdIFdhaXRpbmcgZm9yIGluc3RhbGxhdGlvbi4uLiAoJEVMQVBTRUQgc2Vjb25kcyknXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiICBzbGVlcCAzMFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiAgRUxBUFNFRD0kKChFTEFQU0VEICsgMzApKVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImRvbmVcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJpZiBbICEgLWYgL3Zhci9sb2cvbmVhci1pbml0LWNvbXBsZXRlLmxvZyBdOyB0aGVuXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiICBlY2hvICdbSU5TVEFMTC1TVEFDS10gRVJST1I6IEluc3RhbGxhdGlvbiB0aW1lb3V0J1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiAgZXhpdCAxXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZmlcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIjIENoZWNrIGlmIG5lYXJkIGJpbmFyeSBleGlzdHNcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJpZiBbICEgLWYgfnVidW50dS9uZWFyY29yZS90YXJnZXQvcmVsZWFzZS9uZWFyZCBdOyB0aGVuXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiICBlY2hvICdbSU5TVEFMTC1TVEFDS10gRVJST1I6IG5lYXJkIGJpbmFyeSBub3QgZm91bmQnXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiICBleGl0IDFcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJmaVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIlwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiMgQ2hlY2sgaWYgbmVhcnVwIGlzIGluc3RhbGxlZFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImlmICEgY29tbWFuZCAtdiB+dWJ1bnR1Ly5sb2NhbC9iaW4vbmVhcnVwICY+IC9kZXYvbnVsbDsgdGhlblwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiAgZWNobyAnW0lOU1RBTEwtU1RBQ0tdIEVSUk9SOiBuZWFydXAgbm90IGZvdW5kJ1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiAgZXhpdCAxXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZmlcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJlY2hvICdbSU5TVEFMTC1TVEFDS10gSW5zdGFsbGF0aW9uIHZhbGlkYXRpb24gY29tcGxldGUnXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZWNobyAnW0lOU1RBTEwtU1RBQ0tdIE5FQVIgbG9jYWxuZXQgaXMgcmVhZHknXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEV4ZWN1dGUgdGhlIHZhbGlkYXRpb24gdmlhIFNTTSBhc3NvY2lhdGlvblxuICAgICAgICBjb25zdCB2YWxpZGF0ZUV4ZWN1dGlvbiA9IG5ldyBzc20uQ2ZuQXNzb2NpYXRpb24odGhpcywgXCJuZWFyLXZhbGlkYXRlLWV4ZWN1dGlvblwiLCB7XG4gICAgICAgICAgICBuYW1lOiB2YWxpZGF0ZUluc3RhbGxEb2MucmVmLFxuICAgICAgICAgICAgdGFyZ2V0czogW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAga2V5OiBcIkluc3RhbmNlSWRzXCIsXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlczogW2luc3RhbmNlSWRdXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIHBhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgICAgICBuZWFyVmVyc2lvbjogW25lYXJWZXJzaW9uXSxcbiAgICAgICAgICAgICAgICBuZWFyTmV0d29yazogW25lYXJOZXR3b3JrXVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGFwcGx5T25seUF0Q3JvbkludGVydmFsOiBmYWxzZSxcbiAgICAgICAgICAgIG1heENvbmN1cnJlbmN5OiBcIjFcIixcbiAgICAgICAgICAgIG1heEVycm9yczogXCIwXCJcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gU3RhY2sgb3V0cHV0c1xuICAgICAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcImluc3RhbGwtZG9jdW1lbnQtbmFtZVwiLCB7XG4gICAgICAgICAgICB2YWx1ZTogdmFsaWRhdGVJbnN0YWxsRG9jLnJlZixcbiAgICAgICAgICAgIGV4cG9ydE5hbWU6IFwiTmVhckxvY2FsbmV0SW5zdGFsbERvY3VtZW50TmFtZVwiLFxuICAgICAgICB9KTtcblxuICAgICAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcImluc3RhbGwtc3RhdHVzXCIsIHtcbiAgICAgICAgICAgIHZhbHVlOiBcIkluc3RhbGxhdGlvbiB2YWxpZGF0aW9uIGluaXRpYXRlZCAtIG1vbml0b3IgdmlhIFNTTVwiLFxuICAgICAgICAgICAgZXhwb3J0TmFtZTogXCJOZWFyTG9jYWxuZXRJbnN0YWxsU3RhdHVzXCIsXG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogXCJWYWxpZGF0ZXMgTkVBUiBsb2NhbG5ldCBpbnN0YWxsYXRpb24gZnJvbSBVc2VyRGF0YSBzY3JpcHRcIlxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmluc3RhbGxTdGF0dXMgPSBcIkluc3RhbGxhdGlvbiB2YWxpZGF0aW9uIGluaXRpYXRlZFwiO1xuXG4gICAgICAgIC8vIEFkZGluZyBzdXBwcmVzc2lvbnMgdG8gdGhlIHN0YWNrXG4gICAgICAgIG5hZy5OYWdTdXBwcmVzc2lvbnMuYWRkUmVzb3VyY2VTdXBwcmVzc2lvbnMoXG4gICAgICAgICAgICB0aGlzLFxuICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgaWQ6IFwiQXdzU29sdXRpb25zLUlBTTVcIixcbiAgICAgICAgICAgICAgICAgICAgcmVhc29uOiBcIlNTTSB3aWxkY2FyZCBwZXJtaXNzaW9ucyBuZWVkZWQgZm9yIGNvbW1hbmQgZXhlY3V0aW9uXCIsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB0cnVlXG4gICAgICAgICk7XG4gICAgfVxufVxuXG4iXX0=
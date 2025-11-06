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
const cdk = __importStar(require("aws-cdk-lib"));
const assertions_1 = require("aws-cdk-lib/assertions");
const common_stack_1 = require("../lib/common-stack");
describe("NearCommonStack", () => {
    let app;
    let stack;
    beforeEach(() => {
        app = new cdk.App();
        stack = new common_stack_1.NearCommonStack(app, "TestStack", {
            env: { account: "123456789012", region: "us-east-1" },
        });
    });
    test("creates VPC with 2 AZs", () => {
        const template = assertions_1.Template.fromStack(stack);
        template.hasResourceProperties("AWS::EC2::VPC", {
            EnableDnsHostnames: true,
            EnableDnsSupport: true,
        });
    });
    test("creates security group", () => {
        const template = assertions_1.Template.fromStack(stack);
        template.hasResourceProperties("AWS::EC2::SecurityGroup", {
            GroupDescription: "NEAR localnet node security group",
        });
    });
    test("creates IAM role for EC2", () => {
        const template = assertions_1.Template.fromStack(stack);
        template.hasResourceProperties("AWS::IAM::Role", {
            AssumeRolePolicyDocument: {
                Statement: [
                    {
                        Action: "sts:AssumeRole",
                        Effect: "Allow",
                        Principal: {
                            Service: "ec2.amazonaws.com",
                        },
                    },
                ],
            },
        });
    });
    test("exports instance role ARN", () => {
        const template = assertions_1.Template.fromStack(stack);
        template.hasOutput("InstanceRoleArn", {
            Export: {
                Name: "NearNodeInstanceRoleArn",
            },
        });
    });
    test("exports VPC ID", () => {
        const template = assertions_1.Template.fromStack(stack);
        template.hasOutput("VpcId", {
            Export: {
                Name: "NearVpcId",
            },
        });
    });
    test("exports security group ID", () => {
        const template = assertions_1.Template.fromStack(stack);
        template.hasOutput("SecurityGroupId", {
            Export: {
                Name: "NearSecurityGroupId",
            },
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbW9uLXN0YWNrLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjb21tb24tc3RhY2sudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQyx1REFBa0Q7QUFDbEQsc0RBQXNEO0FBRXRELFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSxHQUFHLEVBQUU7SUFDN0IsSUFBSSxHQUFZLENBQUM7SUFDakIsSUFBSSxLQUFzQixDQUFDO0lBRTNCLFVBQVUsQ0FBQyxHQUFHLEVBQUU7UUFDWixHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDcEIsS0FBSyxHQUFHLElBQUksOEJBQWUsQ0FBQyxHQUFHLEVBQUUsV0FBVyxFQUFFO1lBQzFDLEdBQUcsRUFBRSxFQUFFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRTtTQUN4RCxDQUFDLENBQUM7SUFDUCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx3QkFBd0IsRUFBRSxHQUFHLEVBQUU7UUFDaEMsTUFBTSxRQUFRLEdBQUcscUJBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDM0MsUUFBUSxDQUFDLHFCQUFxQixDQUFDLGVBQWUsRUFBRTtZQUM1QyxrQkFBa0IsRUFBRSxJQUFJO1lBQ3hCLGdCQUFnQixFQUFFLElBQUk7U0FDekIsQ0FBQyxDQUFDO0lBQ1AsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsd0JBQXdCLEVBQUUsR0FBRyxFQUFFO1FBQ2hDLE1BQU0sUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzNDLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyx5QkFBeUIsRUFBRTtZQUN0RCxnQkFBZ0IsRUFBRSxtQ0FBbUM7U0FDeEQsQ0FBQyxDQUFDO0lBQ1AsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsMEJBQTBCLEVBQUUsR0FBRyxFQUFFO1FBQ2xDLE1BQU0sUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzNDLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxnQkFBZ0IsRUFBRTtZQUM3Qyx3QkFBd0IsRUFBRTtnQkFDdEIsU0FBUyxFQUFFO29CQUNQO3dCQUNJLE1BQU0sRUFBRSxnQkFBZ0I7d0JBQ3hCLE1BQU0sRUFBRSxPQUFPO3dCQUNmLFNBQVMsRUFBRTs0QkFDUCxPQUFPLEVBQUUsbUJBQW1CO3lCQUMvQjtxQkFDSjtpQkFDSjthQUNKO1NBQ0osQ0FBQyxDQUFDO0lBQ1AsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsMkJBQTJCLEVBQUUsR0FBRyxFQUFFO1FBQ25DLE1BQU0sUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzNDLFFBQVEsQ0FBQyxTQUFTLENBQUMsaUJBQWlCLEVBQUU7WUFDbEMsTUFBTSxFQUFFO2dCQUNKLElBQUksRUFBRSx5QkFBeUI7YUFDbEM7U0FDSixDQUFDLENBQUM7SUFDUCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxHQUFHLEVBQUU7UUFDeEIsTUFBTSxRQUFRLEdBQUcscUJBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDM0MsUUFBUSxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUU7WUFDeEIsTUFBTSxFQUFFO2dCQUNKLElBQUksRUFBRSxXQUFXO2FBQ3BCO1NBQ0osQ0FBQyxDQUFDO0lBQ1AsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsMkJBQTJCLEVBQUUsR0FBRyxFQUFFO1FBQ25DLE1BQU0sUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzNDLFFBQVEsQ0FBQyxTQUFTLENBQUMsaUJBQWlCLEVBQUU7WUFDbEMsTUFBTSxFQUFFO2dCQUNKLElBQUksRUFBRSxxQkFBcUI7YUFDOUI7U0FDSixDQUFDLENBQUM7SUFDUCxDQUFDLENBQUMsQ0FBQztBQUNQLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0IHsgVGVtcGxhdGUgfSBmcm9tIFwiYXdzLWNkay1saWIvYXNzZXJ0aW9uc1wiO1xuaW1wb3J0IHsgTmVhckNvbW1vblN0YWNrIH0gZnJvbSBcIi4uL2xpYi9jb21tb24tc3RhY2tcIjtcblxuZGVzY3JpYmUoXCJOZWFyQ29tbW9uU3RhY2tcIiwgKCkgPT4ge1xuICAgIGxldCBhcHA6IGNkay5BcHA7XG4gICAgbGV0IHN0YWNrOiBOZWFyQ29tbW9uU3RhY2s7XG5cbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgICAgYXBwID0gbmV3IGNkay5BcHAoKTtcbiAgICAgICAgc3RhY2sgPSBuZXcgTmVhckNvbW1vblN0YWNrKGFwcCwgXCJUZXN0U3RhY2tcIiwge1xuICAgICAgICAgICAgZW52OiB7IGFjY291bnQ6IFwiMTIzNDU2Nzg5MDEyXCIsIHJlZ2lvbjogXCJ1cy1lYXN0LTFcIiB9LFxuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoXCJjcmVhdGVzIFZQQyB3aXRoIDIgQVpzXCIsICgpID0+IHtcbiAgICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spO1xuICAgICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkVDMjo6VlBDXCIsIHtcbiAgICAgICAgICAgIEVuYWJsZURuc0hvc3RuYW1lczogdHJ1ZSxcbiAgICAgICAgICAgIEVuYWJsZURuc1N1cHBvcnQ6IHRydWUsXG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdChcImNyZWF0ZXMgc2VjdXJpdHkgZ3JvdXBcIiwgKCkgPT4ge1xuICAgICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG4gICAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6RUMyOjpTZWN1cml0eUdyb3VwXCIsIHtcbiAgICAgICAgICAgIEdyb3VwRGVzY3JpcHRpb246IFwiTkVBUiBsb2NhbG5ldCBub2RlIHNlY3VyaXR5IGdyb3VwXCIsXG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdChcImNyZWF0ZXMgSUFNIHJvbGUgZm9yIEVDMlwiLCAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKTtcbiAgICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpJQU06OlJvbGVcIiwge1xuICAgICAgICAgICAgQXNzdW1lUm9sZVBvbGljeURvY3VtZW50OiB7XG4gICAgICAgICAgICAgICAgU3RhdGVtZW50OiBbXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIEFjdGlvbjogXCJzdHM6QXNzdW1lUm9sZVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgRWZmZWN0OiBcIkFsbG93XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBQcmluY2lwYWw6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBTZXJ2aWNlOiBcImVjMi5hbWF6b25hd3MuY29tXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoXCJleHBvcnRzIGluc3RhbmNlIHJvbGUgQVJOXCIsICgpID0+IHtcbiAgICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spO1xuICAgICAgICB0ZW1wbGF0ZS5oYXNPdXRwdXQoXCJJbnN0YW5jZVJvbGVBcm5cIiwge1xuICAgICAgICAgICAgRXhwb3J0OiB7XG4gICAgICAgICAgICAgICAgTmFtZTogXCJOZWFyTm9kZUluc3RhbmNlUm9sZUFyblwiLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KFwiZXhwb3J0cyBWUEMgSURcIiwgKCkgPT4ge1xuICAgICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG4gICAgICAgIHRlbXBsYXRlLmhhc091dHB1dChcIlZwY0lkXCIsIHtcbiAgICAgICAgICAgIEV4cG9ydDoge1xuICAgICAgICAgICAgICAgIE5hbWU6IFwiTmVhclZwY0lkXCIsXG4gICAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoXCJleHBvcnRzIHNlY3VyaXR5IGdyb3VwIElEXCIsICgpID0+IHtcbiAgICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spO1xuICAgICAgICB0ZW1wbGF0ZS5oYXNPdXRwdXQoXCJTZWN1cml0eUdyb3VwSWRcIiwge1xuICAgICAgICAgICAgRXhwb3J0OiB7XG4gICAgICAgICAgICAgICAgTmFtZTogXCJOZWFyU2VjdXJpdHlHcm91cElkXCIsXG4gICAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICB9KTtcbn0pO1xuXG4iXX0=
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
const infrastructure_stack_1 = require("../lib/infrastructure-stack");
describe("NearInfrastructureStack", () => {
    let app;
    let stack;
    beforeEach(() => {
        app = new cdk.App();
        // First create a common stack to export values
        const commonStack = new cdk.Stack(app, "CommonStack", {
            env: { account: "123456789012", region: "us-east-1" },
        });
        // Create mock exports
        new cdk.CfnOutput(commonStack, "NearVpcId", {
            value: "vpc-12345",
            exportName: "NearVpcId",
        });
        new cdk.CfnOutput(commonStack, "NearSecurityGroupId", {
            value: "sg-12345",
            exportName: "NearSecurityGroupId",
        });
        new cdk.CfnOutput(commonStack, "NearNodeInstanceRoleArn", {
            value: "arn:aws:iam::123456789012:role/test-role",
            exportName: "NearNodeInstanceRoleArn",
        });
        const props = {
            instanceType: "t3.large",
            instanceCpuType: "x86_64",
            nearNetwork: "localnet",
            nearVersion: "2.2.0",
            dataVolume: {
                sizeGiB: 30,
                type: "gp3",
            },
            limitOutTrafficMbps: 1000,
        };
        stack = new infrastructure_stack_1.NearInfrastructureStack(app, "TestStack", {
            ...props,
            env: { account: "123456789012", region: "us-east-1" },
        });
    });
    test("creates EC2 instance", () => {
        const template = assertions_1.Template.fromStack(stack);
        template.hasResourceProperties("AWS::EC2::Instance", {
            InstanceType: "t3.large",
        });
    });
    test("exports instance ID", () => {
        const template = assertions_1.Template.fromStack(stack);
        template.hasOutput("near-instance-id", {
            Export: {
                Name: "NearInstanceId",
            },
        });
    });
    test("exports instance private IP", () => {
        const template = assertions_1.Template.fromStack(stack);
        template.hasOutput("near-instance-private-ip", {
            Export: {
                Name: "NearInstancePrivateIp",
            },
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5mcmFzdHJ1Y3R1cmUtc3RhY2sudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImluZnJhc3RydWN0dXJlLXN0YWNrLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsdURBQWtEO0FBQ2xELHNFQUFzRTtBQUd0RSxRQUFRLENBQUMseUJBQXlCLEVBQUUsR0FBRyxFQUFFO0lBQ3JDLElBQUksR0FBWSxDQUFDO0lBQ2pCLElBQUksS0FBOEIsQ0FBQztJQUVuQyxVQUFVLENBQUMsR0FBRyxFQUFFO1FBQ1osR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBRXBCLCtDQUErQztRQUMvQyxNQUFNLFdBQVcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLGFBQWEsRUFBRTtZQUNsRCxHQUFHLEVBQUUsRUFBRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUU7U0FDeEQsQ0FBQyxDQUFDO1FBRUgsc0JBQXNCO1FBQ3RCLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxXQUFXLEVBQUUsV0FBVyxFQUFFO1lBQ3hDLEtBQUssRUFBRSxXQUFXO1lBQ2xCLFVBQVUsRUFBRSxXQUFXO1NBQzFCLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxXQUFXLEVBQUUscUJBQXFCLEVBQUU7WUFDbEQsS0FBSyxFQUFFLFVBQVU7WUFDakIsVUFBVSxFQUFFLHFCQUFxQjtTQUNwQyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsV0FBVyxFQUFFLHlCQUF5QixFQUFFO1lBQ3RELEtBQUssRUFBRSwwQ0FBMEM7WUFDakQsVUFBVSxFQUFFLHlCQUF5QjtTQUN4QyxDQUFDLENBQUM7UUFFSCxNQUFNLEtBQUssR0FBbUM7WUFDMUMsWUFBWSxFQUFFLFVBQVU7WUFDeEIsZUFBZSxFQUFFLFFBQVE7WUFDekIsV0FBVyxFQUFFLFVBQVU7WUFDdkIsV0FBVyxFQUFFLE9BQU87WUFDcEIsVUFBVSxFQUFFO2dCQUNSLE9BQU8sRUFBRSxFQUFFO2dCQUNYLElBQUksRUFBRSxLQUFLO2FBQ2Q7WUFDRCxtQkFBbUIsRUFBRSxJQUFJO1NBQzVCLENBQUM7UUFFRixLQUFLLEdBQUcsSUFBSSw4Q0FBdUIsQ0FBQyxHQUFHLEVBQUUsV0FBVyxFQUFFO1lBQ2xELEdBQUcsS0FBSztZQUNSLEdBQUcsRUFBRSxFQUFFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRTtTQUN4RCxDQUFDLENBQUM7SUFDUCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxzQkFBc0IsRUFBRSxHQUFHLEVBQUU7UUFDOUIsTUFBTSxRQUFRLEdBQUcscUJBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDM0MsUUFBUSxDQUFDLHFCQUFxQixDQUFDLG9CQUFvQixFQUFFO1lBQ2pELFlBQVksRUFBRSxVQUFVO1NBQzNCLENBQUMsQ0FBQztJQUNQLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHFCQUFxQixFQUFFLEdBQUcsRUFBRTtRQUM3QixNQUFNLFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUMzQyxRQUFRLENBQUMsU0FBUyxDQUFDLGtCQUFrQixFQUFFO1lBQ25DLE1BQU0sRUFBRTtnQkFDSixJQUFJLEVBQUUsZ0JBQWdCO2FBQ3pCO1NBQ0osQ0FBQyxDQUFDO0lBQ1AsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsNkJBQTZCLEVBQUUsR0FBRyxFQUFFO1FBQ3JDLE1BQU0sUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzNDLFFBQVEsQ0FBQyxTQUFTLENBQUMsMEJBQTBCLEVBQUU7WUFDM0MsTUFBTSxFQUFFO2dCQUNKLElBQUksRUFBRSx1QkFBdUI7YUFDaEM7U0FDSixDQUFDLENBQUM7SUFDUCxDQUFDLENBQUMsQ0FBQztBQUNQLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0IHsgVGVtcGxhdGUgfSBmcm9tIFwiYXdzLWNkay1saWIvYXNzZXJ0aW9uc1wiO1xuaW1wb3J0IHsgTmVhckluZnJhc3RydWN0dXJlU3RhY2sgfSBmcm9tIFwiLi4vbGliL2luZnJhc3RydWN0dXJlLXN0YWNrXCI7XG5pbXBvcnQgKiBhcyBjb25maWdUeXBlcyBmcm9tIFwiLi4vbGliL2NvbmZpZy9ub2RlLWNvbmZpZy5pbnRlcmZhY2VcIjtcblxuZGVzY3JpYmUoXCJOZWFySW5mcmFzdHJ1Y3R1cmVTdGFja1wiLCAoKSA9PiB7XG4gICAgbGV0IGFwcDogY2RrLkFwcDtcbiAgICBsZXQgc3RhY2s6IE5lYXJJbmZyYXN0cnVjdHVyZVN0YWNrO1xuXG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICAgIGFwcCA9IG5ldyBjZGsuQXBwKCk7XG4gICAgICAgIFxuICAgICAgICAvLyBGaXJzdCBjcmVhdGUgYSBjb21tb24gc3RhY2sgdG8gZXhwb3J0IHZhbHVlc1xuICAgICAgICBjb25zdCBjb21tb25TdGFjayA9IG5ldyBjZGsuU3RhY2soYXBwLCBcIkNvbW1vblN0YWNrXCIsIHtcbiAgICAgICAgICAgIGVudjogeyBhY2NvdW50OiBcIjEyMzQ1Njc4OTAxMlwiLCByZWdpb246IFwidXMtZWFzdC0xXCIgfSxcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICAvLyBDcmVhdGUgbW9jayBleHBvcnRzXG4gICAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KGNvbW1vblN0YWNrLCBcIk5lYXJWcGNJZFwiLCB7XG4gICAgICAgICAgICB2YWx1ZTogXCJ2cGMtMTIzNDVcIixcbiAgICAgICAgICAgIGV4cG9ydE5hbWU6IFwiTmVhclZwY0lkXCIsXG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgbmV3IGNkay5DZm5PdXRwdXQoY29tbW9uU3RhY2ssIFwiTmVhclNlY3VyaXR5R3JvdXBJZFwiLCB7XG4gICAgICAgICAgICB2YWx1ZTogXCJzZy0xMjM0NVwiLFxuICAgICAgICAgICAgZXhwb3J0TmFtZTogXCJOZWFyU2VjdXJpdHlHcm91cElkXCIsXG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgbmV3IGNkay5DZm5PdXRwdXQoY29tbW9uU3RhY2ssIFwiTmVhck5vZGVJbnN0YW5jZVJvbGVBcm5cIiwge1xuICAgICAgICAgICAgdmFsdWU6IFwiYXJuOmF3czppYW06OjEyMzQ1Njc4OTAxMjpyb2xlL3Rlc3Qtcm9sZVwiLFxuICAgICAgICAgICAgZXhwb3J0TmFtZTogXCJOZWFyTm9kZUluc3RhbmNlUm9sZUFyblwiLFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBwcm9wczogY29uZmlnVHlwZXMuTmVhckJhc2VOb2RlQ29uZmlnID0ge1xuICAgICAgICAgICAgaW5zdGFuY2VUeXBlOiBcInQzLmxhcmdlXCIsXG4gICAgICAgICAgICBpbnN0YW5jZUNwdVR5cGU6IFwieDg2XzY0XCIsXG4gICAgICAgICAgICBuZWFyTmV0d29yazogXCJsb2NhbG5ldFwiLFxuICAgICAgICAgICAgbmVhclZlcnNpb246IFwiMi4yLjBcIixcbiAgICAgICAgICAgIGRhdGFWb2x1bWU6IHtcbiAgICAgICAgICAgICAgICBzaXplR2lCOiAzMCxcbiAgICAgICAgICAgICAgICB0eXBlOiBcImdwM1wiLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGxpbWl0T3V0VHJhZmZpY01icHM6IDEwMDAsXG4gICAgICAgIH07XG5cbiAgICAgICAgc3RhY2sgPSBuZXcgTmVhckluZnJhc3RydWN0dXJlU3RhY2soYXBwLCBcIlRlc3RTdGFja1wiLCB7XG4gICAgICAgICAgICAuLi5wcm9wcyxcbiAgICAgICAgICAgIGVudjogeyBhY2NvdW50OiBcIjEyMzQ1Njc4OTAxMlwiLCByZWdpb246IFwidXMtZWFzdC0xXCIgfSxcbiAgICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KFwiY3JlYXRlcyBFQzIgaW5zdGFuY2VcIiwgKCkgPT4ge1xuICAgICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG4gICAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6RUMyOjpJbnN0YW5jZVwiLCB7XG4gICAgICAgICAgICBJbnN0YW5jZVR5cGU6IFwidDMubGFyZ2VcIixcbiAgICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KFwiZXhwb3J0cyBpbnN0YW5jZSBJRFwiLCAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKTtcbiAgICAgICAgdGVtcGxhdGUuaGFzT3V0cHV0KFwibmVhci1pbnN0YW5jZS1pZFwiLCB7XG4gICAgICAgICAgICBFeHBvcnQ6IHtcbiAgICAgICAgICAgICAgICBOYW1lOiBcIk5lYXJJbnN0YW5jZUlkXCIsXG4gICAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoXCJleHBvcnRzIGluc3RhbmNlIHByaXZhdGUgSVBcIiwgKCkgPT4ge1xuICAgICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG4gICAgICAgIHRlbXBsYXRlLmhhc091dHB1dChcIm5lYXItaW5zdGFuY2UtcHJpdmF0ZS1pcFwiLCB7XG4gICAgICAgICAgICBFeHBvcnQ6IHtcbiAgICAgICAgICAgICAgICBOYW1lOiBcIk5lYXJJbnN0YW5jZVByaXZhdGVJcFwiLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgfSk7XG4gICAgfSk7XG59KTtcblxuIl19
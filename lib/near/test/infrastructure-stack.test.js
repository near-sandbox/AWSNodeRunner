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
const infrastructure_stack_1 = require("../lib/infrastructure-stack");
describe("NearInfrastructureStack", () => {
    let app;
    let stack;
    beforeEach(() => {
        app = new cdk.App();
        const commonStack = new common_stack_1.NearCommonStack(app, "TestCommonStack", {
            env: { account: "123456789012", region: "us-east-1" },
        });
        const props = {
            instanceType: "t3.large",
            instanceCpuType: "x86_64",
            nearNetwork: "localnet",
            nearVersion: "2.10.1",
            dataVolume: {
                sizeGiB: 30,
                type: "gp3",
            },
            limitOutTrafficMbps: 1000,
        };
        stack = new infrastructure_stack_1.NearInfrastructureStack(app, "TestStack", {
            ...props,
            vpc: commonStack.vpc,
            securityGroup: commonStack.securityGroup,
            instanceRole: commonStack.instanceRole,
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
                Name: "NearLocalnetInstanceId",
            },
        });
    });
    test("exports instance private IP", () => {
        const template = assertions_1.Template.fromStack(stack);
        template.hasOutput("near-instance-private-ip", {
            Export: {
                Name: "NearLocalnetInstancePrivateIp",
            },
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5mcmFzdHJ1Y3R1cmUtc3RhY2sudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImluZnJhc3RydWN0dXJlLXN0YWNrLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsdURBQWtEO0FBQ2xELHNEQUFzRDtBQUN0RCxzRUFBc0U7QUFHdEUsUUFBUSxDQUFDLHlCQUF5QixFQUFFLEdBQUcsRUFBRTtJQUNyQyxJQUFJLEdBQVksQ0FBQztJQUNqQixJQUFJLEtBQThCLENBQUM7SUFFbkMsVUFBVSxDQUFDLEdBQUcsRUFBRTtRQUNaLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUVwQixNQUFNLFdBQVcsR0FBRyxJQUFJLDhCQUFlLENBQUMsR0FBRyxFQUFFLGlCQUFpQixFQUFFO1lBQzVELEdBQUcsRUFBRSxFQUFFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRTtTQUN4RCxDQUFDLENBQUM7UUFFSCxNQUFNLEtBQUssR0FBbUM7WUFDMUMsWUFBWSxFQUFFLFVBQVU7WUFDeEIsZUFBZSxFQUFFLFFBQVE7WUFDekIsV0FBVyxFQUFFLFVBQVU7WUFDdkIsV0FBVyxFQUFFLFFBQVE7WUFDckIsVUFBVSxFQUFFO2dCQUNSLE9BQU8sRUFBRSxFQUFFO2dCQUNYLElBQUksRUFBRSxLQUFLO2FBQ2Q7WUFDRCxtQkFBbUIsRUFBRSxJQUFJO1NBQzVCLENBQUM7UUFFRixLQUFLLEdBQUcsSUFBSSw4Q0FBdUIsQ0FBQyxHQUFHLEVBQUUsV0FBVyxFQUFFO1lBQ2xELEdBQUcsS0FBSztZQUNSLEdBQUcsRUFBRSxXQUFXLENBQUMsR0FBRztZQUNwQixhQUFhLEVBQUUsV0FBVyxDQUFDLGFBQWE7WUFDeEMsWUFBWSxFQUFFLFdBQVcsQ0FBQyxZQUFZO1lBQ3RDLEdBQUcsRUFBRSxFQUFFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRTtTQUN4RCxDQUFDLENBQUM7SUFDUCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxzQkFBc0IsRUFBRSxHQUFHLEVBQUU7UUFDOUIsTUFBTSxRQUFRLEdBQUcscUJBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDM0MsUUFBUSxDQUFDLHFCQUFxQixDQUFDLG9CQUFvQixFQUFFO1lBQ2pELFlBQVksRUFBRSxVQUFVO1NBQzNCLENBQUMsQ0FBQztJQUNQLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHFCQUFxQixFQUFFLEdBQUcsRUFBRTtRQUM3QixNQUFNLFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUMzQyxRQUFRLENBQUMsU0FBUyxDQUFDLGtCQUFrQixFQUFFO1lBQ25DLE1BQU0sRUFBRTtnQkFDSixJQUFJLEVBQUUsd0JBQXdCO2FBQ2pDO1NBQ0osQ0FBQyxDQUFDO0lBQ1AsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsNkJBQTZCLEVBQUUsR0FBRyxFQUFFO1FBQ3JDLE1BQU0sUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzNDLFFBQVEsQ0FBQyxTQUFTLENBQUMsMEJBQTBCLEVBQUU7WUFDM0MsTUFBTSxFQUFFO2dCQUNKLElBQUksRUFBRSwrQkFBK0I7YUFDeEM7U0FDSixDQUFDLENBQUM7SUFDUCxDQUFDLENBQUMsQ0FBQztBQUNQLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0IHsgVGVtcGxhdGUgfSBmcm9tIFwiYXdzLWNkay1saWIvYXNzZXJ0aW9uc1wiO1xuaW1wb3J0IHsgTmVhckNvbW1vblN0YWNrIH0gZnJvbSBcIi4uL2xpYi9jb21tb24tc3RhY2tcIjtcbmltcG9ydCB7IE5lYXJJbmZyYXN0cnVjdHVyZVN0YWNrIH0gZnJvbSBcIi4uL2xpYi9pbmZyYXN0cnVjdHVyZS1zdGFja1wiO1xuaW1wb3J0ICogYXMgY29uZmlnVHlwZXMgZnJvbSBcIi4uL2xpYi9jb25maWcvbm9kZS1jb25maWcuaW50ZXJmYWNlXCI7XG5cbmRlc2NyaWJlKFwiTmVhckluZnJhc3RydWN0dXJlU3RhY2tcIiwgKCkgPT4ge1xuICAgIGxldCBhcHA6IGNkay5BcHA7XG4gICAgbGV0IHN0YWNrOiBOZWFySW5mcmFzdHJ1Y3R1cmVTdGFjaztcblxuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgICBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgY29tbW9uU3RhY2sgPSBuZXcgTmVhckNvbW1vblN0YWNrKGFwcCwgXCJUZXN0Q29tbW9uU3RhY2tcIiwge1xuICAgICAgICAgICAgZW52OiB7IGFjY291bnQ6IFwiMTIzNDU2Nzg5MDEyXCIsIHJlZ2lvbjogXCJ1cy1lYXN0LTFcIiB9LFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBwcm9wczogY29uZmlnVHlwZXMuTmVhckJhc2VOb2RlQ29uZmlnID0ge1xuICAgICAgICAgICAgaW5zdGFuY2VUeXBlOiBcInQzLmxhcmdlXCIsXG4gICAgICAgICAgICBpbnN0YW5jZUNwdVR5cGU6IFwieDg2XzY0XCIsXG4gICAgICAgICAgICBuZWFyTmV0d29yazogXCJsb2NhbG5ldFwiLFxuICAgICAgICAgICAgbmVhclZlcnNpb246IFwiMi4xMC4xXCIsXG4gICAgICAgICAgICBkYXRhVm9sdW1lOiB7XG4gICAgICAgICAgICAgICAgc2l6ZUdpQjogMzAsXG4gICAgICAgICAgICAgICAgdHlwZTogXCJncDNcIixcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBsaW1pdE91dFRyYWZmaWNNYnBzOiAxMDAwLFxuICAgICAgICB9O1xuXG4gICAgICAgIHN0YWNrID0gbmV3IE5lYXJJbmZyYXN0cnVjdHVyZVN0YWNrKGFwcCwgXCJUZXN0U3RhY2tcIiwge1xuICAgICAgICAgICAgLi4ucHJvcHMsXG4gICAgICAgICAgICB2cGM6IGNvbW1vblN0YWNrLnZwYyxcbiAgICAgICAgICAgIHNlY3VyaXR5R3JvdXA6IGNvbW1vblN0YWNrLnNlY3VyaXR5R3JvdXAsXG4gICAgICAgICAgICBpbnN0YW5jZVJvbGU6IGNvbW1vblN0YWNrLmluc3RhbmNlUm9sZSxcbiAgICAgICAgICAgIGVudjogeyBhY2NvdW50OiBcIjEyMzQ1Njc4OTAxMlwiLCByZWdpb246IFwidXMtZWFzdC0xXCIgfSxcbiAgICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KFwiY3JlYXRlcyBFQzIgaW5zdGFuY2VcIiwgKCkgPT4ge1xuICAgICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG4gICAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6RUMyOjpJbnN0YW5jZVwiLCB7XG4gICAgICAgICAgICBJbnN0YW5jZVR5cGU6IFwidDMubGFyZ2VcIixcbiAgICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KFwiZXhwb3J0cyBpbnN0YW5jZSBJRFwiLCAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKTtcbiAgICAgICAgdGVtcGxhdGUuaGFzT3V0cHV0KFwibmVhci1pbnN0YW5jZS1pZFwiLCB7XG4gICAgICAgICAgICBFeHBvcnQ6IHtcbiAgICAgICAgICAgICAgICBOYW1lOiBcIk5lYXJMb2NhbG5ldEluc3RhbmNlSWRcIixcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdChcImV4cG9ydHMgaW5zdGFuY2UgcHJpdmF0ZSBJUFwiLCAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKTtcbiAgICAgICAgdGVtcGxhdGUuaGFzT3V0cHV0KFwibmVhci1pbnN0YW5jZS1wcml2YXRlLWlwXCIsIHtcbiAgICAgICAgICAgIEV4cG9ydDoge1xuICAgICAgICAgICAgICAgIE5hbWU6IFwiTmVhckxvY2FsbmV0SW5zdGFuY2VQcml2YXRlSXBcIixcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuICAgIH0pO1xufSk7XG5cbiJdfQ==
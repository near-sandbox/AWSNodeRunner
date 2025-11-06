#!/usr/bin/env node
/**
 * CLI script to trigger NEAR localnet test suite
 *
 * Usage:
 *   npm run trigger-tests [-- --include-write-tests] [-- --test-depth comprehensive]
 *   node scripts/trigger-tests.ts [--include-write-tests] [--test-depth comprehensive]
 */
interface TestOptions {
    includeWriteTests?: boolean;
    testDepth?: "basic" | "comprehensive";
    method?: "lambda" | "ssm";
    instanceId?: string;
    profile?: string;
}
declare function triggerViaLambda(lambdaArn: string, options: TestOptions, profile: string): void;
declare function triggerViaSSM(ssmDocumentName: string, instanceId: string, options: TestOptions, profile: string): Promise<void>;
export { triggerViaLambda, triggerViaSSM };

# NEAR Localnet Test Suite

This directory contains the Lambda function code for the NEAR localnet test suite.

## Files

- `handler.py` - Main Lambda handler that orchestrates test execution
- `bootstrap` - Shell script bootstrap (legacy, not used with Python runtime)
- `utils.sh` - Utility functions for shell-based tests (legacy)

## Lambda Function

The Lambda function runs in the VPC to access the private RPC endpoint. It uses `near-cli` for all test operations.

### Environment Variables

- `RPC_URL` - NEAR RPC endpoint (private IP)
- `NETWORK_ID` - Network identifier (localnet)
- `INCLUDE_WRITE_TESTS` - Boolean flag (default: false)
- `TEST_DEPTH` - Test depth: 'basic' or 'comprehensive'
- `INSTANCE_ID` - EC2 instance ID

### Test Execution

1. **Read Tests** (always run):
   - RPC Status check
   - Latest block query
   - System account view
   - Chain info (comprehensive mode)

2. **Write Tests** (conditional):
   - Account creation
   - Transaction sending
   - Contract deployment (comprehensive mode, if enabled)

### Dependencies

The Lambda function requires:
- `near-cli` binary (can be provided via Lambda Layer or installed in deployment package)
- Python 3.11 runtime
- boto3 (for CloudWatch metrics)

### Fallback Mode

If `near-cli` is not available, the function falls back to using `curl` and `jq` for basic RPC tests. Write tests require `near-cli`.

## Deployment

The Lambda function is deployed automatically as part of the `near-localnet-test` stack. No manual deployment steps required.

## Testing Locally

To test the Lambda function locally:

```bash
# Set environment variables
export RPC_URL="http://10.0.0.1:3030"
export NETWORK_ID="localnet"
export INCLUDE_WRITE_TESTS="false"
export TEST_DEPTH="basic"

# Run handler
python3 handler.py
```

## CloudWatch Metrics

The function sends metrics to CloudWatch:
- `TestsPassed` - Count of passed tests
- `TestsFailed` - Count of failed tests
- `TestDuration` - Total test duration in milliseconds
- `RpcResponseTime` - RPC endpoint response time in milliseconds

## Logs

Test execution logs are sent to CloudWatch Logs:
- Log Group: `/aws/lambda/near-localnet-test`
- Retention: 7 days


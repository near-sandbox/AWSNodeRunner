#!/usr/bin/env python3
"""
Lambda handler for NEAR localnet test suite
Uses near-cli for all test operations
"""

import os
import json
import subprocess
import time
import boto3
from typing import Dict, Any

# CloudWatch client for metrics
cloudwatch = boto3.client('cloudwatch')
METRIC_NAMESPACE = "NEAR/Test"

# Test results tracking
tests_passed = 0
tests_failed = 0
test_start_time = int(time.time() * 1000)


def log(message: str):
    """Log message with timestamp"""
    print(f"[{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}] {message}")


def put_metric(metric_name: str, value: float, unit: str = "Count"):
    """Send CloudWatch metric"""
    try:
        cloudwatch.put_metric_data(
            Namespace=METRIC_NAMESPACE,
            MetricData=[
                {
                    'MetricName': metric_name,
                    'Value': value,
                    'Unit': unit,
                    'Dimensions': [
                        {
                            'Name': 'FunctionName',
                            'Value': os.environ.get('AWS_LAMBDA_FUNCTION_NAME', 'near-localnet-test')
                        }
                    ]
                }
            ]
        )
    except Exception as e:
        log(f"Warning: Failed to put metric {metric_name}: {e}")


def run_test(test_name: str, command: list) -> bool:
    """Run a test command and return True if passed"""
    global tests_passed, tests_failed
    
    log(f"Running test: {test_name}")
    start_time = int(time.time() * 1000)
    
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=120,  # 2 minute timeout per test
            check=True
        )
        end_time = int(time.time() * 1000)
        duration = end_time - start_time
        tests_passed += 1
        log(f"✅ PASS: {test_name} ({duration}ms)")
        if result.stdout:
            log(f"Output: {result.stdout[:500]}")  # First 500 chars
        return True
    except subprocess.TimeoutExpired:
        end_time = int(time.time() * 1000)
        duration = end_time - start_time
        tests_failed += 1
        log(f"❌ FAIL: {test_name} (timeout after {duration}ms)")
        return False
    except subprocess.CalledProcessError as e:
        end_time = int(time.time() * 1000)
        duration = end_time - start_time
        tests_failed += 1
        log(f"❌ FAIL: {test_name} ({duration}ms)")
        log(f"Error: {e.stderr[:500] if e.stderr else str(e)}")
        return False
    except Exception as e:
        end_time = int(time.time() * 1000)
        duration = end_time - start_time
        tests_failed += 1
        log(f"❌ FAIL: {test_name} ({duration}ms)")
        log(f"Exception: {str(e)}")
        return False


def check_near_cli() -> str:
    """Check if near-cli is available and return path"""
    # Check common locations
    possible_paths = [
        "/opt/near-cli/bin/near",
        "/var/task/near",
        "/usr/local/bin/near",
        "near"  # In PATH
    ]
    
    for path in possible_paths:
        try:
            result = subprocess.run(
                [path, "--version"],
                capture_output=True,
                timeout=5,
                check=True
            )
            log(f"Found near-cli: {path}")
            log(f"Version: {result.stdout.decode().strip()}")
            return path
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            continue
    
    # If not found, try to use curl/jq as fallback for basic tests
    log("WARNING: near-cli not found, will use curl/jq fallback")
    return None


def run_read_tests(rpc_url: str, near_cli_path: str, test_depth: str):
    """Run read-only tests"""
    global tests_passed, tests_failed
    
    log("=== Running Read-Only Tests ===")
    
    if near_cli_path:
        # Test 1: RPC Status
        run_test("RPC Status", [near_cli_path, "--nodeUrl", rpc_url, "status"])
        
        # Test 2: Latest Block
        run_test("Latest Block", [near_cli_path, "--nodeUrl", rpc_url, "block", "latest"])
        
        # Test 3: View Account (system account)
        run_test("View System Account", [near_cli_path, "--nodeUrl", rpc_url, "view-account", "node0"])
        
        # Test 4: Chain Info (if available)
        if test_depth == "comprehensive":
            run_test("Chain Info", [near_cli_path, "--nodeUrl", rpc_url, "view-state"])
    else:
        # Fallback: Use curl for basic RPC tests
        import urllib.request
        
        # Test 1: RPC Status (curl)
        def curl_test(name: str, url: str):
            try:
                with urllib.request.urlopen(url, timeout=10) as response:
                    data = json.loads(response.read())
                    log(f"✅ PASS: {name}")
                    tests_passed += 1
                    return True
            except Exception as e:
                log(f"❌ FAIL: {name} - {str(e)}")
                tests_failed += 1
                return False
        
        curl_test("RPC Status", f"{rpc_url}/status")
        curl_test("Network Info", f"{rpc_url}/network_info")
    
    log(f"Read tests completed: {tests_passed} passed, {tests_failed} failed")


def run_write_tests(rpc_url: str, near_cli_path: str, test_depth: str, include_write: bool):
    """Run write tests (conditional)"""
    global tests_passed, tests_failed
    
    if not include_write:
        log("Skipping write tests (INCLUDE_WRITE_TESTS=false)")
        return
    
    if not near_cli_path:
        log("WARNING: Cannot run write tests without near-cli")
        return
    
    log("=== Running Write Tests ===")
    
    # Generate unique test account name
    test_account = f"test-{int(time.time())}.testnet"
    
    # Test 1: Create Account
    run_test("Create Test Account", [
        near_cli_path, "--nodeUrl", rpc_url,
        "create-account", test_account,
        "--masterAccount", "node0"
    ])
    
    # Test 2: Send Transaction (if account creation succeeded)
    if tests_failed == 0:
        run_test("Send Transaction", [
            near_cli_path, "--nodeUrl", rpc_url,
            "send", test_account, "node0", "1 NEAR"
        ])
    
    # Test 3: Deploy Contract (comprehensive mode only)
    if test_depth == "comprehensive" and tests_failed == 0:
        log("Skipping contract deployment (requires contract wasm file)")
        # Would need: run_test("Deploy Contract", [near_cli_path, "--nodeUrl", rpc_url, "deploy", test_account, "contract.wasm"])
    
    log(f"Write tests completed: {tests_passed} passed, {tests_failed} failed")


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Lambda handler entry point"""
    global tests_passed, tests_failed, test_start_time
    
    # Reset counters
    tests_passed = 0
    tests_failed = 0
    test_start_time = int(time.time() * 1000)
    
    # Get configuration from environment or event
    rpc_url = os.environ.get("RPC_URL", "")
    network_id = os.environ.get("NETWORK_ID", "localnet")
    include_write_tests = os.environ.get("INCLUDE_WRITE_TESTS", "false").lower() == "true"
    test_depth = os.environ.get("TEST_DEPTH", "basic")
    instance_id = os.environ.get("INSTANCE_ID", "")
    
    # Override from event if provided
    if isinstance(event, dict):
        include_write_tests = event.get("includeWriteTests", include_write_tests)
        test_depth = event.get("testDepth", test_depth)
    
    log("=== NEAR Localnet Test Suite ===")
    log(f"RPC URL: {rpc_url}")
    log(f"Network ID: {network_id}")
    log(f"Include Write Tests: {include_write_tests}")
    log(f"Test Depth: {test_depth}")
    log(f"Instance ID: {instance_id}")
    
    # Validate RPC URL
    if not rpc_url:
        log("ERROR: RPC_URL environment variable not set")
        put_metric("TestsFailed", 1)
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "RPC_URL not set"})
        }
    
    # Measure RPC response time
    rpc_start = int(time.time() * 1000)
    try:
        import urllib.request
        with urllib.request.urlopen(f"{rpc_url}/status", timeout=5) as response:
            rpc_end = int(time.time() * 1000)
            rpc_duration = rpc_end - rpc_start
            put_metric("RpcResponseTime", rpc_duration, "Milliseconds")
            log(f"RPC response time: {rpc_duration}ms")
    except Exception as e:
        log(f"ERROR: Cannot reach RPC endpoint {rpc_url}: {e}")
        put_metric("TestsFailed", 1)
        return {
            "statusCode": 500,
            "body": json.dumps({"error": f"RPC endpoint unreachable: {str(e)}"})
        }
    
    # Check near-cli availability
    near_cli_path = check_near_cli()
    
    # Run read tests (always)
    run_read_tests(rpc_url, near_cli_path, test_depth)
    
    # Run write tests (conditional)
    run_write_tests(rpc_url, near_cli_path, test_depth, include_write_tests)
    
    # Calculate total duration
    test_end_time = int(time.time() * 1000)
    total_duration = test_end_time - test_start_time
    
    # Send metrics
    put_metric("TestsPassed", tests_passed)
    put_metric("TestsFailed", tests_failed)
    put_metric("TestDuration", total_duration, "Milliseconds")
    
    # Summary
    log("=== Test Summary ===")
    log(f"Total Tests: {tests_passed + tests_failed}")
    log(f"Passed: {tests_passed}")
    log(f"Failed: {tests_failed}")
    log(f"Duration: {total_duration}ms")
    
    # Prepare response
    response_body = {
        "success": tests_failed == 0,
        "testsPassed": tests_passed,
        "testsFailed": tests_failed,
        "duration": total_duration,
        "message": "All tests passed" if tests_failed == 0 else f"{tests_failed} test(s) failed"
    }
    
    # Return response
    if tests_failed > 0:
        log("❌ Test suite failed")
        # Raise exception to fail Lambda invocation (for Custom Resource)
        raise Exception(json.dumps(response_body))
    else:
        log("✅ All tests passed")
        return response_body


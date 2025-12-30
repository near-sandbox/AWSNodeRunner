#!/usr/bin/env python3
"""
Patch genesis.json to add localnet account with reallocation from node0.

This script:
1. Adds localnet Account record with TRANSFER_AMOUNT
2. Adds localnet AccessKey record
3. Subtracts TRANSFER_AMOUNT from node0.amount (keeps total_supply consistent)
4. Preserves all other genesis records
"""

import json
import sys
import os

def main():
    if len(sys.argv) != 5:
        print("Usage: patch-genesis-localnet.py <genesis.json> <public_key> <transfer_amount> <output.json>")
        sys.exit(1)
    
    genesis_path = sys.argv[1]
    public_key = sys.argv[2]
    transfer_amount = sys.argv[3]  # String representation of yoctoNEAR
    output_path = sys.argv[4]
    
    # Read genesis.json
    with open(genesis_path, 'r') as f:
        genesis = json.load(f)
    
    # Find node0 Account record and subtract transfer_amount
    node0_found = False
    for record in genesis.get('records', []):
        if 'Account' in record:
            account = record['Account']
            if account.get('account_id') == 'node0':
                node0_found = True
                current_amount = int(account['account']['amount'])
                new_amount = current_amount - int(transfer_amount)
                if new_amount < 0:
                    print(f"ERROR: node0 balance ({current_amount}) insufficient for transfer ({transfer_amount})")
                    sys.exit(1)
                account['account']['amount'] = str(new_amount)
                print(f"Reallocated {transfer_amount} yoctoNEAR from node0 (new balance: {new_amount})")
                break
    
    if not node0_found:
        print("ERROR: node0 Account record not found in genesis")
        sys.exit(1)
    
    # Add localnet Account record
    localnet_account_record = {
        "Account": {
            "account_id": "localnet",
            "account": {
                "amount": transfer_amount,
                "locked": "0",
                "code_hash": "11111111111111111111111111111111",
                "storage_usage": 182,
                "version": "V1"
            }
        }
    }
    genesis['records'].append(localnet_account_record)
    
    # Add localnet AccessKey record
    localnet_access_key_record = {
        "AccessKey": {
            "account_id": "localnet",
            "public_key": public_key,
            "access_key": {
                "nonce": 0,
                "permission": "FullAccess"
            }
        }
    }
    genesis['records'].append(localnet_access_key_record)
    
    # Write patched genesis
    with open(output_path, 'w') as f:
        json.dump(genesis, f, indent=2)
    
    print(f"Genesis patched successfully: {output_path}")
    print(f"Added localnet account with {transfer_amount} yoctoNEAR")

if __name__ == '__main__':
    main()


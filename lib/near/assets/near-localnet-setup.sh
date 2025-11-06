#!/bin/bash
set -e
exec > >(tee /var/log/near-setup.log) 2>&1

# Update system
apt update

# Install dependencies for NEAR compilation (Ubuntu packages)
apt install -y git binutils-dev libcurl4-openssl-dev zlib1g-dev libdw-dev libiberty-dev cmake gcc g++ python3 python3-pip protobuf-compiler libssl-dev pkg-config clang llvm

# Install Rust as ubuntu user
su - ubuntu -c "curl --proto =https --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y"
su - ubuntu -c "source ~/.cargo/env && rustc --version"

# Clone nearcore
su - ubuntu -c "cd ~ && git clone https://github.com/near/nearcore.git"
su - ubuntu -c "cd ~/nearcore && git checkout 2.2.0"

# Compile neard (takes ~10-15 minutes)
su - ubuntu -c "cd ~/nearcore && source ~/.cargo/env && make neard"

# Install nearup
su - ubuntu -c "pip3 install --user nearup"

# Run nearup localnet with compiled binary
su - ubuntu -c "export PATH=$PATH:~/.local/bin && nearup run localnet --binary-path ~/nearcore/target/release" > /var/log/nearup.log 2>&1 &

# Wait for NEAR to initialize
sleep 60

echo "NEAR localnet initialization complete" > /var/log/near-init-complete.log


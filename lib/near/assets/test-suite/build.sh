#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "Building Lambda test suite package..."

# Install dependencies
echo "Installing dependencies..."
npm install

# Compile TypeScript
echo "Compiling TypeScript..."
npx tsc

# Create deployment package structure
echo "Creating deployment package..."
rm -rf dist-package
mkdir -p dist-package
cp dist/handler.js dist-package/handler.js
cp -r node_modules dist-package/

echo "✅ Lambda package built at dist-package/"
ls -lh dist-package/ | head -20

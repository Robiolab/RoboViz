#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/packages/roboviz"
npm run pack
echo "Run: npx ./packages/roboviz/$(ls -t *.tgz | head -1) serve <file>"

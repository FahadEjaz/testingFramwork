#!/usr/bin/env bash
# Double-click this file to record a new test — no terminal commands to type.
# Pops up plain-English prompts (URL, test name), then opens a browser to record in.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
cd "$DIR/.." || exit 1
exec node scripts/record-test.js

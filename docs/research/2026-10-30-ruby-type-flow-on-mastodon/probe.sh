#!/usr/bin/env bash
set -euo pipefail

usage='usage: probe.sh <callmap checkout> <ruby repo> <out folder>'
callmap=$(cd "${1:?$usage}" && pwd)
repo=$(cd "${2:?$usage}" && pwd)
out=${3:?$usage}

mkdir -p "$out"
out=$(cd "$out" && pwd)
for variant in 1 2 3; do
  CALLMAP_RUBY_TYPE_FLOW=$variant node "$callmap/packages/extractor-ruby/src/cli.ts" "$repo" \
    > "$out/variant-$variant.json"
done

node --input-type=module - "$callmap" "$out" <<'SCRIPT'
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [callmap, out] = process.argv.slice(2);
const { resolutionRateOf } = await import(join(callmap, 'packages/review/src/rate.ts'));
const reasons = ['missing-module', 'dynamic-key', 'untyped', 'function-value', 'no-implementation', 'other'];
console.log(['variant', 'files', 'functions', 'resolved', 'open', 'rate', ...reasons].join('\t'));
for (const variant of [1, 2, 3]) {
  const document = JSON.parse(readFileSync(join(out, `variant-${variant}.json`), 'utf8'));
  const { resolved, open, rate } = resolutionRateOf(document);
  const byReason = reasons.map((reason) => document.openEnds.filter((end) => end.reason === reason).length);
  const percent = `${(rate * 100).toFixed(1)}%`;
  console.log([variant, document.files.length, document.functions.length, resolved, open, percent, ...byReason].join('\t'));
}
SCRIPT

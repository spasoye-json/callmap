#!/usr/bin/env bash
set -euo pipefail

callmap=${1:?usage: probe.sh <callmap checkout> <gitea checkout> <out folder> [extractor tree]}
gitea=${2:?usage: probe.sh <callmap checkout> <gitea checkout> <out folder> [extractor tree]}
out=${3:?usage: probe.sh <callmap checkout> <gitea checkout> <out folder> [extractor tree]}
tree=${4:-c30ead5}
patch=$(cd "$(dirname "$0")" && pwd)/probe.patch
build=$(mktemp -d)
trap 'rm -rf "$build"' EXIT

mkdir -p "$build/packages/extractor-go/go"
git -C "$callmap" archive "$tree" | tar -x -C "$build/packages/extractor-go/go"
(cd "$build" && git apply "$patch")
(cd "$build/packages/extractor-go/go" && GOFLAGS= GOTOOLCHAIN=local GOPROXY=off GOWORK=off go build -o "$build/probe" .)

mkdir -p "$out"
GOPROXY=off "$build/probe" "$gitea" > "$out/with-tests.json" 2> "$out/with-tests.tsv"
GOPROXY=off "$build/probe" "$gitea" --scope '!**/*_test.go' > "$out/without-tests.json" 2> "$out/without-tests.tsv"

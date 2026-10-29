package main

import (
	"regexp"
	"slices"
	"strings"
)

// The glob rule of every extractor, ported from packages/scope/src/scope.ts so that
// one scope takes the same files whichever language reads it: `*` inside one segment, `**` across
// segments, `?` for one character inside a segment, everything else literal, whole path only.
// A glob that starts with `!` leaves out the files it matches.

func segmentPattern(segment string) string {
	quoted := regexp.QuoteMeta(segment)
	quoted = strings.ReplaceAll(quoted, `\?`, "[^/]")
	return strings.ReplaceAll(quoted, `\*`, "[^/]*")
}

func globPattern(glob string) string {
	segments := strings.Split(glob, "/")
	var pattern strings.Builder
	for index, segment := range segments {
		last := index == len(segments)-1
		switch {
		case segment == "**" && last:
			pattern.WriteString(".*")
		case segment == "**":
			pattern.WriteString("(?:[^/]+/)*")
		case last:
			pattern.WriteString(segmentPattern(segment))
		default:
			pattern.WriteString(segmentPattern(segment) + "/")
		}
	}
	return pattern.String()
}

func matches(path string, glob string) bool {
	return regexp.MustCompile("^" + globPattern(glob) + "$").MatchString(path)
}

// inScope reports whether a repo-relative path is in scope. An empty scope narrows nothing.
func inScope(path string, scope []string) bool {
	taken := false
	anyTaking := false
	for _, glob := range scope {
		if leftOut, negated := strings.CutPrefix(glob, "!"); negated {
			if matches(path, leftOut) {
				return false
			}
			continue
		}
		anyTaking = true
		taken = taken || matches(path, glob)
	}
	return taken || !anyTaking
}

// testGlobs is the copy of TEST_GLOBS in packages/scope/src/tests.ts (ADR-0029). The CLI test of
// the extractor fails when the two copies differ.
var testGlobs = []string{
	"**/*_test.go",
	"**/*.test.*",
	"**/*.spec.*",
	"**/*_spec.rb",
	"**/*_test.rb",
	"**/__tests__/**",
	"**/test/**",
	"**/tests/**",
	"**/spec/**",
}

// effectiveScope adds each test glob as a `!` glob after the globs of the user, unless the user
// asks for the tests. A negated glob that the scope already holds does not repeat.
func effectiveScope(scope []string, tests bool) []string {
	if tests {
		return scope
	}
	effective := append([]string{}, scope...)
	for _, glob := range testGlobs {
		if !slices.Contains(scope, "!"+glob) {
			effective = append(effective, "!"+glob)
		}
	}
	return effective
}

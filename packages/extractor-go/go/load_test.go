package main

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func repoOf(t *testing.T, files map[string]string) string {
	t.Helper()
	repo := t.TempDir()
	for path, text := range files {
		full := filepath.Join(repo, filepath.FromSlash(path))
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return repo
}

func loadedFrom(t *testing.T, repo string) ([]string, []string) {
	t.Helper()
	found, err := walk(repo)
	if err != nil {
		t.Fatal(err)
	}
	stderr := &strings.Builder{}
	loaded, err := load(repo, packagesInScope(found, []string{}), false, stderr)
	if err != nil {
		t.Fatal(err)
	}
	paths := []string{}
	for _, loadedPackage := range loaded {
		paths = append(paths, loadedPackage.PkgPath)
	}
	slices.Sort(paths)
	return paths, strings.Split(strings.TrimSuffix(stderr.String(), "\n"), "\n")
}

const moneyGoMod = "module example.com/money\n\ngo 1.22\n"
const moneyGo = "package money\n\nfunc Format() {}\n"
const toolsGoModThatNeedsAnUpdate = "module example.com/tools\n\ngo 1.22\n\nrequire example.com/lint v1.0.0\nrequire example.com/lint v1.1.0\n"
const toolsGo = "package tools\n\nfunc Lint() {}\n"

func TestAModuleThatTheGoToolRefusesGivesOneLineThatNamesTheModuleAndTheError(t *testing.T) {
	paths, lines := loadedFrom(t, repoOf(t, map[string]string{
		"money/go.mod":   moneyGoMod,
		"money/money.go": moneyGo,
		"tools/go.mod":   toolsGoModThatNeedsAnUpdate,
		"tools/lint.go":  toolsGo,
	}))

	if !slices.Equal(paths, []string{"example.com/money"}) {
		t.Fatalf("loaded %v, want only example.com/money", paths)
	}
	if len(lines) != 1 {
		t.Fatalf("printed %q, want one line", lines)
	}
	want := "callmap skipped the Go module in tools, because the go tool refused it: "
	if !strings.HasPrefix(lines[0], want) || !strings.Contains(lines[0], "updates to go.mod needed") {
		t.Fatalf("printed %q, want a line that starts with %q and holds the error of the go tool", lines[0], want)
	}
}

func TestAGoWorkThatTheGoToolRefusesGivesOneLineAndEachModuleLoadsOnItsOwn(t *testing.T) {
	paths, lines := loadedFrom(t, repoOf(t, map[string]string{
		"go.work":        "go 1.99\n\nuse (\n\t./money\n\t./tools\n)\n",
		"money/go.mod":   moneyGoMod,
		"money/money.go": moneyGo,
		"tools/go.mod":   "module example.com/tools\n\ngo 1.22\n",
		"tools/lint.go":  toolsGo,
	}))

	if !slices.Equal(paths, []string{"example.com/money", "example.com/tools"}) {
		t.Fatalf("loaded %v, want example.com/money and example.com/tools", paths)
	}
	if len(lines) != 1 {
		t.Fatalf("printed %q, want one line", lines)
	}
	want := "callmap read each Go module on its own, because the go tool refused the go.work: "
	if !strings.HasPrefix(lines[0], want) || !strings.Contains(lines[0], "1.99") {
		t.Fatalf("printed %q, want a line that starts with %q and holds the error of the go tool", lines[0], want)
	}
}

func TestAModuleAtTheRootOfTheRepoThatTheGoToolRefusesIsNamedAsTheRoot(t *testing.T) {
	paths, lines := loadedFrom(t, repoOf(t, map[string]string{
		"go.mod":  toolsGoModThatNeedsAnUpdate,
		"lint.go": toolsGo,
	}))

	if len(paths) != 0 {
		t.Fatalf("loaded %v, want nothing", paths)
	}
	want := "callmap skipped the Go module at the root of the repo, because the go tool refused it: "
	if len(lines) != 1 || !strings.HasPrefix(lines[0], want) {
		t.Fatalf("printed %q, want one line that starts with %q", lines, want)
	}
}

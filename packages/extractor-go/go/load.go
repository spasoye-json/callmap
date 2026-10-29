package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"maps"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"

	"golang.org/x/tools/go/packages"
)

const loadMode = packages.NeedName |
	packages.NeedFiles |
	packages.NeedCompiledGoFiles |
	packages.NeedImports |
	packages.NeedTypes |
	packages.NeedSyntax |
	packages.NeedTypesInfo |
	packages.NeedForTest |
	packages.NeedModule

// keptGoFlags drops every -mod flag, so the go tool falls back to its own default: readonly, or
// vendor when vendor/modules.txt exists. A -mod=mod from the user would let it rewrite go.mod. It
// drops -trimpath too, because the export data of a module that a replace loads from the repo
// would then name its files without the path of the repo, and its calls would become library calls.
func keptGoFlags(flags string) string {
	kept := []string{}
	for _, flag := range strings.Fields(flags) {
		if strings.HasPrefix(flag, "-mod=") || strings.HasPrefix(flag, "--mod=") || isTrimpath(flag) {
			continue
		}
		kept = append(kept, flag)
	}
	return strings.Join(kept, " ")
}

func isTrimpath(flag string) bool {
	name, _, _ := strings.Cut(strings.TrimPrefix(flag, "-"), "=")
	return name == "-trimpath" || name == "trimpath"
}

// A GOFLAGS from `go env -w` is in the go env file, not in the environment.
func effectiveGoFlags(environ []string) (string, error) {
	command := exec.Command("go", "env", "GOFLAGS")
	command.Env = append(slices.Clone(environ), "GOTOOLCHAIN=local")
	out, err := command.Output()
	return strings.TrimSpace(string(out)), err
}

// goEnv keeps the go tool off the network and off any toolchain but the local one, so a review
// works offline and does the same thing every time. goWork is the go.work to read, or "off", so a
// go.work in a folder above the repo never changes what the repo loads. GOFLAGS is never empty,
// because the go tool reads an empty GOFLAGS from the go env file instead.
func goEnv(environ []string, goFlags string, goWork string) []string {
	env := []string{}
	for _, entry := range environ {
		name, _, _ := strings.Cut(entry, "=")
		switch name {
		case "GOFLAGS", "GOTOOLCHAIN", "GOPROXY", "GOWORK":
		default:
			env = append(env, entry)
		}
	}
	return append(env, "GOFLAGS= "+keptGoFlags(goFlags), "GOTOOLCHAIN=local", "GOPROXY=off", "GOWORK="+goWork)
}

func moduleOf(path string, moduleDirs []string) (string, bool) {
	held, found := "", false
	for _, dir := range moduleDirs {
		if (dir == "" || strings.HasPrefix(path, dir+"/")) && (!found || len(dir) > len(held)) {
			held, found = dir, true
		}
	}
	return held, found
}

// A package with no file in scope is not type-checked, so the time and the memory of a load drop
// with the scope.
func packagesInScope(found tree, scope []string) map[string][]string {
	byModule := map[string][]string{}
	taken := map[string]bool{}
	for _, path := range found.files {
		root, held := moduleOf(path, found.moduleDirs)
		dir := dirOf(path)
		if held && !taken[dir] && inScope(path, scope) {
			byModule[root] = append(byModule[root], dir)
			taken[dir] = true
		}
	}
	return byModule
}

// The test variants type-check each package a second time with its test files, so they load only
// when a test file is in scope.
func testsInScope(found tree, scope []string) bool {
	for _, path := range found.files {
		if strings.HasSuffix(path, "_test.go") && inScope(path, scope) {
			return true
		}
	}
	return false
}

func workspaceOf(repo string) (string, bool, error) {
	goWork := filepath.Join(repo, "go.work")
	_, err := os.Stat(goWork)
	if errors.Is(err, fs.ErrNotExist) {
		return "", false, nil
	}
	return goWork, err == nil, err
}

func loadFrom(dir string, goFlags string, goWork string, patterns []string, tests bool) ([]*packages.Package, error) {
	config := &packages.Config{
		Mode:  loadMode,
		Dir:   dir,
		Env:   goEnv(os.Environ(), goFlags, goWork),
		Tests: tests,
	}
	return packages.Load(config, patterns...)
}

func patternOf(from string, dir string) string {
	if dir == from {
		return "."
	}
	if from == "" {
		return "./" + dir
	}
	return "./" + strings.TrimPrefix(dir, from+"/")
}

func patternsOf(from string, dirs []string) []string {
	patterns := make([]string, 0, len(dirs))
	for _, dir := range dirs {
		patterns = append(patterns, patternOf(from, dir))
	}
	return patterns
}

func workspaceModulesOf(repo string, goWork string, goFlags string) (map[string]bool, error) {
	command := exec.Command("go", "work", "edit", "-json", goWork)
	command.Dir = repo
	command.Env = goEnv(os.Environ(), goFlags, "off")
	out, err := command.Output()
	if err != nil {
		return nil, err
	}
	var read struct{ Use []struct{ DiskPath string } }
	if err := json.Unmarshal(out, &read); err != nil {
		return nil, err
	}
	used := map[string]bool{}
	for _, each := range read.Use {
		dir := filepath.FromSlash(each.DiskPath)
		if !filepath.IsAbs(dir) {
			dir = filepath.Join(repo, dir)
		}
		if relative, inRepo := repoPathOf(repo, dir); inRepo && relative == "." {
			used[""] = true
		} else if inRepo {
			used[relative] = true
		}
	}
	return used, nil
}

// The modules on the use lines of a go.work load once, as the workspace, so the go tool resolves
// each import between them as a build does. A module that the go.work does not use loads on its
// own, so its files still enter the document. A package that does not load comes back with its
// errors on it, and a module that the go tool refuses, such as one that needs a newer go, is left
// out with one line on stderr, so neither stops the extractor. A go.work that the go tool refuses
// leaves each module to load on its own, with one line on stderr.
func load(repo string, inScope map[string][]string, tests bool, stderr io.Writer) ([]*packages.Package, error) {
	if len(inScope) == 0 {
		return []*packages.Package{}, nil
	}
	goWork, inWorkspace, err := workspaceOf(repo)
	if err != nil {
		return nil, err
	}
	goFlags, err := effectiveGoFlags(os.Environ())
	if err != nil {
		return nil, err
	}
	moduleRoots := slices.Sorted(maps.Keys(inScope))
	if !inWorkspace {
		return loadEachOnItsOwn(repo, goFlags, inScope, moduleRoots, tests, stderr), nil
	}
	loaded := []*packages.Package{}
	alone := moduleRoots
	used, err := workspaceModulesOf(repo, goWork, goFlags)
	if err == nil {
		patterns := []string{}
		apart := []string{}
		for _, root := range moduleRoots {
			if used[root] {
				patterns = append(patterns, patternsOf("", inScope[root])...)
			} else {
				apart = append(apart, root)
			}
		}
		if len(patterns) == 0 {
			alone = apart
		} else if fromWorkspace, loadErr := loadFrom(repo, goFlags, goWork, patterns, tests); loadErr == nil {
			loaded, alone = fromWorkspace, apart
		} else {
			err = loadErr
		}
	}
	if err != nil {
		fmt.Fprintf(stderr, "callmap read each Go module on its own, because the go tool refused the go.work: %s\n", oneLineOf(err))
	}
	return append(loaded, loadEachOnItsOwn(repo, goFlags, inScope, alone, tests, stderr)...), nil
}

func loadEachOnItsOwn(repo string, goFlags string, inScope map[string][]string, moduleRoots []string, tests bool, stderr io.Writer) []*packages.Package {
	loaded := []*packages.Package{}
	for _, root := range moduleRoots {
		found, err := loadFrom(filepath.Join(repo, filepath.FromSlash(root)), goFlags, "off", patternsOf(root, inScope[root]), tests)
		if err == nil {
			loaded = append(loaded, found...)
		} else {
			fmt.Fprintf(stderr, "callmap skipped the Go module %s, because the go tool refused it: %s\n", moduleNameOf(root), oneLineOf(err))
		}
	}
	return loaded
}

func moduleNameOf(root string) string {
	if root == "" {
		return "at the root of the repo"
	}
	return "in " + root
}

func oneLineOf(err error) string {
	return strings.Join(strings.Fields(err.Error()), " ")
}

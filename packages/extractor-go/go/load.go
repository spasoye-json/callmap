package main

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
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

// withoutModFlag drops every -mod flag, so the go tool falls back to its own default: readonly, or
// vendor when vendor/modules.txt exists. A -mod=mod from the user would let it rewrite go.mod.
func withoutModFlag(flags string) string {
	kept := []string{}
	for _, flag := range strings.Fields(flags) {
		if strings.HasPrefix(flag, "-mod=") || strings.HasPrefix(flag, "--mod=") {
			continue
		}
		kept = append(kept, flag)
	}
	return strings.Join(kept, " ")
}

// goEnv keeps the go tool off the network and off any toolchain but the local one, so a review
// works offline and does the same thing every time. goWork is the go.work to read, or "off", so a
// go.work in a folder above the repo never changes what the repo loads.
func goEnv(environ []string, goWork string) []string {
	env := []string{}
	for _, entry := range environ {
		name, value, _ := strings.Cut(entry, "=")
		switch name {
		case "GOFLAGS":
			env = append(env, "GOFLAGS="+withoutModFlag(value))
		case "GOTOOLCHAIN", "GOPROXY", "GOWORK":
		default:
			env = append(env, entry)
		}
	}
	return append(env, "GOTOOLCHAIN=local", "GOPROXY=off", "GOWORK="+goWork)
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

// moduleRootsOf names each module that holds a Go file in scope, so a module with no file in
// scope costs no load.
func moduleRootsOf(found tree, scope []string) []string {
	roots := []string{}
	taken := map[string]bool{}
	for _, path := range found.files {
		root, held := moduleOf(path, found.moduleDirs)
		if held && !taken[root] && inScope(path, scope) {
			roots = append(roots, root)
			taken[root] = true
		}
	}
	sort.Strings(roots)
	return roots
}

func workspaceOf(repo string) (string, bool, error) {
	goWork := filepath.Join(repo, "go.work")
	_, err := os.Stat(goWork)
	if errors.Is(err, fs.ErrNotExist) {
		return "", false, nil
	}
	return goWork, err == nil, err
}

func loadFrom(dir string, goWork string, patterns []string) ([]*packages.Package, error) {
	config := &packages.Config{
		Mode:  loadMode,
		Dir:   dir,
		Env:   goEnv(os.Environ(), goWork),
		Tests: true,
	}
	return packages.Load(config, patterns...)
}

// everyPackageOf is the pattern of every package of a module. In a workspace, ./... stops at the
// go.mod of a nested module, so each module needs a pattern of its own.
func everyPackageOf(moduleRoot string) string {
	if moduleRoot == "" {
		return "./..."
	}
	return "./" + moduleRoot + "/..."
}

// load returns every package of each module root, with its test variants. A repo with a go.work
// loads once, as the workspace, so the go tool resolves each import between its modules as a
// build does. A package that does not load comes back with its errors on it, so one broken
// package never stops the extractor.
func load(repo string, moduleRoots []string) ([]*packages.Package, error) {
	if len(moduleRoots) == 0 {
		return []*packages.Package{}, nil
	}
	goWork, inWorkspace, err := workspaceOf(repo)
	if err != nil {
		return nil, err
	}
	if inWorkspace {
		patterns := make([]string, 0, len(moduleRoots))
		for _, root := range moduleRoots {
			patterns = append(patterns, everyPackageOf(root))
		}
		return loadFrom(repo, goWork, patterns)
	}
	loaded := []*packages.Package{}
	for _, root := range moduleRoots {
		found, err := loadFrom(filepath.Join(repo, filepath.FromSlash(root)), "off", []string{"./..."})
		if err != nil {
			return nil, err
		}
		loaded = append(loaded, found...)
	}
	return loaded, nil
}

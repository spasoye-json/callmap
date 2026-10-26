package main

import (
	"os"
	"path/filepath"
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
// works offline and does the same thing every time.
func goEnv(environ []string) []string {
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
	return append(env, "GOTOOLCHAIN=local", "GOPROXY=off", "GOWORK=off")
}

func moduleRootsOf(found tree) []string {
	for _, dir := range found.moduleDirs {
		if dir == "" {
			return []string{""}
		}
	}
	return []string{}
}

// load returns every package of each module root, with its test variants. A package that does
// not load comes back with its errors on it, so one broken package never stops the extractor.
func load(repo string, moduleRoots []string) ([]*packages.Package, error) {
	loaded := []*packages.Package{}
	for _, root := range moduleRoots {
		config := &packages.Config{
			Mode:  loadMode,
			Dir:   filepath.Join(repo, filepath.FromSlash(root)),
			Env:   goEnv(os.Environ()),
			Tests: true,
		}
		found, err := packages.Load(config, "./...")
		if err != nil {
			return nil, err
		}
		loaded = append(loaded, found...)
	}
	return loaded, nil
}

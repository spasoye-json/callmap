package main

import (
	"bufio"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// module is one go.mod of the repo: the import path it declares and the directory it sits in.
type module struct {
	path string
	dir  string
}

// modulePath reads the module line of a go.mod by hand, so the extractor needs nothing outside
// the standard library and never asks the go tool, which may reach for the network.
func modulePath(file string) (string, error) {
	handle, err := os.Open(file)
	if err != nil {
		return "", err
	}
	defer handle.Close()
	lines := bufio.NewScanner(handle)
	for lines.Scan() {
		line := strings.TrimSpace(lines.Text())
		if cut, _, found := strings.Cut(line, "//"); found {
			line = strings.TrimSpace(cut)
		}
		rest, found := strings.CutPrefix(line, "module")
		if !found || rest == "" || (rest[0] != ' ' && rest[0] != '\t' && rest[0] != '"') {
			continue
		}
		rest = strings.TrimSpace(rest)
		if unquoted, err := strconv.Unquote(rest); err == nil {
			return unquoted, nil
		}
		return rest, nil
	}
	return "", lines.Err()
}

// modules reads every go.mod the walk found. A go.mod with no module line declares no import
// path, so no import can reach a package through it.
func modules(repo string, dirs []string) ([]module, error) {
	found := []module{}
	for _, dir := range dirs {
		path, err := modulePath(filepath.Join(repo, filepath.FromSlash(dir), "go.mod"))
		if err != nil {
			return nil, err
		}
		if path != "" {
			found = append(found, module{path: path, dir: dir})
		}
	}
	return found, nil
}

// owner is the directory of the nearest go.mod at or above a directory, which is the module that
// owns the package there. A directory under no go.mod is owned by none, reported as false.
func owner(dir string, moduleDirs map[string]bool) (string, bool) {
	for {
		if moduleDirs[dir] {
			return dir, true
		}
		if dir == "" {
			return "", false
		}
		dir = dirOf(dir)
	}
}

// packageDir is the repo-relative directory an import path names, or false when no module of the
// repo declares it. The module with the longest matching path wins, and the directory must belong
// to that module and not to one nested inside it, because a nested go.mod starts a module of its
// own that the outer import path cannot reach.
func packageDir(importPath string, all []module, moduleDirs map[string]bool) (string, bool) {
	var best *module
	for index := range all {
		candidate := &all[index]
		if importPath != candidate.path && !strings.HasPrefix(importPath, candidate.path+"/") {
			continue
		}
		if best == nil || len(candidate.path) > len(best.path) {
			best = candidate
		}
	}
	if best == nil {
		return "", false
	}
	rest := strings.TrimPrefix(strings.TrimPrefix(importPath, best.path), "/")
	dir := best.dir
	if rest != "" {
		dir = strings.TrimPrefix(dir+"/"+rest, "/")
	}
	if owning, found := owner(dir, moduleDirs); !found || owning != best.dir {
		return "", false
	}
	return dir, true
}

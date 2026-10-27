package main

import (
	"io/fs"
	"path/filepath"
	"sort"
	"strings"
)

// Directories that hold no source of the repo that the extractor reads. The pattern ./... of the go
// tool skips testdata and a directory whose name starts with _, vendor holds other people's
// modules, and a dot directory holds a tool's bookkeeping.
func skipped(name string) bool {
	return name == "vendor" || name == "testdata" || name == "node_modules" ||
		strings.HasPrefix(name, ".") || strings.HasPrefix(name, "_")
}

// tree is what one walk of the repo finds: every Go file, and the directory of every go.mod, both
// by repo-relative path. The root directory is the empty path.
type tree struct {
	files      []string
	moduleDirs []string
}

// walk reads the repo once. A symbolic link is not followed, so a link out of the repo cannot pull
// a foreign file in and a link back into it cannot walk forever.
func walk(repo string) (tree, error) {
	found := tree{files: []string{}, moduleDirs: []string{}}
	err := filepath.WalkDir(repo, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		relative, err := filepath.Rel(repo, path)
		if err != nil {
			return err
		}
		relative = filepath.ToSlash(relative)
		if entry.IsDir() {
			if relative != "." && skipped(entry.Name()) {
				return filepath.SkipDir
			}
			return nil
		}
		if !entry.Type().IsRegular() {
			return nil
		}
		if entry.Name() == "go.mod" {
			found.moduleDirs = append(found.moduleDirs, dirOf(relative))
		} else if strings.HasSuffix(entry.Name(), ".go") {
			found.files = append(found.files, relative)
		}
		return nil
	})
	sort.Strings(found.files)
	return found, err
}

// dirOf is the directory of a repo-relative path, with the root as the empty path.
func dirOf(path string) string {
	dir := filepath.ToSlash(filepath.Dir(path))
	if dir == "." {
		return ""
	}
	return dir
}

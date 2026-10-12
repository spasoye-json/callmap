package main

import (
	"go/parser"
	"go/token"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

type edge struct {
	From string `json:"from"`
	To   string `json:"to"`
}

type document struct {
	Language string   `json:"language"`
	Scope    []string `json:"scope"`
	Files    []string `json:"files"`
	Edges    []edge   `json:"edges"`
}

// importPaths reads only the import block of a file, so a file whose body does not compile still
// gives up its references. A file whose imports cannot be parsed gives up whatever was read before
// the error.
func importPaths(files *token.FileSet, path string) []string {
	parsed, _ := parser.ParseFile(files, path, nil, parser.ImportsOnly)
	if parsed == nil {
		return nil
	}
	found := []string{}
	for _, spec := range parsed.Imports {
		if value, err := strconv.Unquote(spec.Path.Value); err == nil {
			found = append(found, value)
		}
	}
	return found
}

// A test file is never compiled into the package another package imports, so it can reference
// other files but nothing can reference it.
func isTestFile(path string) bool {
	return strings.HasSuffix(path, "_test.go")
}

// extract reads a repo and builds its reference graph document. An import is resolved to a
// package directory of the repo and expanded to an edge to every file of that package, which is
// the crude reading of a Go reference the skeleton accepts: a package is the unit Go imports, so a
// file reaches every file its package is built from. An edge is emitted only when both ends are
// files the document claims, as every extractor does.
func extract(repo string, scope []string) (document, error) {
	found, err := walk(repo)
	if err != nil {
		return document{}, err
	}
	all, err := modules(repo, found.moduleDirs)
	if err != nil {
		return document{}, err
	}
	moduleDirs := map[string]bool{}
	for _, each := range all {
		moduleDirs[each.dir] = true
	}

	files := []string{}
	packages := map[string][]string{}
	for _, path := range found.files {
		if !inScope(path, scope) {
			continue
		}
		files = append(files, path)
		if !isTestFile(path) {
			packages[dirOf(path)] = append(packages[dirOf(path)], path)
		}
	}

	fileSet := token.NewFileSet()
	edges := []edge{}
	for _, from := range files {
		reached := map[string]bool{}
		for _, importPath := range importPaths(fileSet, filepath.Join(repo, filepath.FromSlash(from))) {
			dir, found := packageDir(importPath, all, moduleDirs)
			if !found {
				continue
			}
			for _, to := range packages[dir] {
				if to != from {
					reached[to] = true
				}
			}
		}
		targets := make([]string, 0, len(reached))
		for to := range reached {
			targets = append(targets, to)
		}
		sort.Strings(targets)
		for _, to := range targets {
			edges = append(edges, edge{From: from, To: to})
		}
	}

	return document{Language: "go", Scope: scope, Files: files, Edges: edges}, nil
}

package main

import (
	"go/ast"
	"path/filepath"
	"sort"
	"strings"

	"golang.org/x/tools/go/packages"
)

type sourceFile struct {
	path     string
	filename string
	syntax   *ast.File
	pkg      *packages.Package
	source   []byte
}

// variantRank prefers the test variant of a package of its own, `p [p.test]` or `p_test [p.test]`,
// over the plain `p`, because only the test variant holds the test files. A package that another
// test recompiles, such as `p [q.test]`, holds the files of `p` a third time and is never taken.
func variantRank(pkg *packages.Package) int {
	switch pkg.ForTest {
	case "":
		return 1
	case pkg.PkgPath, strings.TrimSuffix(pkg.PkgPath, "_test"):
		return 2
	}
	return 0
}

func repoPathOf(repo string, filename string) (string, bool) {
	relative, err := filepath.Rel(repo, filename)
	if err != nil || relative == ".." || strings.HasPrefix(relative, "../") || filepath.IsAbs(relative) {
		return "", false
	}
	return filepath.ToSlash(relative), true
}

// sourceFilesOf takes each file in scope once, from the best variant of the packages that hold it.
// A file that a build tag leaves out is in no package, so it never enters the document.
func sourceFilesOf(repo string, scope []string, loaded []*packages.Package) []sourceFile {
	best := map[string]sourceFile{}
	rankOf := map[string]int{}
	for _, pkg := range loaded {
		rank := variantRank(pkg)
		if rank == 0 {
			continue
		}
		for _, syntax := range pkg.Syntax {
			filename := pkg.Fset.File(syntax.FileStart).Name()
			path, inRepo := repoPathOf(repo, filename)
			if !inRepo || !inScope(path, scope) || rankOf[path] >= rank {
				continue
			}
			best[path] = sourceFile{path: path, filename: filename, syntax: syntax, pkg: pkg}
			rankOf[path] = rank
		}
	}
	files := make([]sourceFile, 0, len(best))
	for _, file := range best {
		files = append(files, file)
	}
	sort.Slice(files, func(first, second int) bool { return files[first].path < files[second].path })
	return files
}

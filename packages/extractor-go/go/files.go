package main

import (
	"go/ast"
	"go/token"
	"path/filepath"
	"slices"
	"sort"
	"strings"

	"golang.org/x/tools/go/packages"
)

type sourceFile struct {
	path         string
	filename     string
	repoFilename string
	syntax       *ast.File
	pkg          *packages.Package
	source       []byte
	writtenSet   *token.FileSet
}

type variantRank int

const (
	recompiledForAnotherTest variantRank = iota
	plainVariant
	ownTestVariant
)

// variantRankOf prefers the test variant of a package of its own, `p [p.test]` or
// `p_test [p.test]`, over the plain `p`, because only the test variant holds the test files. A
// package that another test recompiles, such as `p [q.test]`, holds the files of `p` a third time
// and is never taken.
func variantRankOf(pkg *packages.Package) variantRank {
	switch pkg.ForTest {
	case "":
		return plainVariant
	case pkg.PkgPath, strings.TrimSuffix(pkg.PkgPath, "_test"):
		return ownTestVariant
	}
	return recompiledForAnotherTest
}

func repoPathOf(repo string, filename string) (string, bool) {
	relative, err := filepath.Rel(repo, filename)
	if err != nil || relative == ".." || strings.HasPrefix(relative, "../") || filepath.IsAbs(relative) {
		return "", false
	}
	return filepath.ToSlash(relative), true
}

func repoFilenameOf(pkg *packages.Package, syntax *ast.File, filename string) string {
	original := pkg.Fset.PositionFor(syntax.Package, true).Filename
	if original != filename && slices.Contains(pkg.GoFiles, original) {
		return original
	}
	return filename
}

// A file that a build tag leaves out is in no package, so it never enters the document.
func sourceFilesOf(repo string, scope []string, loaded []*packages.Package) []sourceFile {
	best := map[string]sourceFile{}
	rankOf := map[string]variantRank{}
	for _, pkg := range loaded {
		rank := variantRankOf(pkg)
		if rank == recompiledForAnotherTest {
			continue
		}
		for _, syntax := range pkg.Syntax {
			filename := pkg.Fset.File(syntax.FileStart).Name()
			repoFilename := repoFilenameOf(pkg, syntax, filename)
			path, inRepo := repoPathOf(repo, repoFilename)
			if !inRepo || !inScope(path, scope) || rankOf[path] >= rank {
				continue
			}
			best[path] = sourceFile{path: path, filename: filename, repoFilename: repoFilename, syntax: syntax, pkg: pkg}
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

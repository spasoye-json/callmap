package main

import (
	"go/ast"
	"path/filepath"
	"runtime"
	"strings"
)

func lineOf(site callSite) int {
	at := site.call.Fun
	if ident := calleeIdentOf(site.call.Fun); ident != nil {
		at = ident
	}
	return positionOf(site.file.pkg.Fset, at.Pos()).Line
}

func sourceTextOf(site callSite, node ast.Node) string {
	fileSet := site.file.pkg.Fset
	start := positionOf(fileSet, node.Pos())
	end := positionOf(fileSet, node.End())
	return string(site.file.source[start.Offset:end.Offset])
}

func extract(repo string, scope []string) (document, error) {
	absolute, err := filepath.Abs(repo)
	if err != nil {
		return document{}, err
	}
	root, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return document{}, err
	}
	found, err := walk(root)
	if err != nil {
		return document{}, err
	}
	loaded, err := load(root, moduleRootsOf(found))
	if err != nil {
		return document{}, err
	}
	files := sourceFilesOf(root, scope, loaded)
	declared, err := declarationsOf(files)
	if err != nil {
		return document{}, err
	}

	paths := make([]string, 0, len(files))
	documentFiles := map[string]bool{}
	for _, file := range files {
		paths = append(paths, file.path)
		documentFiles[file.filename] = true
	}
	resolve := resolver{documentFiles: documentFiles, functionAt: declared.functionAt}.resolve
	calls := []call{}
	openEnds := []openEnd{}
	for _, site := range declared.sites {
		resolved := resolve(site)
		switch resolved.kind {
		case tiedCall:
			for _, callee := range resolved.callees {
				calls = append(calls, call{Caller: site.caller, Callee: callee, Line: lineOf(site)})
			}
		case openEndCall:
			openEnds = append(openEnds, openEnd{
				Caller:     site.caller,
				Line:       lineOf(site),
				Expression: sourceTextOf(site, site.call.Fun),
				Reason:     resolved.reason,
			})
		}
	}

	return document{
		Language:  "go",
		Checker:   checker{Name: "Go", Version: strings.TrimPrefix(runtime.Version(), "go")},
		Scope:     scope,
		Files:     paths,
		Functions: declared.functions,
		Calls:     calls,
		OpenEnds:  openEnds,
	}, nil
}

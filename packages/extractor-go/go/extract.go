package main

import (
	"fmt"
	"go/ast"
	"go/token"
	"path/filepath"
	"runtime"
	"strings"
)

func calleePositionOf(site callSite) token.Position {
	at := site.written.Fun
	if ident := calleeIdentOf(site.written.Fun); ident != nil {
		at = ident
	}
	return positionOf(site.file.writtenSet, at.Pos())
}

func lineOf(site callSite) int {
	return calleePositionOf(site).Line
}

func groupOf(site callSite) string {
	at := calleePositionOf(site)
	return fmt.Sprintf("%s:%d:%d", site.file.path, at.Line, at.Column)
}

func sourceTextOf(site callSite, node ast.Node) string {
	start := positionOf(site.file.writtenSet, node.Pos())
	end := positionOf(site.file.writtenSet, node.End())
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
	loaded, err := load(root, packagesInScope(found, scope), testsInScope(found, scope))
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
	var indexed origins
	resolve := resolver{
		documentFiles:   documentFiles,
		functionAt:      declared.functionAt,
		implementations: newImplementations(files, loaded, documentFiles, declared.functionAt),
		origins: func() origins {
			if indexed == nil {
				indexed = originsOf(loaded)
			}
			return indexed
		},
	}.resolve
	calls := []call{}
	openEnds := []openEnd{}
	for _, site := range declared.sites {
		resolved := resolve(site)
		switch resolved.kind {
		case tiedCall, oneOfCall:
			group := ""
			if resolved.kind == oneOfCall {
				group = groupOf(site)
			}
			for _, callee := range resolved.callees {
				calls = append(calls, call{Caller: site.caller, Callee: callee, Line: lineOf(site), Group: group})
			}
		case openEndCall:
			openEnds = append(openEnds, openEnd{
				Caller:     site.caller,
				Line:       lineOf(site),
				Expression: sourceTextOf(site, site.written.Fun),
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

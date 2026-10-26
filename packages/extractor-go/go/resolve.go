package main

import (
	"go/ast"
	"go/types"
)

type resolutionKind int

const (
	notACall resolutionKind = iota
	libraryCall
	tiedCall
	openEndCall
)

type resolution struct {
	kind    resolutionKind
	callees []string
	reason  string
}

type resolver struct {
	documentFiles map[string]bool
	functionAt    map[functionKey]string
}

// A rule decides a call site, or passes it to the next rule. The first rule that decides wins, so
// the order of rules is the order of the open-end reasons.
type rule func(resolver, callSite) (resolution, bool)

var rules = []rule{
	notACallRule,
	codeNotLoadedRule,
	staticCallRule,
}

func (each resolver) resolve(site callSite) resolution {
	for _, apply := range rules {
		if decided, found := apply(each, site); found {
			return decided
		}
	}
	return resolution{kind: openEndCall, reason: "other"}
}

// calleeIdentOf is the name that the call site calls: `f` in `f()`, `Method` in `x.Method()`, and
// `f` in `f[int]()`. A call of any other expression, such as `fs[0]()`, has none.
func calleeIdentOf(fun ast.Expr) *ast.Ident {
	switch typed := ast.Unparen(fun).(type) {
	case *ast.Ident:
		return typed
	case *ast.SelectorExpr:
		return typed.Sel
	case *ast.IndexExpr:
		return calleeIdentOf(typed.X)
	case *ast.IndexListExpr:
		return calleeIdentOf(typed.X)
	}
	return nil
}

func notACallRule(_ resolver, site callSite) (resolution, bool) {
	fun := ast.Unparen(site.call.Fun)
	if _, isLiteral := fun.(*ast.FuncLit); isLiteral {
		return resolution{kind: notACall}, true
	}
	info := site.file.pkg.TypesInfo
	if value, typed := info.Types[fun]; typed && value.IsType() {
		return resolution{kind: notACall}, true
	}
	ident := calleeIdentOf(fun)
	if ident == nil {
		return resolution{}, false
	}
	switch info.Uses[ident].(type) {
	case *types.Builtin, *types.TypeName:
		return resolution{kind: notACall}, true
	}
	return resolution{}, false
}

// codeNotLoadedRule catches a name that the type checker could not find, because its import does
// not resolve or the file that declares it is missing.
func codeNotLoadedRule(_ resolver, site callSite) (resolution, bool) {
	ident := calleeIdentOf(site.call.Fun)
	if ident == nil || site.file.pkg.TypesInfo.Uses[ident] != nil {
		return resolution{}, false
	}
	return resolution{kind: openEndCall, reason: "missing-module"}, true
}

func staticCallRule(each resolver, site callSite) (resolution, bool) {
	ident := calleeIdentOf(site.call.Fun)
	if ident == nil {
		return resolution{}, false
	}
	callee, isFunc := site.file.pkg.TypesInfo.Uses[ident].(*types.Func)
	if !isFunc {
		return resolution{}, false
	}
	at := positionOf(site.file.pkg.Fset, callee.Pos())
	if !each.documentFiles[at.Filename] {
		return resolution{kind: libraryCall}, true
	}
	id, declared := each.functionAt[functionKey{filename: at.Filename, line: at.Line, name: callee.Name()}]
	if !declared {
		return resolution{}, false
	}
	return resolution{kind: tiedCall, callees: []string{id}}, true
}

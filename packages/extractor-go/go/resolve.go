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
	oneOfCall
	openEndCall
)

type resolution struct {
	kind    resolutionKind
	callees []string
	reason  openEndReason
}

type resolver struct {
	documentFiles   map[string]bool
	functionAt      map[functionKey]string
	implementations implementations
	origins         func() origins
}

// A rule decides a call site, or passes it to the next rule. The first rule that decides wins, so
// the order of rules is the order of the open-end reasons.
type rule func(resolver, callSite) (resolution, bool)

var rules = []rule{
	notACallRule,
	codeNotLoadedRule,
	dynamicKeyRule,
	untypedRule,
	functionValueRule,
	interfaceCallRule,
	staticCallRule,
}

func (each resolver) resolve(site callSite) resolution {
	for _, apply := range rules {
		if decided, found := apply(each, site); found {
			return decided
		}
	}
	return resolution{kind: openEndCall, reason: otherReason}
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

func calleeSelectorOf(fun ast.Expr) *ast.SelectorExpr {
	switch typed := ast.Unparen(fun).(type) {
	case *ast.SelectorExpr:
		return typed
	case *ast.IndexExpr:
		return calleeSelectorOf(typed.X)
	case *ast.IndexListExpr:
		return calleeSelectorOf(typed.X)
	}
	return nil
}

// codeNotLoadedRule catches a name that the type checker could not find, because its import does
// not resolve or the file that declares it is missing. A method of a receiver whose type a local
// type error lost is untyped instead.
func codeNotLoadedRule(each resolver, site callSite) (resolution, bool) {
	ident := calleeIdentOf(site.call.Fun)
	info := site.file.pkg.TypesInfo
	if ident == nil || info.Uses[ident] != nil {
		return resolution{}, false
	}
	selector := calleeSelectorOf(site.call.Fun)
	cause := notLoadedCause{origins: each.origins, fileSet: site.file.pkg.Fset, visiting: map[sourcePosition]bool{}}
	if selector != nil && !cause.ofMember(info, selector) {
		return resolution{kind: openEndCall, reason: untyped}, true
	}
	return resolution{kind: openEndCall, reason: missingModule}, true
}

func dynamicKeyRule(_ resolver, site callSite) (resolution, bool) {
	index, isIndex := ast.Unparen(site.call.Fun).(*ast.IndexExpr)
	if !isIndex {
		return resolution{}, false
	}
	info := site.file.pkg.TypesInfo
	mapType := info.TypeOf(index.X)
	if mapType == nil {
		return resolution{}, false
	}
	_, isMap := mapType.Underlying().(*types.Map)
	if !isMap || info.Types[index.Index].Value != nil {
		return resolution{}, false
	}
	return resolution{kind: openEndCall, reason: dynamicKey}, true
}

func isInvalid(each types.Type) bool {
	basic, isBasic := each.(*types.Basic)
	return each == nil || isBasic && basic.Kind() == types.Invalid
}

// untypedRule catches a callee whose type the checker lost after a load error. A receiver with an
// invalid type never reaches it, because its method has no object and codeNotLoadedRule decides it.
func untypedRule(_ resolver, site callSite) (resolution, bool) {
	if !isInvalid(site.file.pkg.TypesInfo.TypeOf(site.call.Fun)) {
		return resolution{}, false
	}
	return resolution{kind: openEndCall, reason: untyped}, true
}

// functionValueRule takes a func value from a field, a variable, a parameter or a call result
// only. A map value with a constant key is none of them.
func functionValueRule(_ resolver, site callSite) (resolution, bool) {
	switch ast.Unparen(site.call.Fun).(type) {
	case *ast.Ident, *ast.SelectorExpr, *ast.CallExpr:
	default:
		return resolution{}, false
	}
	info := site.file.pkg.TypesInfo
	if ident := calleeIdentOf(site.call.Fun); ident != nil {
		if _, declared := info.Uses[ident].(*types.Func); declared {
			return resolution{}, false
		}
	}
	calleeType := info.TypeOf(site.call.Fun)
	if calleeType == nil {
		return resolution{}, false
	}
	if _, isFunc := calleeType.Underlying().(*types.Signature); !isFunc {
		return resolution{}, false
	}
	return resolution{kind: openEndCall, reason: functionValue}, true
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

// interfaceOf is the interface of the receiver, and not the interface that declares the method,
// because the receiver may be a wider interface that embeds it, with fewer implementations. The
// interface of a type parameter is its constraint.
func interfaceOf(site callSite) (types.Type, *types.Interface, *types.Func) {
	info := site.file.pkg.TypesInfo
	ident := calleeIdentOf(site.call.Fun)
	if ident == nil {
		return nil, nil, nil
	}
	method, isFunc := info.Uses[ident].(*types.Func)
	if !isFunc || method.Signature().Recv() == nil {
		return nil, nil, nil
	}
	called := method.Signature().Recv().Type()
	if selector, isSelector := ast.Unparen(site.call.Fun).(*ast.SelectorExpr); isSelector {
		if selection := info.Selections[selector]; selection != nil && selection.Kind() == types.MethodVal {
			if types.IsInterface(selection.Recv()) {
				called = selection.Recv()
			}
		}
	}
	if parameter, isParameter := types.Unalias(called).(*types.TypeParam); isParameter {
		called = parameter.Constraint()
	}
	called = types.Unalias(called)
	iface, isInterface := called.Underlying().(*types.Interface)
	if !isInterface {
		return nil, nil, nil
	}
	return called, iface, method
}

// declaredInScope tells whether the repo declares the interface in a file in scope. An interface
// with no name belongs to the repo when a file in scope declares one of its methods.
func (each resolver) declaredInScope(site callSite, called types.Type, iface *types.Interface) bool {
	fileSet := site.file.pkg.Fset
	if named, isNamed := called.(*types.Named); isNamed {
		return each.documentFiles[positionOf(fileSet, named.Obj().Pos()).Filename]
	}
	for method := range iface.Methods() {
		if each.documentFiles[positionOf(fileSet, method.Pos()).Filename] {
			return true
		}
	}
	return false
}

func interfaceCallRule(each resolver, site callSite) (resolution, bool) {
	called, iface, method := interfaceOf(site)
	if iface == nil {
		return resolution{}, false
	}
	if !each.declaredInScope(site, called, iface) {
		return resolution{kind: libraryCall}, true
	}
	if callees := each.implementations.of(called, iface, method); len(callees) > 0 {
		return resolution{kind: oneOfCall, callees: callees}, true
	}
	if each.implementations.implementedOutOfScope(called, iface, method) {
		return resolution{kind: libraryCall}, true
	}
	return resolution{kind: openEndCall, reason: noImplementation}, true
}

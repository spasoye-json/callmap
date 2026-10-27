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
// the order of rules is the order of the open-end reasons. One rule breaks that order:
// codeNotLoadedRule also gives untyped, to a method call on a receiver whose type a local type
// error lost.
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

// A missing name gives missing-module, and so does a callee that took its invalid type from one. A
// callee whose type a local type error lost is untyped, not missing-module.
func codeNotLoadedRule(each resolver, site callSite) (resolution, bool) {
	ident := calleeIdentOf(site.call.Fun)
	info := site.file.pkg.TypesInfo
	notLoaded := codeNotLoaded{origins: each.origins, fileSet: site.file.pkg.Fset, visiting: map[sourcePosition]bool{}}
	if ident != nil && info.Uses[ident] == nil {
		selector := calleeSelectorOf(site.call.Fun)
		if selector != nil && !notLoaded.ofMember(info, selector) {
			return resolution{kind: openEndCall, reason: untyped}, true
		}
		return resolution{kind: openEndCall, reason: missingModule}, true
	}
	if isInvalid(info.TypeOf(site.call.Fun)) && notLoaded.of(info, site.call.Fun) {
		return resolution{kind: openEndCall, reason: missingModule}, true
	}
	return resolution{}, false
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

// A receiver with an invalid type never reaches this rule, because its method has no object and
// codeNotLoadedRule decides it.
func untypedRule(_ resolver, site callSite) (resolution, bool) {
	if !isInvalid(site.file.pkg.TypesInfo.TypeOf(site.call.Fun)) {
		return resolution{}, false
	}
	return resolution{kind: openEndCall, reason: untyped}, true
}

// A map value with a constant key is not a function value.
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
	if _, isFunc := coreTypeOf(calleeType).(*types.Signature); !isFunc {
		return resolution{}, false
	}
	return resolution{kind: openEndCall, reason: functionValue}, true
}

// coreTypeOf is the underlying type of a type, and for a type parameter the underlying type that
// every term of its constraint shares, because the underlying type of a type parameter is its
// constraint. A type parameter with no such type has none.
func coreTypeOf(each types.Type) types.Type {
	parameter, isParameter := types.Unalias(each).(*types.TypeParam)
	if !isParameter {
		return each.Underlying()
	}
	var core types.Type
	for _, term := range termsOf(parameter.Constraint()) {
		if core != nil && !types.Identical(core, term.Underlying()) {
			return nil
		}
		core = term.Underlying()
	}
	return core
}

func termsOf(constraint types.Type) []types.Type {
	iface, isInterface := constraint.Underlying().(*types.Interface)
	if !isInterface {
		return []types.Type{constraint}
	}
	terms := []types.Type{}
	for embedded := range iface.EmbeddedTypes() {
		union, isUnion := embedded.(*types.Union)
		if !isUnion {
			terms = append(terms, termsOf(embedded)...)
			continue
		}
		for term := range union.Terms() {
			terms = append(terms, termsOf(term.Type())...)
		}
	}
	return terms
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

// An interface with no name belongs to the repo when a file in scope declares one of its methods.
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
	if each.implementations.implementedByLibrary(called, iface, method) {
		return resolution{kind: libraryCall}, true
	}
	return resolution{kind: openEndCall, reason: noImplementation}, true
}

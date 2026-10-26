package main

import (
	"go/ast"
	"go/token"
	"go/types"
	"sort"

	"golang.org/x/tools/go/packages"
)

type implementedMethod struct {
	method *types.Func
	id     string
}

type methodSet map[string]implementedMethod

type methodSets map[string][]methodSet

func (sets methodSets) add(methods methodSet) {
	for name := range methods {
		sets[name] = append(sets[name], methods)
	}
}

type implementationKey struct {
	iface  string
	method string
}

type implementations struct {
	inScope   methodSets
	inLibrary func() methodSets
	found     map[implementationKey][]string
	library   map[string]bool
}

func methodSetOf(name *types.TypeName, fileSet *token.FileSet, functionAt map[functionKey]string) methodSet {
	methods := methodSet{}
	all := types.NewMethodSet(types.NewPointer(name.Type()))
	for index := range all.Len() {
		method, isFunc := all.At(index).Obj().(*types.Func)
		if !isFunc {
			continue
		}
		at := positionOf(fileSet, method.Origin().Pos())
		id := functionAt[functionKey{filename: at.Filename, line: at.Line, name: method.Name()}]
		methods[method.Name()] = implementedMethod{method: method, id: id}
	}
	return methods
}

func isImplementation(name *types.TypeName) bool {
	return !name.IsAlias() && !types.IsInterface(name.Type())
}

func inScopeMethodSetsOf(files []sourceFile, functionAt map[functionKey]string) methodSets {
	sets := methodSets{}
	for _, file := range files {
		for _, each := range file.syntax.Decls {
			decl, isGeneral := each.(*ast.GenDecl)
			if !isGeneral || decl.Tok != token.TYPE {
				continue
			}
			for _, spec := range decl.Specs {
				name, isTypeName := file.pkg.TypesInfo.Defs[spec.(*ast.TypeSpec).Name].(*types.TypeName)
				if isTypeName && isImplementation(name) {
					sets.add(methodSetOf(name, file.pkg.Fset, functionAt))
				}
			}
		}
	}
	return sets
}

// libraryMethodSetsOf holds each named type of the loaded packages and of the packages they import
// that no file in scope declares. It reads every imported package, so it runs only when an
// interface of the repo has no implementation in scope.
func libraryMethodSetsOf(loaded []*packages.Package, documentFiles map[string]bool) methodSets {
	sets := methodSets{}
	seen := map[*types.Package]bool{}
	var visit func(pkg *types.Package, fileSet *token.FileSet)
	visit = func(pkg *types.Package, fileSet *token.FileSet) {
		if pkg == nil || seen[pkg] {
			return
		}
		seen[pkg] = true
		scope := pkg.Scope()
		for _, each := range scope.Names() {
			name, isTypeName := scope.Lookup(each).(*types.TypeName)
			if isTypeName && isImplementation(name) && !documentFiles[positionOf(fileSet, name.Pos()).Filename] {
				sets.add(methodSetOf(name, fileSet, nil))
			}
		}
		for _, imported := range pkg.Imports() {
			visit(imported, fileSet)
		}
	}
	for _, pkg := range loaded {
		visit(pkg.Types, pkg.Fset)
	}
	return sets
}

func newImplementations(
	files []sourceFile,
	loaded []*packages.Package,
	documentFiles map[string]bool,
	functionAt map[functionKey]string,
) implementations {
	var library methodSets
	return implementations{
		inScope: inScopeMethodSetsOf(files, functionAt),
		inLibrary: func() methodSets {
			if library == nil {
				library = libraryMethodSetsOf(loaded, documentFiles)
			}
			return library
		},
		found:   map[implementationKey][]string{},
		library: map[string]bool{},
	}
}

func (methods methodSet) implements(iface *types.Interface) bool {
	match := typeMatch{receiverArguments: map[int]types.Type{}, freeArguments: map[*types.TypeParam]types.Type{}}
	for wanted := range iface.Methods() {
		have, has := methods[wanted.Name()]
		if !has || !match.same(have.method.Type(), wanted.Type()) {
			return false
		}
		if !wanted.Exported() && have.method.Pkg().Path() != wanted.Pkg().Path() {
			return false
		}
	}
	return true
}

// of is the method of each type in scope that implements the interface, by the id of its function.
// A type whose method is promoted from a library type has no id, and the library decides for it.
func (each implementations) of(called types.Type, iface *types.Interface, method *types.Func) []string {
	key := implementationKey{iface: types.TypeString(called, nil), method: method.Name()}
	if callees, known := each.found[key]; known {
		return callees
	}
	unique := map[string]bool{}
	for _, methods := range each.inScope[method.Name()] {
		if id := methods[method.Name()].id; id != "" && methods.implements(iface) {
			unique[id] = true
		}
	}
	callees := make([]string, 0, len(unique))
	for id := range unique {
		callees = append(callees, id)
	}
	sort.Strings(callees)
	each.found[key] = callees
	return callees
}

// implementedOutOfScope tells whether a type that no file in scope declares implements the
// interface, or a type in scope does through a method that a library type declares.
func (each implementations) implementedOutOfScope(called types.Type, iface *types.Interface) bool {
	key := types.TypeString(called, nil)
	if implemented, known := each.library[key]; known {
		return implemented
	}
	name := iface.Method(0).Name()
	implemented := false
	for _, sets := range []methodSets{each.inScope, each.inLibrary()} {
		for _, methods := range sets[name] {
			if methods.implements(iface) {
				implemented = true
			}
		}
	}
	each.library[key] = implemented
	return implemented
}

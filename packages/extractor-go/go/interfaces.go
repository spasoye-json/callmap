package main

import (
	"go/ast"
	"go/token"
	"go/types"
	"sort"

	"golang.org/x/tools/go/packages"
)

type implementedMethod struct {
	method   *types.Func
	filename string
	id       string
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
	inScope       methodSets
	inLibrary     func() methodSets
	documentFiles map[string]bool
	found         map[implementationKey][]string
	library       map[implementationKey]bool
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
		methods[method.Name()] = implementedMethod{method: method, filename: at.Filename, id: id}
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

// The walk reads every imported package, so it runs only when an interface of the repo has no
// implementation in scope.
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
		documentFiles: documentFiles,
		found:         map[implementationKey][]string{},
		library:       map[implementationKey]bool{},
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

// An interface that a type in scope embeds is not a library method, because its implementation is
// unknown.
func isLibraryMethod(have implementedMethod, documentFiles map[string]bool) bool {
	return !types.IsInterface(have.method.Signature().Recv().Type()) && !documentFiles[have.filename]
}

func (each implementations) implementedByLibrary(called types.Type, iface *types.Interface, method *types.Func) bool {
	key := implementationKey{iface: types.TypeString(called, nil), method: method.Name()}
	if implemented, known := each.library[key]; known {
		return implemented
	}
	implemented := false
	for _, methods := range each.inScope[method.Name()] {
		if isLibraryMethod(methods[method.Name()], each.documentFiles) && methods.implements(iface) {
			implemented = true
		}
	}
	for _, methods := range each.inLibrary()[method.Name()] {
		if methods.implements(iface) {
			implemented = true
		}
	}
	each.library[key] = implemented
	return implemented
}

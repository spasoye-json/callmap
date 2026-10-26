package main

import (
	"go/ast"
	"go/token"
	"go/types"
	"sort"
)

type implementedMethod struct {
	method *types.Func
	id     string
}

type methodSet map[string]implementedMethod

type implementationKey struct {
	iface   string
	method  string
	pkgPath string
}

type implementations struct {
	sets  []methodSet
	found map[implementationKey][]string
}

func qualifiedByPath(pkg *types.Package) string {
	return pkg.Path()
}

// signatureOf compares methods by text and not by types.Identical, because the test variant of a
// package and its plain variant declare 2 distinct copies of each of its types.
func signatureOf(method *types.Func) string {
	return types.TypeString(method.Type(), qualifiedByPath)
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

func implementationsOf(files []sourceFile, functionAt map[functionKey]string) implementations {
	sets := []methodSet{}
	for _, file := range files {
		for _, each := range file.syntax.Decls {
			decl, isGeneral := each.(*ast.GenDecl)
			if !isGeneral || decl.Tok != token.TYPE {
				continue
			}
			for _, spec := range decl.Specs {
				name, isTypeName := file.pkg.TypesInfo.Defs[spec.(*ast.TypeSpec).Name].(*types.TypeName)
				if !isTypeName || name.IsAlias() || types.IsInterface(name.Type()) {
					continue
				}
				if named, isNamed := name.Type().(*types.Named); !isNamed || named.TypeParams().Len() > 0 {
					continue
				}
				sets = append(sets, methodSetOf(name, file.pkg.Fset, functionAt))
			}
		}
	}
	return implementations{sets: sets, found: map[implementationKey][]string{}}
}

func (methods methodSet) implements(iface *types.Interface) bool {
	for wanted := range iface.Methods() {
		have, has := methods[wanted.Name()]
		if !has || signatureOf(have.method) != signatureOf(wanted) {
			return false
		}
		if !wanted.Exported() && have.method.Pkg().Path() != wanted.Pkg().Path() {
			return false
		}
	}
	return true
}

func (each implementations) of(iface *types.Interface, method *types.Func) []string {
	key := implementationKey{
		iface:   types.TypeString(iface, qualifiedByPath),
		method:  method.Name(),
		pkgPath: method.Pkg().Path(),
	}
	if callees, known := each.found[key]; known {
		return callees
	}
	unique := map[string]bool{}
	for _, methods := range each.sets {
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

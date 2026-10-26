package main

import (
	"go/ast"
	"go/token"
	"go/types"

	"golang.org/x/tools/go/packages"
)

type sourcePosition struct {
	filename string
	offset   int
}

// An origin is an expression that gives a declared name its type: the type of a parameter or a
// field, the value of a variable, or the results of a function.
type origin struct {
	expr ast.Expr
	info *types.Info
}

type origins map[sourcePosition][]origin

func (found origins) add(fileSet *token.FileSet, info *types.Info, name *ast.Ident, exprs ...ast.Expr) {
	at := positionOf(fileSet, name.Pos())
	key := sourcePosition{filename: at.Filename, offset: at.Offset}
	for _, expr := range exprs {
		if expr != nil {
			found[key] = append(found[key], origin{expr: expr, info: info})
		}
	}
}

func valueOf(values []ast.Expr, index int, names int) ast.Expr {
	if len(values) == names {
		return values[index]
	}
	if len(values) > 0 {
		return values[0]
	}
	return nil
}

func (found origins) addFile(fileSet *token.FileSet, info *types.Info, file *ast.File) {
	ast.Inspect(file, func(node ast.Node) bool {
		switch typed := node.(type) {
		case *ast.FuncDecl:
			found.add(fileSet, info, typed.Name, typed.Type)
		case *ast.Field:
			for _, name := range typed.Names {
				found.add(fileSet, info, name, typed.Type)
			}
		case *ast.TypeSpec:
			found.add(fileSet, info, typed.Name, typed.Type)
		case *ast.ValueSpec:
			for index, name := range typed.Names {
				if typed.Type != nil {
					found.add(fileSet, info, name, typed.Type)
				} else {
					found.add(fileSet, info, name, valueOf(typed.Values, index, len(typed.Names)))
				}
			}
		case *ast.AssignStmt:
			if typed.Tok == token.DEFINE {
				for index, each := range typed.Lhs {
					if name, isName := each.(*ast.Ident); isName {
						found.add(fileSet, info, name, valueOf(typed.Rhs, index, len(typed.Lhs)))
					}
				}
			}
		case *ast.RangeStmt:
			if typed.Tok == token.DEFINE {
				for _, each := range []ast.Expr{typed.Key, typed.Value} {
					if name, isName := each.(*ast.Ident); isName {
						found.add(fileSet, info, name, typed.X)
					}
				}
			}
		}
		return true
	})
}

func originsOf(loaded []*packages.Package) origins {
	found := origins{}
	for _, pkg := range loaded {
		for _, file := range pkg.Syntax {
			found.addFile(pkg.Fset, pkg.TypesInfo, file)
		}
	}
	return found
}

// codeNotLoaded tells whether an expression with an invalid type lost its type to code that does
// not load: an import that does not resolve, or a name that no loaded file declares. Otherwise a
// local type error lost it.
type codeNotLoaded struct {
	origins  func() origins
	fileSet  *token.FileSet
	visiting map[sourcePosition]bool
}

func (notLoaded codeNotLoaded) ofObject(object types.Object) bool {
	at := positionOf(notLoaded.fileSet, object.Pos())
	key := sourcePosition{filename: at.Filename, offset: at.Offset}
	if notLoaded.visiting[key] {
		return false
	}
	notLoaded.visiting[key] = true
	for _, each := range notLoaded.origins()[key] {
		if notLoaded.of(each.info, each.expr) {
			return true
		}
	}
	return false
}

func (notLoaded codeNotLoaded) ofIdent(info *types.Info, ident *ast.Ident) bool {
	switch object := info.Uses[ident].(type) {
	case nil:
		return info.Defs[ident] == nil
	case *types.PkgName:
		return true
	case *types.Var, *types.Const, *types.Func, *types.TypeName:
		return (isInvalid(object.Type()) || isInvalidResult(object.Type())) && notLoaded.ofObject(object)
	}
	return false
}

func isInvalidResult(each types.Type) bool {
	signature, isSignature := each.(*types.Signature)
	if !isSignature {
		return false
	}
	for result := range signature.Results().Variables() {
		if isInvalid(result.Type()) {
			return true
		}
	}
	return false
}

// A member that the type checker could not find on a package, or on a type that loads, comes from a
// file that does not load.
func (notLoaded codeNotLoaded) ofMember(info *types.Info, selector *ast.SelectorExpr) bool {
	if ident, isIdent := ast.Unparen(selector.X).(*ast.Ident); isIdent {
		if _, isPackage := info.Uses[ident].(*types.PkgName); isPackage {
			return true
		}
	}
	if !isInvalid(info.TypeOf(selector.X)) {
		return true
	}
	return notLoaded.of(info, selector.X)
}

func (notLoaded codeNotLoaded) of(info *types.Info, expr ast.Expr) bool {
	switch typed := ast.Unparen(expr).(type) {
	case *ast.Ident:
		return notLoaded.ofIdent(info, typed)
	case *ast.SelectorExpr:
		member := info.Uses[typed.Sel]
		if member == nil {
			return notLoaded.ofMember(info, typed)
		}
		return notLoaded.ofObject(member)
	case *ast.CallExpr:
		return notLoaded.of(info, typed.Fun)
	case *ast.StarExpr:
		return notLoaded.of(info, typed.X)
	case *ast.UnaryExpr:
		return notLoaded.of(info, typed.X)
	case *ast.IndexExpr:
		return notLoaded.of(info, typed.X)
	case *ast.IndexListExpr:
		return notLoaded.of(info, typed.X)
	case *ast.SliceExpr:
		return notLoaded.of(info, typed.X)
	case *ast.TypeAssertExpr:
		return typed.Type != nil && notLoaded.of(info, typed.Type)
	case *ast.CompositeLit:
		return typed.Type != nil && notLoaded.of(info, typed.Type)
	case *ast.ArrayType:
		return notLoaded.of(info, typed.Elt)
	case *ast.MapType:
		return notLoaded.of(info, typed.Key) || notLoaded.of(info, typed.Value)
	case *ast.ChanType:
		return notLoaded.of(info, typed.Value)
	case *ast.FuncType:
		if typed.Results == nil {
			return false
		}
		for _, result := range typed.Results.List {
			if notLoaded.of(info, result.Type) {
				return true
			}
		}
	}
	return false
}

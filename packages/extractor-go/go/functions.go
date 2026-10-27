package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"go/ast"
	"go/token"
	"go/types"
	"os"
)

// functionKey finds the function that a *types.Func declares. It holds the line and not the
// column, because a callee from export data keeps only the line of its declaration.
type functionKey struct {
	filename string
	line     int
	name     string
}

type callSite struct {
	caller  string
	call    *ast.CallExpr
	written *ast.CallExpr
	file    sourceFile
}

type declarations struct {
	functions  []function
	functionAt map[functionKey]string
	sites      []callSite
}

func receiverTypeName(expr ast.Expr) string {
	switch typed := expr.(type) {
	case *ast.StarExpr:
		return receiverTypeName(typed.X)
	case *ast.ParenExpr:
		return receiverTypeName(typed.X)
	case *ast.IndexExpr:
		return receiverTypeName(typed.X)
	case *ast.IndexListExpr:
		return receiverTypeName(typed.X)
	}
	return types.ExprString(expr)
}

func functionNameOf(decl *ast.FuncDecl) string {
	if decl.Recv == nil || len(decl.Recv.List) == 0 {
		return decl.Name.Name
	}
	return receiverTypeName(decl.Recv.List[0].Type) + "." + decl.Name.Name
}

func positionOf(fileSet *token.FileSet, pos token.Pos) token.Position {
	return fileSet.PositionFor(pos, false)
}

func sourceHashOf(text []byte) string {
	sum := sha256.Sum256(text)
	return hex.EncodeToString(sum[:])
}

// callsIn finds every call in a function body, a call inside a func literal too, because a func
// literal is not a function and its calls belong to the declaration around it.
func callsIn(body *ast.BlockStmt) []*ast.CallExpr {
	found := []*ast.CallExpr{}
	ast.Inspect(body, func(node ast.Node) bool {
		if call, isCall := node.(*ast.CallExpr); isCall {
			found = append(found, call)
		}
		return true
	})
	return found
}

func declarationsOf(files []sourceFile) (declarations, error) {
	declared := declarations{functions: []function{}, functionAt: map[functionKey]string{}}
	for _, file := range files {
		source, err := os.ReadFile(file.repoFilename)
		if err != nil {
			return declared, err
		}
		file.source = source
		paired, writtenSet, err := writtenFunctionsOf(file)
		if err != nil {
			return declared, err
		}
		file.writtenSet = writtenSet
		seen := map[string]int{}
		for _, each := range paired {
			name := functionNameOf(each.typed)
			seen[name]++
			id := file.path + "#" + name
			if seen[name] > 1 {
				id = fmt.Sprintf("%s~%d", id, seen[name])
			}
			first := positionOf(writtenSet, each.written.Pos())
			last := positionOf(writtenSet, each.written.End())
			declared.functions = append(declared.functions, function{
				ID:         id,
				Name:       name,
				File:       file.path,
				FirstLine:  first.Line,
				LastLine:   last.Line,
				SourceHash: sourceHashOf(source[first.Offset:last.Offset]),
			})
			at := positionOf(file.pkg.Fset, each.typed.Name.Pos())
			declared.functionAt[functionKey{filename: at.Filename, line: at.Line, name: each.typed.Name.Name}] = id
			for _, call := range each.calls {
				declared.sites = append(declared.sites, callSite{caller: id, call: call.typed, written: call.written, file: file})
			}
		}
	}
	return declared, nil
}

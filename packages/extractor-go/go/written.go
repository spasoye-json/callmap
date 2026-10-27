package main

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"go/types"
	"regexp"
)

type pairedCall struct {
	typed   *ast.CallExpr
	written *ast.CallExpr
}

type pairedFunction struct {
	typed   *ast.FuncDecl
	written *ast.FuncDecl
	calls   []pairedCall
}

func bodiesOf(file *ast.File) []*ast.FuncDecl {
	found := []*ast.FuncDecl{}
	for _, each := range file.Decls {
		if decl, isFunc := each.(*ast.FuncDecl); isFunc && decl.Body != nil {
			found = append(found, decl)
		}
	}
	return found
}

// The type checker reads a file that imports "C" as the output of cgo, which rewrites a call into C
// on the same line, so a column after it no longer points into the file of the repo. The lines
// still do, through the //line directives of cgo.
func writtenFunctionsOf(file sourceFile) ([]pairedFunction, *token.FileSet, error) {
	typed := bodiesOf(file.syntax)
	if file.filename == file.repoFilename {
		paired := make([]pairedFunction, 0, len(typed))
		for _, decl := range typed {
			calls := []pairedCall{}
			for _, call := range callsIn(decl.Body) {
				calls = append(calls, pairedCall{typed: call, written: call})
			}
			paired = append(paired, pairedFunction{typed: decl, written: decl, calls: calls})
		}
		return paired, file.pkg.Fset, nil
	}
	writtenSet := token.NewFileSet()
	parsed, err := parser.ParseFile(writtenSet, file.repoFilename, file.source, parser.SkipObjectResolution)
	if err != nil {
		return nil, nil, err
	}
	writtenAt := map[string]*ast.FuncDecl{}
	seen := map[string]int{}
	for _, decl := range bodiesOf(parsed) {
		name := functionNameOf(decl)
		seen[name]++
		writtenAt[fmt.Sprintf("%s~%d", name, seen[name])] = decl
	}
	paired := []pairedFunction{}
	seen = map[string]int{}
	for _, decl := range typed {
		name := functionNameOf(decl)
		seen[name]++
		written, found := writtenAt[fmt.Sprintf("%s~%d", name, seen[name])]
		if !found {
			continue
		}
		paired = append(paired, pairedFunction{
			typed:   decl,
			written: written,
			calls:   writtenCallsOf(file.pkg.Fset, decl, writtenSet, written),
		})
	}
	return paired, writtenSet, nil
}

type callKey struct {
	line int
	text string
}

// The extractor takes a call into C as a library call (ADR-0028), and cgo leaves no call of that
// text in its output.
func isCallIntoC(call *ast.CallExpr) bool {
	selector, isSelector := ast.Unparen(call.Fun).(*ast.SelectorExpr)
	if !isSelector {
		return false
	}
	ident, isIdent := selector.X.(*ast.Ident)
	return isIdent && ident.Name == "C"
}

var (
	cgoFunctionInParens = regexp.MustCompile(`\((_Cfunc_\w+)\)`)
	cgoVariable         = regexp.MustCompile(`\(\*_Cvar_(\w+)\)`)
	cgoName             = regexp.MustCompile(`\b_C(?:type|func|macro|iconst|fconst|sconst|var)_(\w+)`)
)

// cgo writes `_Ctype_int` for `C.int`, so the typed call and the written call differ in their text.
func writtenTextOf(typed ast.Expr) string {
	text := cgoFunctionInParens.ReplaceAllString(types.ExprString(typed), "$1")
	text = cgoVariable.ReplaceAllString(text, "C.$1")
	return cgoName.ReplaceAllString(text, "C.$1")
}

// A call that cgo adds, such as its check of a pointer, has no pair and never enters the document.
func writtenCallsOf(typedSet *token.FileSet, typed *ast.FuncDecl, writtenSet *token.FileSet, written *ast.FuncDecl) []pairedCall {
	typedAt := map[callKey][]*ast.CallExpr{}
	for _, call := range callsIn(typed.Body) {
		key := callKey{line: typedSet.PositionFor(call.Fun.Pos(), true).Line, text: writtenTextOf(call.Fun)}
		typedAt[key] = append(typedAt[key], call)
	}
	paired := []pairedCall{}
	for _, call := range callsIn(written.Body) {
		if isCallIntoC(call) {
			continue
		}
		key := callKey{line: positionOf(writtenSet, call.Fun.Pos()).Line, text: types.ExprString(call.Fun)}
		if waiting := typedAt[key]; len(waiting) > 0 {
			paired = append(paired, pairedCall{typed: waiting[0], written: call})
			typedAt[key] = waiting[1:]
		}
	}
	return paired
}

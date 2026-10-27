package main

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
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
			calls:   writtenCallsOf(decl, written),
		})
	}
	return paired, writtenSet, nil
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

var cgoName = regexp.MustCompile(`^(_C(2func|func|type|macro|var|fpvar|iconst|fconst|sconst)_|_Cgo_(ptr|use|keepalive)$|_cgoCheck(Pointer|Result)$|_cgo(Index|Base|Slice)?\d+$)`)

func isCgoName(name string) bool {
	return cgoName.MatchString(name)
}

func callsCgoName(call *ast.CallExpr) bool {
	ident, isIdent := ast.Unparen(call.Fun).(*ast.Ident)
	return isIdent && isCgoName(ident.Name)
}

// cgo wraps a call into C that passes a Go pointer in a func literal. The literal first binds each
// argument to a _cgo name. A deferred call takes one more func literal, which returns the first.
func cgoCheckBodyOf(call *ast.CallExpr) *ast.BlockStmt {
	fun := ast.Unparen(call.Fun)
	if deferred, isCall := fun.(*ast.CallExpr); isCall && len(deferred.Args) == 0 {
		fun = ast.Unparen(deferred.Fun)
	}
	literal, isLiteral := fun.(*ast.FuncLit)
	if !isLiteral || len(literal.Body.List) == 0 {
		return nil
	}
	if name, _ := cgoBindingOf(literal.Body.List[0]); name == "" {
		return nil
	}
	return literal.Body
}

func cgoBindingOf(statement ast.Stmt) (string, ast.Expr) {
	switch typed := statement.(type) {
	case *ast.AssignStmt:
		if ident, isIdent := typed.Lhs[0].(*ast.Ident); isIdent && len(typed.Rhs) == 1 && isCgoName(ident.Name) {
			return ident.Name, typed.Rhs[0]
		}
	case *ast.DeclStmt:
		if decl, isGen := typed.Decl.(*ast.GenDecl); isGen && len(decl.Specs) == 1 {
			if spec, isValue := decl.Specs[0].(*ast.ValueSpec); isValue && len(spec.Values) == 1 && isCgoName(spec.Names[0].Name) {
				return spec.Names[0].Name, spec.Values[0]
			}
		}
	}
	return "", nil
}

var cgoArgument = regexp.MustCompile(`^_cgo\d+$`)

// cgo moves a part of an argument, such as `a` of `&a[i]`, to a _cgoIndex, _cgoBase or _cgoSlice
// name. That name comes before the argument. So the walk visits the part where the argument names
// it, as callsIn does in the repo file.
type writtenOrder struct {
	calls []*ast.CallExpr
	moved map[string]ast.Expr
}

func (order *writtenOrder) visit(node ast.Node) bool {
	switch typed := node.(type) {
	case *ast.Ident:
		if moved, found := order.moved[typed.Name]; found {
			ast.Inspect(moved, order.visit)
		}
	case *ast.CallExpr:
		if body := cgoCheckBodyOf(typed); body != nil {
			order.visitArguments(body)
			return false
		}
		if !callsCgoName(typed) {
			order.calls = append(order.calls, typed)
		}
	}
	return true
}

func (order *writtenOrder) visitArguments(body *ast.BlockStmt) {
	outer := order.moved
	order.moved = map[string]ast.Expr{}
	for _, statement := range body.List {
		name, value := cgoBindingOf(statement)
		if cgoArgument.MatchString(name) {
			ast.Inspect(value, order.visit)
		} else if name != "" {
			order.moved[name] = value
		}
	}
	order.moved = outer
}

// cgo rewrites the text and the columns of a call into C. So a call pairs by its place in the calls of
// its function. The calls that only one side holds drop out first. If the 2 orders differ in length,
// the function holds a cgo form that the walk does not know. Then no call pairs.
func writtenCallsOf(typed *ast.FuncDecl, written *ast.FuncDecl) []pairedCall {
	order := writtenOrder{calls: []*ast.CallExpr{}}
	ast.Inspect(typed.Body, order.visit)
	writtenCalls := []*ast.CallExpr{}
	for _, call := range callsIn(written.Body) {
		if !isCallIntoC(call) {
			writtenCalls = append(writtenCalls, call)
		}
	}
	typedCalls := order.calls
	if len(typedCalls) != len(writtenCalls) {
		typedCalls = make([]*ast.CallExpr, len(writtenCalls))
	}
	paired := make([]pairedCall, 0, len(writtenCalls))
	for index, call := range writtenCalls {
		paired = append(paired, pairedCall{typed: typedCalls[index], written: call})
	}
	return paired
}

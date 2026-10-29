package main

import (
	"go/ast"
	"go/parser"
	"go/token"
	"reflect"
	"testing"
)

type parsedFunction struct {
	decl    *ast.FuncDecl
	fileSet *token.FileSet
	source  []byte
}

func parsedFunctionOf(t *testing.T, source string) parsedFunction {
	t.Helper()
	fileSet := token.NewFileSet()
	file, err := parser.ParseFile(fileSet, "pay.go", source, 0)
	if err != nil {
		t.Fatal(err)
	}
	return parsedFunction{decl: bodiesOf(file)[0], fileSet: fileSet, source: []byte(source)}
}

type openEndAt struct {
	line       int
	expression string
	reason     openEndReason
}

func TestCallsThatDoNotPairGiveAnOtherOpenEndForEachCallOfTheRepoFile(t *testing.T) {
	typed := parsedFunctionOf(t, "package pay\n\nfunc Pay() {\n\tcharge()\n\t_Cfunc_x()\n\trefund(audit())\n\tunknown()\n}\n")
	written := parsedFunctionOf(t, "package pay\n\nfunc Pay() {\n\tcharge()\n\tC.x()\n\trefund(audit())\n}\n")
	file := sourceFile{source: written.source, writtenSet: written.fileSet}

	found := []openEndAt{}
	for _, call := range writtenCallsOf(typed.decl, written.decl) {
		site := callSite{caller: "pay.go#Pay", call: call.typed, written: call.written, file: file}
		resolved := resolver{}.resolve(site)
		if resolved.kind != openEndCall {
			t.Fatalf("%s resolved to kind %d, not an open end", sourceTextOf(site, site.written.Fun), resolved.kind)
		}
		found = append(found, openEndAt{lineOf(site), sourceTextOf(site, site.written.Fun), resolved.reason})
	}

	want := []openEndAt{
		{4, "charge", otherReason},
		{6, "refund", otherReason},
		{6, "audit", otherReason},
	}
	if !reflect.DeepEqual(found, want) {
		t.Fatalf("found %v, want %v", found, want)
	}
}

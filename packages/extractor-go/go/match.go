package main

import "go/types"

// typeMatch compares 2 types by their structure and the package path and name of each named type,
// and not with types.Identical, because the test variant of a package and its plain variant declare
// 2 distinct copies of each of its types. The names of parameters and results do not count.
//
// A type parameter of the receiver of a generic type takes the first type that it meets, and must
// match the same type everywhere after, so Box[T] implements an interface when one type argument
// for each type parameter makes it implement it. The constraints of the type parameters are not
// checked. A type parameter of the interface side, such as the T of a generic function that calls
// a method of Getter[T], binds in the same way.
type typeMatch struct {
	receiverArguments map[int]types.Type
	freeArguments     map[*types.TypeParam]types.Type
}

func bind[Key comparable](arguments map[Key]types.Type, key Key, to types.Type) bool {
	bound, isBound := arguments[key]
	if !isBound {
		arguments[key] = to
		return true
	}
	return (&typeMatch{}).same(bound, to)
}

func pathOf(name *types.TypeName) string {
	if name.Pkg() == nil {
		return ""
	}
	return name.Pkg().Path()
}

func (match *typeMatch) sameTuple(have *types.Tuple, want *types.Tuple) bool {
	if have.Len() != want.Len() {
		return false
	}
	for index := range have.Len() {
		if !match.same(have.At(index).Type(), want.At(index).Type()) {
			return false
		}
	}
	return true
}

func (match *typeMatch) sameNamed(have *types.Named, want types.Type) bool {
	named, isNamed := want.(*types.Named)
	if !isNamed || have.Obj().Name() != named.Obj().Name() || pathOf(have.Obj()) != pathOf(named.Obj()) {
		return false
	}
	haveArguments, wantArguments := have.TypeArgs(), named.TypeArgs()
	if haveArguments.Len() != wantArguments.Len() {
		return false
	}
	for index := range haveArguments.Len() {
		if !match.same(haveArguments.At(index), wantArguments.At(index)) {
			return false
		}
	}
	return true
}

func (match *typeMatch) sameStruct(have *types.Struct, want types.Type) bool {
	other, isStruct := want.(*types.Struct)
	if !isStruct || have.NumFields() != other.NumFields() {
		return false
	}
	for index := range have.NumFields() {
		haveField, wantField := have.Field(index), other.Field(index)
		if haveField.Name() != wantField.Name() ||
			haveField.Embedded() != wantField.Embedded() ||
			have.Tag(index) != other.Tag(index) ||
			!match.same(haveField.Type(), wantField.Type()) {
			return false
		}
	}
	return true
}

func (match *typeMatch) sameInterface(have *types.Interface, want types.Type) bool {
	other, isInterface := want.(*types.Interface)
	if !isInterface || have.NumMethods() != other.NumMethods() {
		return false
	}
	for index := range have.NumMethods() {
		haveMethod, wantMethod := have.Method(index), other.Method(index)
		if haveMethod.Name() != wantMethod.Name() || !match.same(haveMethod.Type(), wantMethod.Type()) {
			return false
		}
	}
	return true
}

func (match *typeMatch) same(have types.Type, want types.Type) bool {
	have, want = types.Unalias(have), types.Unalias(want)
	if parameter, isParameter := have.(*types.TypeParam); isParameter && match.receiverArguments != nil {
		return bind(match.receiverArguments, parameter.Index(), want)
	}
	if parameter, isParameter := want.(*types.TypeParam); isParameter && match.freeArguments != nil {
		return bind(match.freeArguments, parameter, have)
	}
	switch typed := have.(type) {
	case *types.Basic:
		other, isBasic := want.(*types.Basic)
		return isBasic && typed.Kind() == other.Kind()
	case *types.Named:
		return match.sameNamed(typed, want)
	case *types.Pointer:
		other, isPointer := want.(*types.Pointer)
		return isPointer && match.same(typed.Elem(), other.Elem())
	case *types.Slice:
		other, isSlice := want.(*types.Slice)
		return isSlice && match.same(typed.Elem(), other.Elem())
	case *types.Array:
		other, isArray := want.(*types.Array)
		return isArray && typed.Len() == other.Len() && match.same(typed.Elem(), other.Elem())
	case *types.Map:
		other, isMap := want.(*types.Map)
		return isMap && match.same(typed.Key(), other.Key()) && match.same(typed.Elem(), other.Elem())
	case *types.Chan:
		other, isChan := want.(*types.Chan)
		return isChan && typed.Dir() == other.Dir() && match.same(typed.Elem(), other.Elem())
	case *types.Signature:
		other, isSignature := want.(*types.Signature)
		return isSignature &&
			typed.Variadic() == other.Variadic() &&
			match.sameTuple(typed.Params(), other.Params()) &&
			match.sameTuple(typed.Results(), other.Results())
	case *types.Struct:
		return match.sameStruct(typed, want)
	case *types.Interface:
		return match.sameInterface(typed, want)
	case *types.TypeParam:
		return typed == want
	}
	return types.Identical(have, want)
}

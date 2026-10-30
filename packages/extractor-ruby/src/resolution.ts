import type { FunctionId, OpenEndReason } from '@callmap/graph-document';
import { madeNamesOf } from './macros.ts';
import type { CallSite, ConstantReference, MadeValue, RubyBody, RubyMethod } from './ripper.ts';

export interface IndexedMethod extends RubyMethod {
  readonly id: FunctionId;
  readonly file: string;
}

export type Resolution =
  | { readonly kind: 'call'; readonly callee: FunctionId }
  | { readonly kind: 'one-of'; readonly callees: readonly FunctionId[] }
  | { readonly kind: 'open-end'; readonly reason: OpenEndReason }
  | { readonly kind: 'library' };

/** What one load unit holds: every body and every `def` of its files, under one set of names. */
export interface LoadUnitIndex {
  readonly bodies: readonly RubyBody[];
  readonly methods: readonly IndexedMethod[];
  /** The constants that exist with no body of their own, such as a name that Zeitwerk derives. */
  readonly names: readonly string[];
}

type Side = 'instance' | 'singleton';

/** Every body of one full name in a load unit, merged, as Ruby merges them. */
interface RubyClass {
  readonly name: string;
  readonly bodies: RubyBody[];
  readonly instance: Map<string, IndexedMethod>;
  readonly singleton: Map<string, IndexedMethod>;
  /** The names that a macro of a body makes, on each side. */
  readonly made: Record<Side, Set<string>>;
}

/** One step of a class chain: the methods of one side of a class, or a class outside the repo. */
type Ancestor = { readonly owner: RubyClass; readonly side: Side } | 'library';

type Found = IndexedMethod | 'library' | 'none';

/** Why a call that ties to no method of the repo is an open end, if its name has a def. */
type Unproved = 'missing-module' | 'untyped' | 'other';

/** What each class below a module or an abstract method finds for the name, one of which runs. */
interface OneOf {
  readonly oneOf: readonly Found[];
}

const LIBRARY: Resolution = { kind: 'library' };

const ACTIVE_RECORD = 'ActiveRecord::Base';

/** The class methods of a model that return one record, as a stub of ActiveRecord. */
const FINDERS = new Set([
  'find',
  'find_by',
  'find_by!',
  'find_sole_by',
  'sole',
  'create',
  'create!',
  'find_or_create_by',
  'find_or_create_by!',
  'find_or_initialize_by',
  'create_or_find_by',
  'create_or_find_by!',
]);

const namespacesOf = (name: string): readonly string[] => {
  const segments = name.split('::');
  return segments.map((_, index) => segments.slice(0, index + 1).join('::'));
};

/**
 * The variant of the local type flow that the probe measures (ADR-0027). Each one ties a call on a
 * literal, on `Foo.new` and on a local variable. Variant 2 adds an instance variable, and variant 3
 * adds the finders of a model.
 */
export type TypeFlow = 1 | 2 | 3;

type Written = MadeValue | null;

export const resolverOf = (
  unit: LoadUnitIndex,
  definedNames: ReadonlySet<string>,
  claimed: ReadonlySet<string>,
  typeFlow: TypeFlow,
) => {
  const classes = new Map<string, RubyClass>();
  const classOf = (name: string): RubyClass => {
    const known = classes.get(name) ?? {
      name,
      bodies: [],
      instance: new Map(),
      singleton: new Map(),
      made: { instance: new Set(), singleton: new Set() },
    };
    classes.set(name, known);
    return known;
  };
  for (const body of unit.bodies) {
    const owner = classOf(body.name);
    owner.bodies.push(body);
    for (const macro of body.macros) {
      const { side, names } = madeNamesOf(macro);
      for (const name of names) owner.made[side].add(name);
    }
  }
  for (const method of unit.methods) {
    const { instance, singleton } = classOf(method.owner);
    (method.singleton ? singleton : instance).set(method.name, method);
  }
  const constants = new Set(
    [...unit.bodies.map(({ name }) => name), ...unit.names].flatMap(namespacesOf),
  );

  const constantOf = ({ nesting, path, absolute }: ConstantReference): string | undefined => {
    const [head, ...rest] = path;
    if (head === undefined) return undefined;
    const lexical = absolute
      ? [head]
      : [...nesting.map((namespace) => [...namespace, head].join('::')), head];
    const found = lexical.find((candidate) => constants.has(candidate));
    if (found === undefined) return undefined;
    const full = [found, ...rest].join('::');
    return constants.has(full) ? full : undefined;
  };

  const mixinsOf = (owner: RubyClass, kind: 'include' | 'prepend' | 'extend') =>
    owner.bodies
      .flatMap(({ mixins }) => mixins)
      .filter((mixin) => mixin.kind === kind)
      .reverse();

  /** A module as a mixin brings its prepends, its own methods, then its includes. */
  const moduleChainOf = (reference: ConstantReference, seen: Set<string>): readonly Ancestor[] => {
    const name = constantOf(reference);
    const owner = name === undefined ? undefined : classes.get(name);
    if (owner === undefined) return ['library'];
    if (seen.has(owner.name)) return [];
    seen.add(owner.name);
    return [
      ...mixinsOf(owner, 'prepend').flatMap((mixin) => moduleChainOf(mixin, seen)),
      { owner, side: 'instance' },
      ...mixinsOf(owner, 'include').flatMap((mixin) => moduleChainOf(mixin, seen)),
    ];
  };

  /** A class that includes a Rails concern is extended with the `ClassMethods` of the concern. */
  const classMethodsOf = (reference: ConstantReference, seen: Set<string>): readonly Ancestor[] => {
    const name = constantOf(reference);
    const classMethods = `${name}::ClassMethods`;
    if (name === undefined || !classes.has(classMethods)) return [];
    return moduleChainOf({ nesting: [], path: classMethods.split('::'), absolute: true }, seen);
  };

  const superclassOf = (owner: RubyClass): ConstantReference | null =>
    owner.bodies.find(({ superclass }) => superclass !== null)?.superclass ?? null;

  const chainOf = (name: string, side: Side, seen: Set<string>): readonly Ancestor[] => {
    const owner = classes.get(name);
    if (owner === undefined) return ['library'];
    if (seen.has(name)) return [];
    seen.add(name);
    const own: Ancestor[] =
      side === 'instance'
        ? [
            ...mixinsOf(owner, 'prepend').flatMap((mixin) => moduleChainOf(mixin, seen)),
            { owner, side },
            ...mixinsOf(owner, 'include').flatMap((mixin) => moduleChainOf(mixin, seen)),
          ]
        : [
            { owner, side },
            ...mixinsOf(owner, 'extend').flatMap((mixin) => moduleChainOf(mixin, seen)),
            ...mixinsOf(owner, 'include').flatMap((mixin) => classMethodsOf(mixin, seen)),
          ];
    const superclass = superclassOf(owner);
    if (superclass === null) return own;
    const parent = constantOf(superclass);
    if (parent === undefined) return [...own, 'library'];
    return [...own, ...chainOf(parent, side, seen)];
  };

  const chains = new Map<string, readonly Ancestor[]>();
  const chainFor = (name: string, side: Side): readonly Ancestor[] => {
    const key = `${side} ${name}`;
    const known = chains.get(key) ?? chainOf(name, side, new Set());
    chains.set(key, known);
    return known;
  };

  const isModule = (name: string): boolean =>
    classes.get(name)?.bodies.some((body) => body.module) ?? false;

  /** The classes, each with the side of its chain, that have this step in their chain. */
  const below = new Map<string, readonly { readonly name: string; readonly side: Side }[]>();
  const classesBelow = (owner: string, side: Side) => {
    const key = `${side} ${owner}`;
    const known =
      below.get(key) ??
      [...classes.keys()]
        .filter((name) => !isModule(name))
        .flatMap((name) =>
          (['instance', 'singleton'] as const).map((chainSide) => ({ name, side: chainSide })),
        )
        .filter(({ name, side: chainSide }) =>
          chainFor(name, chainSide).some(
            (ancestor) =>
              ancestor !== 'library' && ancestor.owner.name === owner && ancestor.side === side,
          ),
        );
    below.set(key, known);
    return known;
  };

  const findIn = (chain: readonly Ancestor[], name: string): Found => {
    for (const ancestor of chain) {
      if (ancestor === 'library') return 'library';
      const method = ancestor.owner[ancestor.side].get(name);
      if (method !== undefined) return method;
      if (ancestor.owner.made[ancestor.side].has(name)) return 'library';
    }
    return 'none';
  };

  const oneOfBelow = (owner: string, side: Side, name: string): OneOf => ({
    oneOf: classesBelow(owner, side).map((each) => findIn(chainFor(each.name, each.side), name)),
  });

  const overridesOf = (found: Found, owner: string, side: Side, name: string): Found | OneOf =>
    typeof found !== 'string' && found.abstract ? oneOfBelow(owner, side, name) : found;

  const isModel = (name: string, seen: Set<string>): boolean => {
    if (name === ACTIVE_RECORD) return true;
    const owner = classes.get(name);
    if (owner === undefined || seen.has(name)) return false;
    seen.add(name);
    const superclass = superclassOf(owner);
    if (superclass === null) return false;
    const parent = constantOf(superclass);
    return parent === undefined
      ? superclass.path.join('::') === ACTIVE_RECORD
      : isModel(parent, seen);
  };

  const classOfMade = (value: MadeValue): string | undefined => {
    if (value.by === null) return value.path.join('::');
    const made = constantOf(value);
    if (made === undefined) return undefined;
    const finder = typeFlow === 3 && FINDERS.has(value.by) && isModel(made, new Set());
    if (value.by !== 'new' && !finder) return undefined;
    return typeof findIn(chainFor(made, 'singleton'), value.by) === 'string' ? made : undefined;
  };

  const instanceWrites = new Map<string, { readonly writer: string; readonly value: Written }[]>();
  for (const method of unit.methods) {
    for (const { name, value } of method.writes) {
      if (!name.startsWith('@')) continue;
      const key = `${method.singleton ? 'singleton' : 'instance'} ${method.owner} ${name}`;
      instanceWrites.set(key, [...(instanceWrites.get(key) ?? []), { writer: method.id, value }]);
    }
  }

  /** An instance variable counts in variant 2 when one method of the class alone writes it. */
  const writesOf = (variable: string, caller: RubyMethod): readonly Written[] => {
    if (!variable.startsWith('@'))
      return caller.writes.flatMap(({ name, value }) => (name === variable ? [value] : []));
    const side: Side = caller.singleton ? 'singleton' : 'instance';
    const writer = classes.get(caller.owner)?.made[side].has(`${variable.slice(1)}=`) ?? false;
    if (typeFlow < 2 || writer) return [];
    const writes = instanceWrites.get(`${side} ${caller.owner} ${variable}`) ?? [];
    return new Set(writes.map(({ writer: method }) => method)).size === 1
      ? writes.map(({ value }) => value)
      : [];
  };

  /** The value that each write of the variable sets, when every one makes the same class. */
  const madeValueOf = (variable: string, caller: RubyMethod): MadeValue | undefined => {
    const [first, ...rest] = writesOf(variable, caller);
    if (first === undefined || first === null) return undefined;
    const made = classOfMade(first);
    return rest.every((value) => value !== null && classOfMade(value) === made) ? first : undefined;
  };

  const calleeOf = (site: CallSite, caller: RubyMethod): Found | Unproved | OneOf => {
    const { receiver, name } = site;
    const callerSide: Side = caller.singleton ? 'singleton' : 'instance';
    if (receiver.kind === 'self') {
      const found = findIn(chainFor(caller.owner, callerSide), name);
      if (found === 'none' && callerSide === 'instance' && isModule(caller.owner))
        return oneOfBelow(caller.owner, callerSide, name);
      return overridesOf(found, caller.owner, callerSide, name);
    }
    if (receiver.kind === 'super') {
      const chain = chainFor(caller.owner, callerSide);
      const own = chain.findIndex(
        (ancestor) => ancestor !== 'library' && ancestor.owner.name === caller.owner,
      );
      const found = findIn(chain.slice(own + 1), name);
      return found === 'none' ? 'library' : found;
    }
    if (receiver.kind === 'value') return 'untyped';
    if (receiver.kind === 'made' || receiver.kind === 'variable') {
      const made = receiver.kind === 'made' ? receiver : madeValueOf(receiver.name, caller);
      const madeClass = made === undefined ? undefined : classOfMade(made);
      if (made === undefined || madeClass === undefined) return 'untyped';
      const found = findIn(chainFor(madeClass, 'instance'), name);
      if (found === 'none' && made.by === null) return 'library';
      return overridesOf(found, madeClass, 'instance', name);
    }
    const constant = constantOf(receiver);
    if (constant === undefined) return 'missing-module';
    if (name !== 'new')
      return overridesOf(
        findIn(chainFor(constant, 'singleton'), name),
        constant,
        'singleton',
        name,
      );
    const made = findIn(chainFor(constant, 'singleton'), 'new');
    if (made !== 'none' && made !== 'library') return made;
    const initialize = findIn(chainFor(constant, 'instance'), 'initialize');
    return initialize === 'none' ? 'library' : initialize;
  };

  const oneOfAmong = (found: readonly Found[], name: string): Resolution => {
    const callees = new Set(
      found.flatMap((method) =>
        typeof method !== 'string' && !method.abstract && claimed.has(method.file)
          ? [method.id]
          : [],
      ),
    );
    if (callees.size > 0) return { kind: 'one-of', callees: [...callees] };
    if (found.includes('library') || !definedNames.has(name)) return LIBRARY;
    return { kind: 'open-end', reason: 'no-implementation' };
  };

  return (site: CallSite, caller: RubyMethod): Resolution => {
    if (site.open !== undefined) return { kind: 'open-end', reason: site.open };
    const callee = calleeOf(site, caller);
    if (callee === 'library') return LIBRARY;
    if (typeof callee !== 'string' && 'oneOf' in callee) return oneOfAmong(callee.oneOf, site.name);
    if (typeof callee !== 'string')
      return claimed.has(callee.file) ? { kind: 'call', callee: callee.id } : LIBRARY;
    if (site.name === 'new' && site.receiver.kind === 'constant') return LIBRARY;
    if (!definedNames.has(site.name)) return LIBRARY;
    return { kind: 'open-end', reason: callee === 'none' ? 'other' : callee };
  };
};

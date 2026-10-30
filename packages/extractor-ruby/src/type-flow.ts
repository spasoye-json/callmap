import { sideOf } from './ripper.ts';
import type { ConstantReference, MadeValue, Receiver, RubyMethod, Side } from './ripper.ts';
import type { Ancestor, Found, IndexedMethod, RubyClass } from './resolution.ts';

/** What the type flow reads of the classes of one load unit. */
export interface ClassIndex {
  readonly classes: ReadonlyMap<string, RubyClass>;
  readonly constantOf: (reference: ConstantReference) => string | undefined;
  readonly superclassOf: (owner: RubyClass) => ConstantReference | null;
  readonly chainFor: (name: string, side: Side) => readonly Ancestor[];
  readonly classesBelow: (
    owner: string,
    side: Side,
  ) => readonly { readonly name: string; readonly side: Side }[];
  readonly findIn: (chain: readonly Ancestor[], name: string) => Found;
}

/** A value with a proved class, and the code that made it. */
export interface KnownValue {
  readonly value: MadeValue;
  readonly className: string;
}

export type ValueReceiver = Extract<Receiver, { readonly kind: 'made' | 'variable' }>;

/** The class of a value receiver, when the rules prove it. */
export type TypeFlow = (receiver: ValueReceiver, caller: RubyMethod) => KnownValue | undefined;

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

type Written = MadeValue | null;

export const typeFlowOf = (index: ClassIndex, methods: readonly IndexedMethod[]): TypeFlow => {
  const { classes, constantOf, superclassOf, chainFor, classesBelow, findIn } = index;

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
    const maker = constantOf(value);
    if (maker === undefined) return undefined;
    const finder = FINDERS.has(value.by) && isModel(maker, new Set());
    if (value.by !== 'new' && !finder) return undefined;
    return typeof findIn(chainFor(maker, 'singleton'), value.by) === 'string' ? maker : undefined;
  };

  const instanceWrites = new Map<string, { readonly writer: string; readonly value: Written }[]>();
  for (const method of methods) {
    for (const { name, value } of method.writes) {
      if (!name.startsWith('@')) continue;
      const key = `${sideOf(method)} ${method.owner} ${name}`;
      instanceWrites.set(key, [...(instanceWrites.get(key) ?? []), { writer: method.id, value }]);
    }
  }

  /** Every step of every chain that holds this step, so every method that one object can run. */
  const sharers = new Map<string, readonly Ancestor[]>();
  const sharersOf = (owner: string, side: Side): readonly Ancestor[] => {
    const key = `${side} ${owner}`;
    const known = sharers.get(key) ?? [
      ...new Set([
        ...chainFor(owner, side),
        ...classesBelow(owner, side).flatMap((each) => chainFor(each.name, each.side)),
      ]),
    ];
    sharers.set(key, known);
    return known;
  };

  /**
   * An instance variable has a known class when one method alone writes it, among every method
   * that an object of the caller's class can run.
   */
  const writesOf = (variable: string, caller: RubyMethod): readonly Written[] => {
    if (!variable.startsWith('@'))
      return caller.writes.flatMap(({ name, value }) => (name === variable ? [value] : []));
    const steps = sharersOf(caller.owner, sideOf(caller)).filter((step) => step !== 'library');
    const setter = `${variable.slice(1)}=`;
    if (steps.some((step) => step.owner.macroNames[step.side].has(setter))) return [];
    const writes = steps.flatMap(
      (step) => instanceWrites.get(`${step.side} ${step.owner.name} ${variable}`) ?? [],
    );
    return new Set(writes.map(({ writer }) => writer)).size === 1
      ? writes.map(({ value }) => value)
      : [];
  };

  /** The value that each write of the variable sets, when every one makes the same class. */
  const writtenValueOf = (variable: string, caller: RubyMethod): MadeValue | undefined => {
    const [first, ...rest] = writesOf(variable, caller);
    if (first === undefined || first === null) return undefined;
    const firstClass = classOfMade(first);
    return rest.every((value) => value !== null && classOfMade(value) === firstClass)
      ? first
      : undefined;
  };

  return (receiver, caller) => {
    const value = receiver.kind === 'made' ? receiver : writtenValueOf(receiver.name, caller);
    const className = value === undefined ? undefined : classOfMade(value);
    return value === undefined || className === undefined ? undefined : { value, className };
  };
};

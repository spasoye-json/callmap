import type { FunctionId, OpenEndReason } from '@callmap/graph-document';
import type { CallSite, ConstantReference, RubyMethod } from './ripper.ts';

export interface IndexedMethod extends RubyMethod {
  readonly id: FunctionId;
  readonly file: string;
}

export type Resolution =
  | { readonly kind: 'call'; readonly callee: FunctionId }
  | { readonly kind: 'open-end'; readonly reason: OpenEndReason }
  | { readonly kind: 'library' };

interface RubyClass {
  readonly instance: Map<string, IndexedMethod>;
  readonly singleton: Map<string, IndexedMethod>;
}

const LIBRARY: Resolution = { kind: 'library' };

const namespacesOf = (name: string): readonly string[] => {
  const segments = name.split('::');
  return segments.map((_, index) => segments.slice(0, index + 1).join('::'));
};

export const resolverOf = (
  bodies: readonly string[],
  methods: readonly IndexedMethod[],
  claimed: ReadonlySet<string>,
) => {
  const classes = new Map<string, RubyClass>();
  const classOf = (name: string): RubyClass => {
    const known = classes.get(name) ?? { instance: new Map(), singleton: new Map() };
    classes.set(name, known);
    return known;
  };
  for (const method of methods) {
    const { instance, singleton } = classOf(method.owner);
    (method.singleton ? singleton : instance).set(method.name, method);
  }
  const constants = new Set(bodies.flatMap(namespacesOf));
  const definedNames = new Set(methods.map(({ name }) => name));

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

  const calleeOf = (site: CallSite, caller: RubyMethod): IndexedMethod | undefined => {
    const { receiver, name } = site;
    if (receiver.kind === 'self') {
      const own = classes.get(caller.owner);
      return (caller.singleton ? own?.singleton : own?.instance)?.get(name);
    }
    if (receiver.kind === 'value') return undefined;
    const constant = constantOf(receiver);
    if (constant === undefined) return undefined;
    const owned = classes.get(constant);
    if (name === 'new') return owned?.singleton.get('new') ?? owned?.instance.get('initialize');
    return owned?.singleton.get(name);
  };

  return (site: CallSite, caller: RubyMethod): Resolution => {
    const callee = calleeOf(site, caller);
    if (callee !== undefined)
      return claimed.has(callee.file) ? { kind: 'call', callee: callee.id } : LIBRARY;
    if (site.name === 'new' && site.receiver.kind === 'constant') return LIBRARY;
    return definedNames.has(site.name) ? { kind: 'open-end', reason: 'untyped' } : LIBRARY;
  };
};

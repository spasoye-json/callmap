/**
 * The methods that a macro of Ruby or Rails makes in a class body. They are methods of the library,
 * so a call to one is a library call (ADR-0027), even when a `def` elsewhere has its name.
 */

import type { Macro, Side } from './ripper.ts';

export interface MadeNames {
  readonly side: Side;
  readonly names: readonly string[];
}

const singularOf = (name: string): string => {
  if (name.endsWith('ies')) return `${name.slice(0, -3)}y`;
  return name.endsWith('s') ? name.slice(0, -1) : name;
};

const prefixed = (macro: Macro, name: string): string => {
  const { prefix, to } = macro.options;
  if (prefix === true && typeof to === 'string') return `${to}_${name}`;
  return typeof prefix === 'string' ? `${prefix}_${name}` : name;
};

const namesOf = (macro: Macro, name: string): readonly string[] => {
  switch (macro.name) {
    case 'attr_writer':
      return [`${name}=`];
    case 'attr_accessor':
      return [name, `${name}=`];
    case 'delegate':
      return [prefixed(macro, name)];
    case 'has_many':
    case 'has_and_belongs_to_many':
      return [name, `${name}=`, `${singularOf(name)}_ids`, `${singularOf(name)}_ids=`];
    case 'has_one':
    case 'belongs_to':
      return [
        name,
        `${name}=`,
        `build_${name}`,
        `create_${name}`,
        `create_${name}!`,
        `reload_${name}`,
        `reset_${name}`,
        `${name}_changed?`,
        `${name}_previously_changed?`,
      ];
    default:
      return [name];
  }
};

export const madeNamesOf = (macro: Macro): MadeNames => ({
  side: macro.singleton || macro.name === 'scope' ? 'singleton' : 'instance',
  names: macro.symbols.flatMap((name) => namesOf(macro, name)),
});

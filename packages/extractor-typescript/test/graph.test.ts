import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readGraphDocument } from '@callmap/graph-document';
import type { GraphDocument } from '@callmap/graph-document';
import { extractGraphDocument } from '../src/index.ts';
import { tempDir } from '../../../test/temp-dir.ts';

const FIXTURE = fileURLToPath(new URL('../fixture-calls', import.meta.url));

const extract = (...scope: readonly string[]) =>
  readGraphDocument(extractGraphDocument({ repo: FIXTURE, scope }));

describe('extractGraphDocument', () => {
  it('emits a graph document the core accepts, with its language, scope and files', () => {
    const document = extract('src/**');
    expect(document.language).toBe('typescript');
    expect(document.scope).toEqual(['src/**']);
    expect(document.files).toEqual([
      'src/injectable.ts',
      'src/money.ts',
      'src/orders.controller.ts',
      'src/orders.service.ts',
    ]);
  });

  it('names its checker as TypeScript with the full version of the typescript module it loads', () => {
    const extractor = fileURLToPath(new URL('../src/graph.ts', import.meta.url));
    const manifest = createRequire(extractor).resolve('typescript/package.json');
    const { version } = JSON.parse(readFileSync(manifest, 'utf8')) as { version: string };
    expect(extract('src/**').checker).toEqual({ name: 'TypeScript', version });
  });
});

const placesOf = (document: GraphDocument, file: string) =>
  document.functions
    .filter((graphFunction) => graphFunction.file === file)
    .map(({ id, name, firstLine, lastLine }) => ({ id, name, firstLine, lastLine }));

describe('the functions of a graph document', () => {
  it('holds a function declaration, an arrow function and a function expression bound to a name', () => {
    expect(placesOf(extract('src/**'), 'src/money.ts')).toEqual([
      { id: 'src/money.ts#total', name: 'total', firstLine: 1, lastLine: 3 },
      { id: 'src/money.ts#round', name: 'round', firstLine: 5, lastLine: 5 },
      { id: 'src/money.ts#format', name: 'format', firstLine: 7, lastLine: 9 },
    ]);
  });

  it('holds a constructor, a method, a getter and a setter, named by their class', () => {
    expect(placesOf(extract('src/**'), 'src/orders.service.ts')).toEqual([
      {
        id: 'src/orders.service.ts#OrdersService.constructor',
        name: 'OrdersService.constructor',
        firstLine: 8,
        lastLine: 10,
      },
      {
        id: 'src/orders.service.ts#OrdersService.create',
        name: 'OrdersService.create',
        firstLine: 12,
        lastLine: 15,
      },
      {
        id: 'src/orders.service.ts#OrdersService.reset',
        name: 'OrdersService.reset',
        firstLine: 17,
        lastLine: 19,
      },
      {
        id: 'src/orders.service.ts#OrdersService.get count',
        name: 'OrdersService.get count',
        firstLine: 21,
        lastLine: 23,
      },
      {
        id: 'src/orders.service.ts#OrdersService.set count',
        name: 'OrdersService.set count',
        firstLine: 25,
        lastLine: 27,
      },
      { id: 'src/orders.service.ts#round', name: 'round', firstLine: 30, lastLine: 30 },
    ]);
  });

  it('holds an arrow function bound to a class property', () => {
    const names = placesOf(extract('src/**'), 'src/orders.controller.ts').map(({ name }) => name);
    expect(names).toEqual([
      'OrdersController.constructor',
      'OrdersController.place',
      'OrdersController.handle',
      'start',
    ]);
  });
});

const SERVICE = 'src/orders.service.ts';
const CONTROLLER = 'src/orders.controller.ts';

describe('the calls of a graph document', () => {
  it('holds each call between two functions in scope, with its caller, callee and line', () => {
    expect(extract('src/**').calls).toEqual([
      { caller: 'src/money.ts#total', callee: 'src/money.ts#round', line: 2 },
      { caller: 'src/money.ts#format', callee: 'src/money.ts#round', line: 8 },
      {
        caller: `${CONTROLLER}#OrdersController.place`,
        callee: `${SERVICE}#OrdersService.create`,
        line: 10,
      },
      {
        caller: `${CONTROLLER}#OrdersController.handle`,
        callee: `${CONTROLLER}#OrdersController.place`,
        line: 14,
      },
      {
        caller: `${CONTROLLER}#start`,
        callee: `${CONTROLLER}#OrdersController.constructor`,
        line: 17,
      },
      {
        caller: `${CONTROLLER}#start`,
        callee: `${SERVICE}#OrdersService.constructor`,
        line: 17,
      },
      {
        caller: `${SERVICE}#OrdersService.constructor`,
        callee: `${SERVICE}#OrdersService.reset`,
        line: 9,
      },
      { caller: `${SERVICE}#OrdersService.create`, callee: 'src/money.ts#total', line: 13 },
      { caller: `${SERVICE}#OrdersService.create`, callee: 'src/money.ts#format', line: 14 },
      { caller: `${SERVICE}#OrdersService.set count`, callee: `${SERVICE}#round`, line: 26 },
    ]);
  });

  it('ties a call on a service that a constructor injects to the service method', () => {
    expect(extract('src/**').calls).toContainEqual({
      caller: `${CONTROLLER}#OrdersController.place`,
      callee: `${SERVICE}#OrdersService.create`,
      line: 10,
    });
  });
});

const repoWith = (source: string): string => {
  const repo = tempDir('callmap-graph-');
  mkdirSync(join(repo, 'src'));
  writeFileSync(join(repo, 'src', 'a.ts'), source);
  return repo;
};

const functionsOf = (source: string) =>
  readGraphDocument(extractGraphDocument({ repo: repoWith(source) })).functions;

const PRICE = 'export const price = (cents: number) => cents * 2;\n';

describe('the identity of a function', () => {
  it('keeps its id and its source hash when it moves to another line', () => {
    const [before] = functionsOf(PRICE);
    const [after] = functionsOf(`\n\n\n${PRICE}`);
    expect(after?.id).toBe('src/a.ts#price');
    expect(after?.id).toBe(before?.id);
    expect(after?.sourceHash).toBe(before?.sourceHash);
    expect(after?.firstLine).toBe(4);
  });

  it('changes its source hash when its body changes', () => {
    const [before] = functionsOf(PRICE);
    const [after] = functionsOf(PRICE.replace('cents * 2', 'cents * 3'));
    expect(after?.id).toBe(before?.id);
    expect(after?.sourceHash).not.toBe(before?.sourceHash);
  });

  it('gives a second function with the same qualified name a suffix in source order', () => {
    const source = [
      'export const run = () => {',
      '  { const helper = () => 1; helper(); }',
      '  { const helper = () => 2; helper(); }',
      '};',
      '',
    ].join('\n');
    expect(functionsOf(source).map(({ id }) => id)).toEqual([
      'src/a.ts#run',
      'src/a.ts#run.helper',
      'src/a.ts#run.helper~2',
    ]);
  });
});

describe('the scope of a graph document', () => {
  const describeBuild = {
    caller: `${CONTROLLER}#OrdersController.place`,
    callee: 'tools/build.ts#describeBuild',
    line: 11,
  };

  it('holds a call into a file that only a wider scope takes in', () => {
    expect(extract().calls).toContainEqual(describeBuild);
  });

  it('leaves out a call into a file the scope leaves out', () => {
    expect(extract('src/**').calls).not.toContainEqual(describeBuild);
  });

  it('holds only the functions of the files the scope takes in', () => {
    const files = new Set(extract('src/money.ts').functions.map(({ file }) => file));
    expect([...files]).toEqual(['src/money.ts']);
  });
});

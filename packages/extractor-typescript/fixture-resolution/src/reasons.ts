import { missing } from './nowhere';

interface Order {
  readonly id: string;
}

interface Thing {
  readonly name: string;
}

interface Ledger {
  record(order: Order): void;
}

type Hook = (order: Order) => void;

export const callMissing = (): void => {
  missing();
};

export class Checkout {
  private readonly hooks: Record<string, Hook> = {};
  private readonly gateway: any;
  private readonly onPaid: Hook;
  private readonly opt: { readonly fn?: () => void } | undefined;

  constructor(onPaid: Hook, opt?: { readonly fn?: () => void }) {
    this.onPaid = onPaid;
    this.opt = opt;
  }

  emit(event: string, order: Order): void {
    this.hooks[event](order);
  }

  charge(): void {
    this.gateway.charge();
  }

  paid(order: Order): void {
    this.onPaid(order);
  }

  done(): void {
    this.opt?.fn?.();
  }
}

export const callAny = (x: any): void => {
  x();
};

export const callParsed = (s: string): void => {
  JSON.parse(s).go();
};

export const callAnyKey = (o: any, k: string): void => {
  o[k]();
};

export const callAnySymbolKey = (o: any): void => {
  o[Symbol.iterator]();
};

export const callCallback = (done: Hook, order: Order): void => {
  done(order);
};

export const callLocal = (order: Order, make: () => Hook): void => {
  const hook = make();
  hook(order);
};

export const callLiteralKey = (hooks: Record<string, Hook>, order: Order): void => {
  hooks['paid'](order);
};

export const callResult = (make: () => () => void): void => {
  make()();
};

export const construct = (C: new () => Thing): Thing => new C();

export const callUnion = (fn: ((a: string) => void) | ((a: string, b?: number) => void)): void => {
  fn('a');
};

export const callInterface = (ledger: Ledger, order: Order): void => {
  ledger.record(order);
};

export abstract class Job {
  abstract run(): void;
  abstract readonly onDone: () => void;

  start(): void {
    this.run();
  }

  finish(): void {
    this.onDone();
  }
}

declare function declared(): void;

declare const api: { go(): void };

declare const declaredHook: Hook;

export const callDeclared = (): void => {
  declared();
};

export const callDeclaredObject = (): void => {
  api.go();
};

export const callDeclaredHook = (order: Order): void => {
  declaredHook(order);
};

export const callUnknown = (v: unknown): void => {
  if (typeof v === 'function') v();
};

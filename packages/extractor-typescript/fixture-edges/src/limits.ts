interface Rule {
  allows(amount: number): boolean;
}

type Kind = 'small' | 'large';

export class Limits {
  private readonly rules: Record<Kind, Rule>;

  constructor() {
    this.rules = { small: this.smallRule(), large: this.largeRule() };
  }

  allows(kind: Kind, amount: number): boolean {
    return this.rules[kind].allows(amount);
  }

  private smallRule(): Rule {
    return { allows: (amount) => amount < 10 };
  }

  private largeRule(): Rule {
    return { allows: (amount) => amount < 1000 };
  }
}

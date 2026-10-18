import { Injectable } from './injectable';
import { format, total } from './money';

@Injectable()
export class OrdersService {
  private readonly placed: number[] = [];

  constructor() {
    this.reset();
  }

  create(cents: readonly number[]): string {
    this.placed.push(total(cents));
    return format(this.count);
  }

  reset(): void {
    this.placed.length = 0;
  }

  get count(): number {
    return this.placed.length;
  }

  set count(value: number) {
    this.placed.length = round(value);
  }
}

const round = (value: number): number => Math.max(0, value);

import { describeBuild } from '../tools/build';
import { Injectable } from './injectable';
import { OrdersService } from './orders.service';

@Injectable()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  place(cents: readonly number[]): string {
    const receipt = this.orders.create(cents);
    return `${receipt} ${describeBuild()}`;
  }

  handle = (cents: readonly number[]): string => this.place(cents);
}

export const start = (): OrdersController => new OrdersController(new OrdersService());

export const ship = (parcels: number): number => parcels;

export const weigh = (parcels: number): number => parcels * 3;

export const measure = (parcels: number): number => parcels * 4;

export interface Carrier {
  send(parcels: number): number;
}

export class Van implements Carrier {
  send(parcels: number): number {
    return parcels * 5;
  }
}

export class Bike implements Carrier {
  send(parcels: number): number {
    return parcels;
  }
}

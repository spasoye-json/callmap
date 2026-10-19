import { ship, weigh } from './post';
import type { Carrier } from './post';

export const express = (parcels: number): number => ship(parcels) * 2 + weigh(parcels);

export const dispatch = (carrier: Carrier, parcels: number): number => carrier.send(parcels);

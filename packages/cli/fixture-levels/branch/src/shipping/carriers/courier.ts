import { measure, ship } from './post';
import type { Carrier } from './post';

export const express = (parcels: number): number => ship(parcels) * 2 + measure(parcels);

export const dispatch = (carrier: Carrier, parcels: number): number => carrier.send(parcels);

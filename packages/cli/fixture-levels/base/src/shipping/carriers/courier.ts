import { ship } from './post';

export const express = (parcels: number): number => ship(parcels) * 2;

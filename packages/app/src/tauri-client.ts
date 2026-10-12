/**
 * The sidecar client inside the desktop shell. The Rust layer exposes one command, `sidecar`, that
 * writes the request as one line to the Node sidecar and returns the line it answers with, so the
 * Rust side never reads a request (ADR-0006).
 */

import { invoke } from '@tauri-apps/api/core';
import type { SidecarClient } from './sidecar-client.ts';

export const tauriSidecarClient: SidecarClient = {
  send: async (request) => {
    const line = await invoke<string>('sidecar', { request: JSON.stringify(request) });
    return JSON.parse(line) as never;
  },
};

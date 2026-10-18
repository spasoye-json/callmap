/**
 * The only door the UI has to a repo: the sidecar command surface (ADR-0006). In the shell it is a
 * Tauri command that carries one JSON line to the Node sidecar. In a test it is the sidecar itself,
 * called in the same process.
 */

import type { SidecarRequest, SidecarResponse, SidecarResults } from '@archmap/sidecar';

export interface SidecarClient {
  send<Command extends SidecarRequest['command']>(
    request: Extract<SidecarRequest, { readonly command: Command }>,
  ): Promise<SidecarResponse<SidecarResults[Command]>>;
}

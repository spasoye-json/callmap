/**
 * The command of the editor door (ADR-0006: editor integration is one URL scheme). Types only, so
 * the UI imports them by type.
 */

/**
 * Hand an editor deep link to the system, which opens the editor at the file and line. The link
 * must name a file inside the repo the request names.
 */
export interface OpenInEditorRequest {
  readonly command: 'open-in-editor';
  readonly repo: string;
  readonly url: string;
}

export interface OpenInEditorResult {
  readonly opened: string;
}

export interface EditorResults {
  readonly 'open-in-editor': OpenInEditorResult;
}

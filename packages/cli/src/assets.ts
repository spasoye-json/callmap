export interface Assets {
  readonly TYPESCRIPT_EXTRACTOR: string;
  readonly LAYOUT_WORKER: URL;
  readonly pageScript: () => Promise<string>;
  readonly pageStyle: () => string;
  readonly extractorVersion: (typescript: string) => string;
}

export { assets } from './clone-assets.ts';

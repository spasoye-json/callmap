export interface Assets {
  readonly typescriptExtractor: string;
  readonly layoutWorker: URL;
  readonly pageScript: () => Promise<string>;
  readonly pageStyle: () => string;
  readonly extractorVersion: () => string;
}

export { assets } from './clone-assets.ts';

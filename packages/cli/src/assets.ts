export interface Assets {
  readonly typescriptExtractor: string;
  readonly layoutWorker: URL;
  readonly pageScript: () => Promise<string>;
  readonly pageStyle: () => string;
  readonly typescriptExtractorVersion: () => string;
  readonly goExtractor: string;
  readonly goExtractorVersion: () => string;
}

export { assets } from './clone-assets.ts';

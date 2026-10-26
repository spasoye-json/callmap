export interface Assets {
  readonly typescriptExtractor: string;
  readonly layoutWorker: URL;
  readonly pageScript: () => Promise<string>;
  readonly pageStyle: () => string;
  readonly typescriptExtractorVersion: () => string;
  readonly goExtractor: string;
  readonly goExtractorVersion: () => string;
  readonly goExtractorEnv: () => Readonly<Record<string, string>>;
}

export { assets } from './clone-assets.ts';

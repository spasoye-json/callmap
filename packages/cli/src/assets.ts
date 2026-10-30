export interface Assets {
  readonly typescriptExtractor: string;
  readonly layoutWorker: URL;
  readonly pageScript: () => Promise<string>;
  readonly pageStyle: () => string;
  readonly typescriptExtractorVersion: () => string;
  readonly goExtractor: string;
  readonly goExtractorVersion: (goVersion: string) => string;
  readonly goExtractorEnv: (goVersion: string) => Readonly<Record<string, string>>;
  readonly rubyExtractor: string;
  readonly rubyExtractorVersion: (rubyVersion: string) => string;
}

export { assets } from './clone-assets.ts';

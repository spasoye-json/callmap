/**
 * The one AI provider interface. Every AI pass goes through it, so a provider is swapped without
 * touching a command: Anthropic with the reader's own key in the app, a fake with canned answers in
 * every test, so no test reaches the network or spends a token.
 */

import type { TokenPrice, TokenUsage } from '@archmap/discovery';

/** One request to a model: instructions, the material, and the answer shape asked for. */
export interface AiRequest {
  readonly system: string;
  readonly prompt: string;
  readonly outputSchema: Readonly<Record<string, unknown>>;
  readonly maxOutputTokens: number;
}

export interface AiAnswer {
  readonly text: string;
  readonly usage: TokenUsage;
}

export interface AiProvider {
  /** The model every request goes to, named in every estimate. */
  readonly model: string;
  readonly price: TokenPrice;
  /** The input tokens a request would use, counted without running it. */
  countInputTokens(request: AiRequest): Promise<number>;
  complete(request: AiRequest): Promise<AiAnswer>;
}

/** Thrown by a provider that could not answer: a refused key, a refused request, a cut-off answer. */
export class ProviderFailure extends Error {
  override readonly name = 'ProviderFailure';
}

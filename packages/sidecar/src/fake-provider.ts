/**
 * A provider that answers from a list of canned texts, for tests. It counts four characters as one
 * token, which is enough for a cost to be non-zero and to grow with the request.
 */

import type { TokenPrice } from '@archmap/discovery';
import type { AiAnswer, AiProvider, AiRequest } from './provider.ts';

export interface FakeProviderOptions {
  /** The answers, in order. The last one repeats once the list runs out. */
  readonly answers: readonly string[];
  readonly model?: string;
  readonly price?: TokenPrice;
}

export interface FakeProvider extends AiProvider {
  /** Every request the provider counted, in order. */
  readonly counted: readonly AiRequest[];
  /** Every request the provider answered, in order. */
  readonly completed: readonly AiRequest[];
}

const tokensIn = (text: string): number => Math.ceil(text.length / 4);

export const createFakeProvider = (options: FakeProviderOptions): FakeProvider => {
  const counted: AiRequest[] = [];
  const completed: AiRequest[] = [];
  const inputTokensOf = (request: AiRequest): number =>
    tokensIn(request.system) + tokensIn(request.prompt);
  return {
    model: options.model ?? 'fake-model',
    price: options.price ?? { inputPerMillionTokens: 4, outputPerMillionTokens: 20 },
    counted,
    completed,
    countInputTokens: (request) => {
      counted.push(request);
      return Promise.resolve(inputTokensOf(request));
    },
    complete: (request): Promise<AiAnswer> => {
      const text = options.answers[Math.min(completed.length, options.answers.length - 1)] ?? '';
      completed.push(request);
      return Promise.resolve({
        text,
        usage: { inputTokens: inputTokensOf(request), outputTokens: tokensIn(text) },
      });
    },
  };
};

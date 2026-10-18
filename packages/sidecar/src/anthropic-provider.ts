/**
 * Anthropic behind the provider interface, through the official SDK, with the reader's own key
 * (spec user story 12). The answer is held to the request's JSON schema by structured outputs, so
 * a well-formed answer is the provider's job and the validator only judges the anchors.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { TokenPrice } from '@archmap/cost';
import { ProviderFailure } from './provider.ts';
import type { AiAnswer, AiProvider, AiRequest } from './provider.ts';

export const DEFAULT_MODEL = 'claude-opus-5-5';

/** US dollars per million tokens, from Anthropic's price list for the first-party API. */
const PRICES: Readonly<Record<string, TokenPrice>> = {
  'claude-opus-5-5': { inputPerMillionTokens: 4, outputPerMillionTokens: 20 },
  'claude-opus-5': { inputPerMillionTokens: 5, outputPerMillionTokens: 25 },
  'claude-opus-4-8': { inputPerMillionTokens: 5, outputPerMillionTokens: 25 },
};

const costPerToken = (price: TokenPrice): number =>
  price.inputPerMillionTokens + price.outputPerMillionTokens;

/**
 * A fallback can land on a model this list does not price yet. The dearest known price stands in,
 * so the monthly total can read high but never hides spend.
 */
const DEAREST_PRICE = Object.values(PRICES).reduce((dearest, price) =>
  costPerToken(price) > costPerToken(dearest) ? price : dearest,
);

const priceOf = (model: string): TokenPrice => PRICES[model] ?? DEAREST_PRICE;

/**
 * A model declining a request ends the pass with no answer. The server-side fallback re-runs it on
 * a model Anthropic picks by the refusal's category, inside the same call.
 */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export interface AnthropicProviderOptions {
  readonly apiKey: string;
  readonly model?: string;
  /** The fetch the SDK sends through. A test hands in one that never leaves the process. */
  readonly fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}

const failureOf = (error: unknown): unknown => {
  if (error instanceof Anthropic.AuthenticationError) {
    return new ProviderFailure('the Anthropic key was refused, so store a valid one');
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ProviderFailure('Anthropic is rate limiting this key, so try the pass again later');
  }
  if (error instanceof Anthropic.APIError) {
    return new ProviderFailure(`Anthropic refused the request: ${error.message}`);
  }
  return error;
};

export const createAnthropicProvider = (options: AnthropicProviderOptions): AiProvider => {
  const model = options.model ?? DEFAULT_MODEL;
  const price = PRICES[model];
  if (price === undefined) throw new Error(`no price is known for ${model}`);
  const client = new Anthropic({
    apiKey: options.apiKey,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });

  const countInputTokens = async (request: AiRequest): Promise<number> => {
    try {
      const counted = await client.messages.countTokens({
        model,
        system: request.system,
        messages: [{ role: 'user', content: request.prompt }],
      });
      return counted.input_tokens;
    } catch (error) {
      throw failureOf(error);
    }
  };

  const complete = async (request: AiRequest): Promise<AiAnswer> => {
    let message;
    try {
      message = await client.beta.messages
        .stream({
          model,
          max_tokens: request.maxOutputTokens,
          system: request.system,
          messages: [{ role: 'user', content: request.prompt }],
          output_config: {
            effort: 'medium',
            format: { type: 'json_schema', schema: { ...request.outputSchema } },
          },
          betas: [FALLBACK_BETA],
          fallbacks: 'default',
        })
        .finalMessage();
    } catch (error) {
      throw failureOf(error);
    }
    if (message.stop_reason === 'refusal') {
      throw new ProviderFailure('the model declined the request, and so did its fallback');
    }
    if (message.stop_reason === 'max_tokens') {
      throw new ProviderFailure('the answer reached the output limit before it was complete');
    }
    const text = message.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('');
    const usage = message.usage;
    return {
      text,
      usage: {
        inputTokens:
          usage.input_tokens +
          (usage.cache_creation_input_tokens ?? 0) +
          (usage.cache_read_input_tokens ?? 0),
        outputTokens: usage.output_tokens,
      },
      model: message.model,
      price: priceOf(message.model),
    };
  };

  return { model, price, countInputTokens, complete };
};

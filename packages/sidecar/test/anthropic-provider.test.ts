import { describe, expect, it } from 'vitest';
import { createAnthropicProvider, DEFAULT_MODEL, ProviderFailure } from '@archmap/sidecar';
import type { AiRequest } from '@archmap/sidecar';

const request: AiRequest = {
  system: 'You are the discovery pass.',
  prompt: '## Files in scope\n\nsrc/a.ts (typescript)',
  outputSchema: { type: 'object', properties: {}, additionalProperties: false },
  maxOutputTokens: 32_000,
};

interface Sent {
  readonly url: string;
  readonly headers: Headers;
  readonly body: Record<string, unknown>;
}

const sse = (events: readonly Record<string, unknown>[]): string =>
  events
    .map((event) => `event: ${String(event['type'])}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');

const streamedMessage = (text: string, stopReason: string): string =>
  sse([
    {
      type: 'message_start',
      message: {
        id: 'msg_fake',
        type: 'message',
        role: 'assistant',
        model: DEFAULT_MODEL,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 1200, output_tokens: 1 },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { output_tokens: 340 },
    },
    { type: 'message_stop' },
  ]);

/** A fetch that answers like the Messages API and never leaves the process. */
const fakeFetch = (answer: (url: string) => Response) => {
  const sent: Sent[] = [];
  const fetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    sent.push({
      url,
      headers: new Headers(init?.headers),
      body: JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<
        string,
        unknown
      >,
    });
    return Promise.resolve(answer(url));
  };
  return { fetch, sent };
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const streamed = (body: string): Response =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });

describe('the Anthropic provider', () => {
  it('runs on the default model at its price', () => {
    const provider = createAnthropicProvider({ apiKey: 'sk-ant-test' });
    expect(provider.model).toBe('claude-opus-5-5');
    expect(provider.price).toEqual({ inputPerMillionTokens: 4, outputPerMillionTokens: 20 });
  });

  it('counts the input tokens of a request with the reader key', async () => {
    const { fetch, sent } = fakeFetch(() => json({ input_tokens: 1234 }));
    const provider = createAnthropicProvider({ apiKey: 'sk-ant-test', fetch });
    expect(await provider.countInputTokens(request)).toBe(1234);
    expect(sent[0]?.url).toContain('/v1/messages/count_tokens');
    expect(sent[0]?.headers.get('x-api-key')).toBe('sk-ant-test');
    expect(sent[0]?.body).toMatchObject({
      model: 'claude-opus-5-5',
      system: request.system,
      messages: [{ role: 'user', content: request.prompt }],
    });
  });

  it('asks for an answer held to the schema and reads its text and usage', async () => {
    const { fetch, sent } = fakeFetch(() =>
      streamed(streamedMessage('{"proposedEntryPoints": []}', 'end_turn')),
    );
    const provider = createAnthropicProvider({ apiKey: 'sk-ant-test', fetch });
    expect(await provider.complete(request)).toEqual({
      text: '{"proposedEntryPoints": []}',
      usage: { inputTokens: 1200, outputTokens: 340 },
    });
    expect(sent[0]?.body).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 32_000,
      stream: true,
      system: request.system,
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: request.outputSchema },
      },
      fallbacks: 'default',
    });
    expect(sent[0]?.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
  });

  it('fails on an answer the token limit cut off, because half an answer cannot be read', async () => {
    const { fetch } = fakeFetch(() => streamed(streamedMessage('{"proposedEn', 'max_tokens')));
    const provider = createAnthropicProvider({ apiKey: 'sk-ant-test', fetch });
    await expect(provider.complete(request)).rejects.toThrow(ProviderFailure);
  });

  it('fails with a plain reason when the key is refused', async () => {
    const { fetch } = fakeFetch(() =>
      json(
        { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } },
        401,
      ),
    );
    const provider = createAnthropicProvider({ apiKey: 'sk-ant-wrong', fetch });
    await expect(provider.countInputTokens(request)).rejects.toThrow(
      /the Anthropic key was refused/,
    );
  });
});

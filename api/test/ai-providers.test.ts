import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeMlxProvider } from '../src/ai/providers/mlx.ts';
import { makeOllamaProvider } from '../src/ai/providers/ollama.ts';

type JsonBody = Record<string, unknown>;

function requestBody(init?: RequestInit): JsonBody {
  assert.equal(typeof init?.body, 'string');
  return JSON.parse(init.body as string) as JsonBody;
}

test('Ollama disabilita il thinking per chat, stream e warmup', async () => {
  const originalFetch = globalThis.fetch;
  const bodies: JsonBody[] = [];
  globalThis.fetch = async (_input, init) => {
    bodies.push(requestBody(init));
    const stream = bodies.length === 2;
    return new Response(
      stream
        ? '{"message":{"content":"ok"},"done":true}\n'
        : '{"message":{"role":"assistant","content":"ok"},"done":true}',
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  try {
    const provider = makeOllamaProvider({
      url: 'http://localhost:11434',
      model: 'qwen3.5:9b-q4_K_M',
    });
    assert.equal(await provider.chat([{ role: 'user', content: 'test' }]), 'ok');
    let streamed = '';
    for await (const chunk of provider.chatStream([{ role: 'user', content: 'test' }])) {
      streamed += chunk;
    }
    assert.equal(streamed, 'ok');
    await provider.warmup();
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(bodies.length, 3);
  for (const body of bodies) {
    assert.equal(body.model, 'qwen3.5:9b-q4_K_M');
    assert.equal(body.think, false);
  }
});

test('MLX disabilita il thinking per Qwen 3.5', async () => {
  const originalFetch = globalThis.fetch;
  let body: JsonBody | undefined;
  globalThis.fetch = async (_input, init) => {
    body = requestBody(init);
    return new Response(
      '{"choices":[{"message":{"role":"assistant","content":"ok"}}]}',
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  try {
    const provider = makeMlxProvider({
      url: 'http://127.0.0.1:8080',
      model: 'mlx-community/Qwen3.5-9B-MLX-4bit',
    });
    assert.equal(await provider.chat([{ role: 'user', content: 'test' }]), 'ok');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(body?.model, 'mlx-community/Qwen3.5-9B-MLX-4bit');
  assert.equal(body?.enable_thinking, false);
});

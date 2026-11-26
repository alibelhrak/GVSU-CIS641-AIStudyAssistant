/**
 * Two safety nets for the AI service.
 *
 * fetchLLM: when the service says "too many requests" (HTTP 429, common on free plans), wait the time it
 * asks for (up to 20 seconds) and try again, twice at most, instead of failing straight away.
 *
 * isGarbled: some models sometimes get stuck and stream "... … ..." for hundreds of lines. This spots it
 * (almost no letters in the last part of the text) so the server can stop and clean up the answer.
 */
const sleep = (ms, signal) => new Promise((resolve) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
});

/** How long the service asks us to wait, in ms (Retry-After, or Groq's x-ratelimit-reset-* headers) */
function waitFor(res) {
  const after = Number(res.headers.get('retry-after'));
  if (Number.isFinite(after) && after > 0) return after * 1000;
  const reset = res.headers.get('x-ratelimit-reset-tokens') || res.headers.get('x-ratelimit-reset-requests') || '';
  const m = reset.match(/(?:(\d+)m)?([\d.]+)s/);
  if (m) return ((Number(m[1]) || 0) * 60 + Number(m[2])) * 1000;
  return 6000;
}

export async function fetchLLM(url, options, { retries = 2, maxWait = 20000 } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(url, options);
    if (res.status !== 429 || attempt >= retries) return res;
    const ms = waitFor(res);
    if (ms > maxWait) return res;
    console.warn(`AI service is busy (429). Trying again in ${Math.ceil(ms / 1000)} s`);
    await res.body?.cancel().catch(() => {});
    await sleep(ms + 400, options.signal);
    if (options.signal?.aborted) return res;
  }
}

export function isGarbled(text) {
  const tail = text.slice(-260);
  if (tail.length < 160) return false;
  const letters = (tail.match(/\p{L}|\p{N}/gu) || []).length;
  return letters / tail.length < 0.25;
}

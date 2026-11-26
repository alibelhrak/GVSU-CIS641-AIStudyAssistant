/**
 * LLM part of the study assistant.
 *
 * The LLM never decides the numbers. The rule engine computes the study gap and the
 * session plan; the LLM only turns those facts into a short, personal message and
 * reason. Its answer is checked, and anything missing or broken falls back to the
 * rule-based text, so the app works the same with no model set up.
 *
 * Works with any OpenAI-compatible /chat/completions API (Ollama, OpenAI, Groq, ...).
 * Only the course code, task title and hour counts are sent.
 */
import { fetchLLM } from './llmGuard.js';
import { config, llmEnabled } from '../config.js';
import { templateText } from './recommendationEngine.js';
import { LANG_NAMES } from '../i18n.js';

const SYSTEM = `You are a study coach inside a student planner app.
You receive a JSON list of study gaps that the app has already computed.
For each item write:
- "message": one sentence (max 25 words) telling the student what to focus on. Name the course and the task.
- "reason": one or two sentences (max 40 words) explaining why, using ONLY the numbers given.
Rules: do not invent numbers, dates or tasks. Do not change the hours. Be direct and encouraging, no emojis.
Answer with JSON only, in this shape:
{"items":[{"ref":"<same ref as input>","message":"...","reason":"..."}]}`;

const clean = (s, max) => (typeof s === 'string' && s.trim().length > 0 && s.length <= max ? s.trim() : null);

/** Pull the JSON out of a model reply (some models wrap it in extra text). */
export function parseReply(text) {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const items = JSON.parse(text.slice(start, end + 1)).items;
    return Array.isArray(items) ? items : null;
  } catch {
    return null;
  }
}

async function callLlm(facts, lang) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.llm.timeoutMs);
  try {
    const res = await fetchLLM(`${config.llm.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(config.llm.apiKey ? { Authorization: `Bearer ${config.llm.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.llm.model,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: lang && lang !== 'en' ? `${SYSTEM}\nWrite "message" and "reason" in ${LANG_NAMES[lang]}. Keep course codes and task titles as given.` : SYSTEM },
          { role: 'user', content: JSON.stringify({ items: facts }) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`LLM responded ${res.status}`);
    const data = await res.json();
    return parseReply(data?.choices?.[0]?.message?.content);
  } finally {
    clearTimeout(timer);
  }
}

/** Returns a Map: ref -> { message, reason, source } where source is 'llm' or 'rules'. */
export async function writeMessages(facts, lang = 'en') {
  const out = new Map(facts.map((f) => [f.ref, { ...templateText(f, lang), source: 'rules' }]));
  if (!facts.length || !llmEnabled()) return out;
  try {
    const items = (await callLlm(facts, lang)) || [];
    for (const item of items) {
      const message = clean(item?.message, 240);
      const reason = clean(item?.reason, 400);
      if (out.has(item?.ref) && message && reason) out.set(item.ref, { message, reason, source: 'llm' });
    }
  } catch (err) {
    console.warn('LLM unavailable, using rule-based text:', err.message);
  }
  return out;
}
import { useEffect, useRef, useState } from 'react';
import { getToken } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { todayIso } from '../lib/dates.js';
import { Icon } from '../icons.jsx';
import '../chat.css';

const SUGGESTIONS = [
  { title: 'What should I study tonight?', text: 'Look at my deadlines and tell me where to start.' },
  { title: 'Plan my week', text: 'Make a day-by-day study plan for my upcoming deadlines.' },
  { title: 'Explain a concept', text: 'Explain the difference between a sequence diagram and a state machine diagram, with an example.' },
  { title: 'Quiz me', text: 'Give me 5 quick questions to test what I know about my most urgent exam topic. Ask them one at a time.' },
];

// ---------- Tiny, safe Markdown → HTML (escape first, then format) ----------
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function inline(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_([^_]+)_(?=[\s.,!?)]|$)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])\*([^*]+)\*(?=[\s.,!?)]|$)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}
export function markdown(src) {
  const out = [];
  const parts = esc(src).split(/```/);                      // odd parts are code blocks
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      const code = part.replace(/^[\w+-]*\n/, '');          // drop the language name
      out.push(`<pre><code>${code.replace(/\n$/, '')}</code></pre>`);
      return;
    }
    let list = null;                                         // 'ul' | 'ol' | null
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    for (const raw of part.split('\n')) {
      const line = raw.trimEnd();
      const h = line.match(/^(#{1,4})\s+(.*)/);
      const ul = line.match(/^\s*[-*•]\s+(.*)/);
      const ol = line.match(/^\s*\d+[.)]\s+(.*)/);
      if (h) { close(); out.push(`<h4>${inline(h[2])}</h4>`); }
      else if (ul) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(ul[1])}</li>`); }
      else if (ol) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(ol[1])}</li>`); }
      else if (!line.trim()) { close(); }
      else { close(); out.push(`<p>${inline(line)}</p>`); }
    }
    close();
  });
  return out.join('');
}

// ---------- Conversation kept for this browser tab, per student ----------
const storeKey = (id) => `sa-chat-${id}`;
const loadChat = (id) => { try { return JSON.parse(sessionStorage.getItem(storeKey(id))) || []; } catch { return []; } };
const saveChat = (id, msgs) => { try { sessionStorage.setItem(storeKey(id), JSON.stringify(msgs)); } catch { /* ignore */ } };

export default function Chat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState(() => loadChat(user.id));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(-1);
  const abort = useRef(null);
  const endRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => { if (!busy) saveChat(user.id, messages); }, [messages, busy, user.id]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages]);
  useEffect(() => () => abort.current?.abort(), []);

  // Let the text box grow with what you type (up to a limit)
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    const history = [...messages, { role: 'user', content }];
    setMessages([...history, { role: 'assistant', content: '', pending: true }]);
    setInput('');
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    const update = (fn) => setMessages((m) => { const copy = [...m]; copy[copy.length - 1] = fn(copy[copy.length - 1]); return copy; });

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ today: todayIso(), messages: history.map(({ role, content: c }) => ({ role, content: c })) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      // Read the answer piece by piece as it arrives
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const piece = decoder.decode(value, { stream: true });
        update((last) => ({ ...last, content: last.content + piece }));
      }
      update((last) => ({ ...last, pending: false }));
    } catch (err) {
      if (err.name === 'AbortError') update((last) => ({ ...last, pending: false, content: last.content || '_Stopped._' }));
      else update((last) => ({ ...last, pending: false, error: true, content: err.message }));
    } finally {
      setBusy(false);
      abort.current = null;
      boxRef.current?.focus();
    }
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const copy = async (i) => {
    try { await navigator.clipboard.writeText(messages[i].content); setCopied(i); setTimeout(() => setCopied(-1), 1500); } catch { /* ignore */ }
  };

  const newChat = () => { abort.current?.abort(); setMessages([]); saveChat(user.id, []); boxRef.current?.focus(); };
  const first = user.name.split(' ')[0];

  return (
    <div className="chat">
      <div className="chat-scroll">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <span className="chat-orb"><Icon name="spark" size={26} /></span>
            <h2>How can I help, {first}?</h2>
            <p className="muted">I can see your courses, deadlines and study hours. Ask about your plan, or anything you are learning.</p>
            <div className="suggest">
              {SUGGESTIONS.map((s, k) => (
                <button key={s.title} type="button" className="suggest-card" style={{ animationDelay: `${0.1 + k * 0.07}s` }} onClick={() => send(s.text)}>
                  <b>{s.title}</b><span>{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="msgs">
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role === 'user' ? 'me' : 'bot'} ${m.error ? 'error-msg' : ''}`}>
                {m.role === 'assistant' && <span className="bot-avatar"><Icon name="spark" size={16} /></span>}
                <div className="bubble">
                  {m.role === 'user' ? <p>{m.content}</p> : m.pending && !m.content ? (
                    <span className="thinking"><i /><i /><i /></span>
                  ) : (
                    <div className="md" dangerouslySetInnerHTML={{ __html: markdown(m.content) + (m.pending ? '<span class="caret"></span>' : '') }} />
                  )}
                  {m.role === 'assistant' && !m.pending && !m.error && m.content && (
                    <button className="copy-btn" type="button" onClick={() => copy(i)}>
                      <Icon name={copied === i ? 'check' : 'copy'} size={14} /> {copied === i ? 'Copied' : 'Copy'}
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className="composer-wrap">
        <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
          {messages.length > 0 && (
            <button className="icon-btn" type="button" onClick={newChat} title="New chat" aria-label="New chat"><Icon name="plus" /></button>
          )}
          <textarea ref={boxRef} rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey}
            placeholder="Ask anything about your studies…" aria-label="Message" maxLength={4000} />
          {busy ? (
            <button className="send stop" type="button" onClick={() => abort.current?.abort()} aria-label="Stop"><Icon name="stop" size={16} /></button>
          ) : (
            <button className="send" type="submit" disabled={!input.trim()} aria-label="Send"><Icon name="send" size={18} /></button>
          )}
        </form>
        <p className="note composer-note">AI can make mistakes. Your deadlines and hours always come from your own data. Enter to send, Shift+Enter for a new line.</p>
      </div>
    </div>
  );
}
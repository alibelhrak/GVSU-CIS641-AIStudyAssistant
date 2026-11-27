/**
 * Link previews for "Web bookmark" blocks: the page's title, description, picture and site name.
 * The server fetches public web pages only: private, local and cloud-metadata addresses are refused
 * (checked again after each redirect), pages are read up to 600 KB, and it gives up after 6 seconds.
 */
import dns from 'node:dns/promises';
import net from 'node:net';
import { Router } from 'express';
import { h, HttpError } from '../middleware/error.js';

const r = Router();
const MAX_BYTES = 600_000;

function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return privateIp(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

async function safeUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { throw new HttpError(400, 'That is not a valid link'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new HttpError(400, 'Only web links (https://) can be previewed');
  if (u.username || u.password || (u.port && !['80', '443'].includes(u.port))) throw new HttpError(400, 'This link cannot be previewed');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map((x) => x.address);
  if (!ips.length) throw new HttpError(400, 'That website could not be found');
  if (ips.some(privateIp)) throw new HttpError(400, 'This link cannot be previewed');
  return u;
}

const decode = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/\s+/g, ' ').trim();
function meta(html, names) {
  for (const name of names) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, 'i');
    const tag = html.match(re)?.[0];
    const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
    if (content) return decode(content);
  }
  return '';
}

r.get('/preview', h(async (req, res) => {
  let url = await safeUrl(req.query.url);
  let resp;
  for (let hop = 0; hop < 4; hop += 1) {
    resp = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StudyPilotBot/1.0; link preview)', Accept: 'text/html,*/*;q=0.5' } })
      .catch(() => { throw new HttpError(502, 'That website did not answer'); });
    if (resp.status >= 300 && resp.status < 400 && resp.headers.get('location')) { url = await safeUrl(new URL(resp.headers.get('location'), url)); continue; }
    break;
  }
  if (!resp.ok) throw new HttpError(502, `That website answered ${resp.status}`);
  const type = resp.headers.get('content-type') || '';
  const site = url.hostname.replace(/^www\./, '');
  if (!type.includes('html')) { await resp.body?.cancel(); return res.json({ url: url.href, title: decodeURIComponent(url.pathname.split('/').pop() || site), description: '', image: '', site }); }
  // Read only the start of the page (the title and meta tags are in <head>)
  const reader = resp.body.getReader(); let size = 0; const parts = [];
  while (size < MAX_BYTES) { const { done, value } = await reader.read(); if (done) break; parts.push(value); size += value.length; }
  reader.cancel().catch(() => {});
  const html = Buffer.concat(parts).toString('utf8');
  const title = meta(html, ['og:title', 'twitter:title']) || decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]) || site;
  let image = meta(html, ['og:image', 'og:image:url', 'twitter:image']);
  try { image = image ? new URL(image, url).href : ''; if (image && !image.startsWith('https://')) image = ''; } catch { image = ''; }
  res.json({ url: url.href, title: title.slice(0, 200), description: meta(html, ['og:description', 'description', 'twitter:description']).slice(0, 300), image, site: meta(html, ['og:site_name']) || site });
}));

export default r;

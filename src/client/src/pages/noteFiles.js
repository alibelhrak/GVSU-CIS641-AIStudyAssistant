/**
 * Export a note page (Markdown, Word, PDF) and import files as new pages (Markdown, text, HTML, Word).
 * The Word libraries (docx, mammoth) load only when someone exports or imports a Word file.
 */
const safeName = (s) => (String(s || 'Untitled').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 80) || 'Untitled');

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---------- Markdown ----------
export function exportMarkdown(editor, note) {
  const md = `# ${note.icon ? `${note.icon} ` : ''}${note.title || 'Untitled'}\n\n${editor.blocksToMarkdownLossy(editor.document)}`;
  download(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${safeName(note.title)}.md`);
}

// ---------- PDF: the browser's own "Save as PDF", with a print layout that shows only the page ----------
export function exportPdf(note) {
  const page = document.querySelector('.notes-scroll .note-page');
  if (!page) return;
  // A clean copy of the page (no menus or cursors), printed on its own
  const root = document.createElement('div');
  root.id = 'print-root';
  const copy = page.cloneNode(true);
  copy.querySelectorAll('.bn-side-menu, .note-icon-row button, .add-sub, .add-icon, .backlinks, .nb-embed-bar button, [data-print="no"], .ProseMirror-gapcursor').forEach((x) => x.remove());
  copy.querySelectorAll('[contenteditable]').forEach((x) => x.removeAttribute('contenteditable'));
  copy.querySelectorAll('textarea').forEach((x) => { const d = document.createElement('div'); d.className = `${x.className} print-text`; d.textContent = x.value; x.replaceWith(d); });
  copy.querySelectorAll('iframe').forEach((x) => { const a = document.createElement('p'); a.textContent = `▶ ${x.title || 'Embed'}: ${x.src}`; x.closest('.nb-embed-frame')?.replaceWith(a); });
  root.appendChild(copy);
  document.body.appendChild(root);
  const before = document.title;
  document.title = safeName(note.title);           // the PDF's file name
  document.body.classList.add('printing-note');
  const done = () => { document.body.classList.remove('printing-note'); root.remove(); document.title = before; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { window.print(); setTimeout(done, 500); }, 80);
}

// ---------- Word (.docx) ----------
const COLORS = { gray: '787774', brown: '9F6B53', red: 'D44C47', orange: 'D9730D', yellow: 'CB912F', green: '448361', blue: '337EA9', purple: '9065B0', pink: 'C14C8A' };

async function imageData(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!/^image\/(png|jpe?g|gif|bmp)$/.test(blob.type)) return null;
    const bitmap = await createImageBitmap(blob).catch(() => null);
    const w = bitmap?.width || 600; const h = bitmap?.height || 400;
    const scale = Math.min(1, 600 / w);
    return { data: await blob.arrayBuffer(), type: blob.type.includes('png') ? 'png' : blob.type.includes('gif') ? 'gif' : blob.type.includes('bmp') ? 'bmp' : 'jpg', width: Math.round(w * scale), height: Math.round(h * scale) };
  } catch { return null; }
}

export async function exportWord(editor, note) {
  const d = await import('docx');
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, ExternalHyperlink, Table, TableRow, TableCell, WidthType, ImageRun, ShadingType, LevelFormat, AlignmentType, BorderStyle } = d;

  const runs = (content = [], extra = {}) => (Array.isArray(content) ? content : []).flatMap((c) => {
    if (c.type === 'text') {
      const s = c.styles || {};
      return [new TextRun({ text: c.text, bold: s.bold || extra.bold, italics: s.italic, underline: s.underline ? {} : undefined, strike: s.strike,
        font: s.code || extra.code ? 'Consolas' : undefined, color: COLORS[s.textColor] || extra.color, shading: s.code ? { type: ShadingType.CLEAR, fill: 'F2F1EE', color: 'auto' } : undefined })];
    }
    if (c.type === 'link') return [new ExternalHyperlink({ link: c.href, children: (c.content?.length ? c.content : [{ text: c.href }]).map((x) => new TextRun({ text: x.text || '', style: 'Hyperlink' })) })];
    if (c.type === 'mention') return [new TextRun({ text: c.props.kind === 'date' ? c.props.id : c.props.kind === 'user' ? `@${c.props.label}` : c.props.label, color: '337EA9' })];
    if (c.type === 'inlineMath') return [new TextRun({ text: c.props.latex, italics: true, color: '555555' })];
    return [];
  });
  const plain = (content) => (Array.isArray(content) ? content.map((c) => c.text || (c.content || []).map((x) => x.text || '').join('') || c.props?.label || c.props?.latex || '').join('') : '');

  const out = [];
  const walk = async (blocks, level = 0) => {
    for (const b of blocks) {
      const p = b.props || {};
      const indent = level ? { left: 360 * level } : undefined;
      switch (b.type) {
        case 'heading': out.push(new Paragraph({ heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4][Math.min(3, (p.level || 1) - 1)], children: runs(b.content), indent })); break;
        case 'bulletListItem': out.push(new Paragraph({ bullet: { level: Math.min(level, 8) }, children: runs(b.content) })); break;
        case 'numberedListItem': out.push(new Paragraph({ numbering: { reference: 'numbers', level: Math.min(level, 8) }, children: runs(b.content) })); break;
        case 'checkListItem': out.push(new Paragraph({ indent, children: [new TextRun({ text: p.checked ? '☑ ' : '☐ ' }), ...runs(b.content)] })); break;
        case 'toggleListItem': out.push(new Paragraph({ indent, children: [new TextRun({ text: '▸ ' }), ...runs(b.content)] })); break;
        case 'quote': out.push(new Paragraph({ indent: { left: 360 + 360 * level }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'D0D0D0', space: 8 } }, children: runs(b.content, { color: '555555' }) })); break;
        case 'callout': out.push(new Paragraph({ indent, shading: { type: ShadingType.CLEAR, fill: 'F1F1EF', color: 'auto' }, spacing: { before: 120, after: 120 }, children: [new TextRun({ text: `${p.emoji || '💡'}  ` }), ...runs(b.content)] })); break;
        case 'codeBlock':
          plain(b.content).split('\n').forEach((line) => out.push(new Paragraph({ indent, shading: { type: ShadingType.CLEAR, fill: 'F6F6F4', color: 'auto' }, spacing: { after: 0 }, children: [new TextRun({ text: line || ' ', font: 'Consolas', size: 19 })] })));
          out.push(new Paragraph({ children: [] }));
          break;
        case 'math': out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 120 }, children: [new TextRun({ text: p.latex || '', italics: true, color: '555555' })] })); break;
        case 'divider': out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'D0D0D0', space: 1 } }, children: [] })); break;
        case 'table': {
          const rows = (b.content?.rows || []).map((r, i) => new TableRow({ tableHeader: i === 0, children: r.cells.map((cell) => new TableCell({ children: [new Paragraph({ children: runs(cell?.content || cell, i === 0 ? { bold: true } : {}) })] })) }));
          if (rows.length) out.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }), new Paragraph({ children: [] }));
          break;
        }
        case 'image': {
          const img = p.url ? await imageData(p.url) : null;
          if (img) out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: img.type, data: img.data, transformation: { width: img.width, height: img.height } })] }));
          else if (p.url) out.push(new Paragraph({ children: [new ExternalHyperlink({ link: p.url, children: [new TextRun({ text: p.name || 'Image', style: 'Hyperlink' })] })] }));
          if (p.caption) out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: p.caption, italics: true, color: '787774' })] }));
          break;
        }
        case 'video': case 'audio': case 'file': case 'embed': case 'bookmark':
          if (p.url) out.push(new Paragraph({ indent, children: [new ExternalHyperlink({ link: p.url, children: [new TextRun({ text: p.title || p.name || p.url, style: 'Hyperlink' })] })] }));
          break;
        case 'columns': {
          let cols = []; try { cols = JSON.parse(p.cols || '[]'); } catch { /* empty */ }
          cols.filter(Boolean).forEach((c) => c.split('\n').forEach((line) => out.push(new Paragraph({ indent, children: [new TextRun({ text: line })] }))));
          break;
        }
        case 'toc': break;
        default: out.push(new Paragraph({ indent, children: runs(b.content) }));
      }
      if (b.children?.length) await walk(b.children, level + 1);
    }
  };
  await walk(editor.document);

  const doc = new Document({
    creator: 'StudyPilot', title: note.title || 'Untitled',
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    numbering: { config: [{ reference: 'numbers', levels: Array.from({ length: 9 }, (_, i) => ({ level: i, format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][i % 3], text: `%${i + 1}.`, alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720 + 360 * i, hanging: 360 } } } })) }] },
    sections: [{ children: [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: `${note.icon ? `${note.icon} ` : ''}${note.title || 'Untitled'}` })] }), ...out] }],
  });
  download(await Packer.toBlob(doc), `${safeName(note.title)}.docx`);
}

// ---------- Import ----------
export const IMPORT_TYPES = '.md,.markdown,.txt,.html,.htm,.docx';
const MAX = 15 * 1024 * 1024;

/** Reads a file and returns { title, blocks } for a new page. `parser` is any BlockNote editor (it only parses). */
export async function importFile(file, parser) {
  if (file.size > MAX) throw new Error('This file is larger than 15 MB.');
  const name = file.name.replace(/\.[^.]+$/, '');
  const ext = (file.name.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
  let blocks;
  if (ext === 'docx') {
    const mammoth = (await import('mammoth/mammoth.browser.min.js')).default;
    const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    blocks = await parser.tryParseHTMLToBlocks(value);
  } else if (ext === 'html' || ext === 'htm') {
    const html = await file.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,iframe,object,embed').forEach((x) => x.remove());
    blocks = await parser.tryParseHTMLToBlocks(doc.body.innerHTML);
  } else if (ext === 'md' || ext === 'markdown' || ext === 'txt') {
    const text = await file.text();
    blocks = ext === 'txt' ? text.split(/\r?\n/).map((line) => ({ type: 'paragraph', content: line })) : await parser.tryParseMarkdownToBlocks(text);
  } else {
    throw new Error('StudyPilot can import Word (.docx), Markdown (.md), text (.txt) and web pages (.html).');
  }
  // A first heading 1 becomes the page title
  let title = name;
  const first = blocks[0];
  if (first?.type === 'heading' && first.props?.level === 1) {
    const text = (first.content || []).map((c) => c.text || '').join('').trim();
    if (text) { title = text; blocks = blocks.slice(1); }
  }
  return { title: title.slice(0, 200), blocks };
}

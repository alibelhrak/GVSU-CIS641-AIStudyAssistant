/**
 * Ask AI chat history: list, open, save and delete the student's conversations.
 * Pictures are not stored (only their names); file text and the AI's action cards are.
 */
import { Router } from 'express';
import mongoose from 'mongoose';
import { Conversation } from '../models/index.js';
import { h, HttpError } from '../middleware/error.js';
import { moveToTrash } from '../services/trash.js';

const r = Router();
const text = (v, max) => String(v ?? '').slice(0, max);
const UNDO_PATH = /^\/(courses|tasks|sessions|logs|notes)\/[a-f0-9]{24}$/;

/** Keeps only the fields the chat page uses, with size limits */
function cleanMessages(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(-200).map((m) => {
    const out = { role: m?.role === 'user' ? 'user' : 'assistant', content: text(m?.content, 20000) };
    if (m?.error) out.error = true;
    if (Array.isArray(m?.attachments)) {
      out.attachments = m.attachments.slice(0, 8).map((a) => (a?.type === 'text'
        ? { type: 'text', name: text(a.name, 120), text: text(a.text, 16000), info: text(a.info, 60) }
        : { type: 'name', name: text(a?.name || 'file', 120), wasImage: a?.type === 'image' || Boolean(a?.wasImage) }));
    }
    if (Array.isArray(m?.parts)) {
      out.parts = m.parts.slice(0, 80).map((p) => {
        if (p?.type !== 'action') return { type: 'text', v: text(p?.v, 20000) };
        const undo = p.undo && ['DELETE', 'PATCH'].includes(p.undo.method) && UNDO_PATH.test(p.undo.path)
          ? { method: p.undo.method, path: p.undo.path, ...(p.undo.body && typeof p.undo.body === 'object' ? { body: p.undo.body } : {}) }
          : undefined;
        return { type: 'action', icon: text(p.icon, 20), title: text(p.title, 80), detail: text(p.detail, 300),
          page: text(p.page, 40), ...(undo ? { undo } : {}), ...(p.undone ? { undone: true } : {}) };
      });
    }
    return out;
  });
}

const mine = (req) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Conversation not found');
  return { _id: req.params.id, user: req.userId };
};

// The list, newest first (titles only)
r.get('/', h(async (req, res) => {
  res.json(await Conversation.find({ user: req.userId }).select('title updatedAt').sort({ updatedAt: -1 }).limit(200));
}));

// One conversation with all its messages
r.get('/:id', h(async (req, res) => {
  const doc = await Conversation.findOne(mine(req));
  if (!doc) throw new HttpError(404, 'Conversation not found');
  res.json(doc);
}));

r.post('/', h(async (req, res) => {
  const doc = await Conversation.create({
    user: req.userId,
    title: text(req.body?.title, 120).trim() || 'New chat',
    messages: cleanMessages(req.body?.messages),
  });
  res.status(201).json({ id: doc.id, title: doc.title, updatedAt: doc.updatedAt });
}));

r.patch('/:id', h(async (req, res) => {
  const change = {};
  if (req.body?.title !== undefined) change.title = text(req.body.title, 120).trim() || 'New chat';
  if (req.body?.messages !== undefined) change.messages = cleanMessages(req.body.messages);
  const doc = await Conversation.findOneAndUpdate(mine(req), change, { new: true, runValidators: true });
  if (!doc) throw new HttpError(404, 'Conversation not found');
  res.json({ id: doc.id, title: doc.title, updatedAt: doc.updatedAt });
}));

r.delete('/:id', h(async (req, res) => {
  const doc = await Conversation.findOne(mine(req)).lean();
  if (!doc) throw new HttpError(404, 'Conversation not found');
  res.json({ ok: true, trashId: await moveToTrash('chat', doc, req.userId) });
}));

export default r;

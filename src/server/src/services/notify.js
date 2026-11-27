/** Adds to someone's notifications inbox (🔔). Never fails the action that caused it. */
import { Notification } from '../models/index.js';

export async function inbox(userId, { actor = null, kind, title, body = '', url = '' }) {
  try {
    if (!userId || String(userId) === String(actor)) return;
    await Notification.create({ user: userId, actor, kind, title: String(title).slice(0, 300), body: String(body).slice(0, 500), url });
    // keep the 200 newest
    const old = await Notification.find({ user: userId }).sort({ createdAt: -1 }).skip(200).select('_id').lean();
    if (old.length) await Notification.deleteMany({ _id: { $in: old.map((n) => n._id) } });
  } catch (err) {
    console.warn('Inbox:', err.message);
  }
}

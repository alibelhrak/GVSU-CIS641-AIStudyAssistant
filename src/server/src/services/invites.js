/**
 * Tells a student by email (and push notification, if they turned it on) that a classmate
 * shared a note page with them or added them to a study group.
 * Written in the invited student's own language. Sending never blocks or breaks the invite:
 * errors are only logged.
 */
import { config } from '../config.js';
import { User } from '../models/index.js';
import { sendMail } from './mailer.js';
import { sendPush } from './reminders.js';
import { dirOf } from '../i18n.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fill = (s, v) => Object.entries(v).reduce((out, [k, x]) => out.replaceAll(`{${k}}`, String(x)), s);

const T = {
  hi: { en: 'Hi {name},', fr: 'Bonjour {name},', es: 'Hola, {name}:', ar: 'مرحبًا {name}،', zh: '{name}，你好：', hi: 'नमस्ते {name},' },
  pageSubject: {
    en: '{from} shared "{title}" with you',
    fr: '{from} a partagé « {title} » avec vous',
    es: '{from} compartió «{title}» contigo',
    ar: 'شارك {from} «{title}» معك',
    zh: '{from} 与你共享了“{title}”',
    hi: '{from} ने "{title}" आपके साथ साझा किया',
  },
  pageEdit: {
    en: '{from} shared a note page with you on StudyPilot. You can edit it, and everyone on the page sees changes as they are typed.',
    fr: '{from} a partagé une page de notes avec vous sur StudyPilot. Vous pouvez la modifier, et chacun voit les changements pendant la saisie.',
    es: '{from} compartió una página de notas contigo en StudyPilot. Puedes editarla y todos ven los cambios mientras se escriben.',
    ar: 'شارك {from} صفحة ملاحظات معك على StudyPilot. يمكنك تعديلها، ويرى الجميع التغييرات أثناء كتابتها.',
    zh: '{from} 在 StudyPilot 上与你共享了一个笔记页面。你可以编辑，所有人都能实时看到更改。',
    hi: '{from} ने StudyPilot पर आपके साथ एक नोट पेज साझा किया है। आप इसे संपादित कर सकते हैं, और सभी बदलाव टाइप होते ही देखते हैं।',
  },
  pageView: {
    en: '{from} shared a note page with you on StudyPilot. You can read it.',
    fr: '{from} a partagé une page de notes avec vous sur StudyPilot. Vous pouvez la consulter.',
    es: '{from} compartió una página de notas contigo en StudyPilot. Puedes leerla.',
    ar: 'شارك {from} صفحة ملاحظات معك على StudyPilot. يمكنك قراءتها.',
    zh: '{from} 在 StudyPilot 上与你共享了一个笔记页面。你可以查看。',
    hi: '{from} ने StudyPilot पर आपके साथ एक नोट पेज साझा किया है। आप इसे पढ़ सकते हैं।',
  },
  pageWhere: {
    en: 'You will also find it in Notes, under "Shared with me".',
    fr: 'Vous la trouverez aussi dans Notes, sous « Partagé avec moi ».',
    es: 'También la encontrarás en Notas, en «Compartido conmigo».',
    ar: 'ستجدها أيضًا في الملاحظات، تحت «تمت مشاركتها معي».',
    zh: '你也可以在“笔记”的“与我共享”中找到它。',
    hi: 'यह आपको नोट्स में "मेरे साथ साझा" में भी मिलेगा।',
  },
  pageButton: { en: 'Open the page', fr: 'Ouvrir la page', es: 'Abrir la página', ar: 'فتح الصفحة', zh: '打开页面', hi: 'पेज खोलें' },
  groupSubject: {
    en: '{from} added you to the study group "{title}"',
    fr: '{from} vous a ajouté au groupe d’étude « {title} »',
    es: '{from} te añadió al grupo de estudio «{title}»',
    ar: 'أضافك {from} إلى مجموعة الدراسة «{title}»',
    zh: '{from} 把你加入了学习小组“{title}”',
    hi: '{from} ने आपको स्टडी ग्रुप "{title}" में जोड़ा',
  },
  groupBody: {
    en: '{from} added you to a study group on StudyPilot. The group shares deadlines, note pages you edit together, and a group chat.',
    fr: '{from} vous a ajouté à un groupe d’étude sur StudyPilot. Le groupe partage des échéances, des pages de notes modifiées ensemble et une discussion.',
    es: '{from} te añadió a un grupo de estudio en StudyPilot. El grupo comparte fechas límite, páginas de notas que editáis juntos y un chat.',
    ar: 'أضافك {from} إلى مجموعة دراسة على StudyPilot. تتشارك المجموعة المواعيد النهائية وصفحات ملاحظات تعدّلونها معًا ودردشة جماعية.',
    zh: '{from} 在 StudyPilot 上把你加入了一个学习小组。小组共享截止日期、共同编辑的笔记页面和小组聊天。',
    hi: '{from} ने आपको StudyPilot पर एक स्टडी ग्रुप में जोड़ा है। ग्रुप समय-सीमाएँ, साथ में संपादित नोट पेज और ग्रुप चैट साझा करता है।',
  },
  groupButton: { en: 'Open the group', fr: 'Ouvrir le groupe', es: 'Abrir el grupo', ar: 'فتح المجموعة', zh: '打开小组', hi: 'ग्रुप खोलें' },
  why: {
    en: 'You got this email because {from} invited your StudyPilot account. If you don\'t want to work with them, you can leave the page or group in the app.',
    fr: 'Vous recevez cet e-mail car {from} a invité votre compte StudyPilot. Si vous ne souhaitez pas collaborer, vous pouvez quitter la page ou le groupe dans l’application.',
    es: 'Recibes este correo porque {from} invitó a tu cuenta de StudyPilot. Si no quieres colaborar, puedes salir de la página o del grupo en la aplicación.',
    ar: 'وصلك هذا البريد لأن {from} دعا حسابك في StudyPilot. إن لم ترغب في التعاون، يمكنك مغادرة الصفحة أو المجموعة من التطبيق.',
    zh: '你收到这封邮件是因为 {from} 邀请了你的 StudyPilot 账号。如果不想参与，可以在应用中退出该页面或小组。',
    hi: 'आपको यह ईमेल इसलिए मिला क्योंकि {from} ने आपके StudyPilot खाते को आमंत्रित किया। अगर आप साथ काम नहीं करना चाहते, तो ऐप में पेज या ग्रुप छोड़ सकते हैं।',
  },
  untitled: { en: 'Untitled', fr: 'Sans titre', es: 'Sin título', ar: 'بلا عنوان', zh: '无标题', hi: 'बिना शीर्षक' },
};
const tr = (key, lang, v = {}) => fill(T[key][lang] || T[key].en, v);

function layout({ lang, title, lines, quote, button, path, note }) {
  const url = `${config.appUrl}${path}`;
  const html = `<!doctype html><html lang="${lang}" dir="${dirOf(lang)}"><body style="margin:0;background:#f7f7f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="100%" style="max-width:560px;background:#fff;border:1px solid #e9e9e7;border-radius:14px" cellspacing="0" cellpadding="0"><tr><td style="padding:28px">
    <img src="${config.appUrl}/logo.png" width="40" height="40" alt="" style="display:block;border-radius:10px">
    <h2 style="margin:16px 0 12px;font-size:20px;line-height:1.3;color:#37352f">${esc(title)}</h2>
    ${lines.map((l) => `<p style="margin:0 0 10px;color:#37352f;font-size:14px;line-height:1.55">${esc(l)}</p>`).join('')}
    ${quote ? `<p style="margin:14px 0 0;padding:12px 14px;border:1px solid #e9e9e7;border-radius:10px;background:#fbfbfa;font-size:15px;font-weight:600;color:#37352f">${esc(quote)}</p>` : ''}
    <p style="margin:22px 0 4px"><a href="${url}" style="display:inline-block;background:#2383e2;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:9px">${esc(button)}</a></p>
  </td></tr></table>
  <p style="max-width:560px;margin:14px auto 0;color:#9b9a97;font-size:12px;line-height:1.5">${esc(note)}</p>
  </td></tr></table></body></html>`;
  const text = [...lines, ...(quote ? ['', quote] : []), '', `${button}: ${url}`, '', note].join('\n');
  return { html, text };
}

async function people(toId, fromId) {
  const [to, from] = await Promise.all([
    User.findById(toId).select('name email language').lean(),
    User.findById(fromId).select('name email').lean(),
  ]);
  return { to, from, lang: to?.language || 'en', fromName: from?.name || from?.email || 'A classmate' };
}

/** A note page was shared with a student (role: 'viewer' or 'editor') */
export async function notifyPageShared({ toId, fromId, note, role }) {
  try {
    const { to, lang, fromName } = await people(toId, fromId);
    if (!to?.email) return;
    const name = (to.name || '').split(' ')[0] || to.email;
    const title = note.title?.trim() || tr('untitled', lang);
    const shown = `${note.icon ? `${note.icon} ` : ''}${title}`;
    const path = `/notes/${note._id}`;
    const subject = tr('pageSubject', lang, { from: fromName, title });
    await sendMail({
      to: to.email, toName: to.name, subject,
      ...layout({
        lang, title: subject, path, quote: shown, button: tr('pageButton', lang),
        lines: [tr('hi', lang, { name }), tr(role === 'viewer' ? 'pageView' : 'pageEdit', lang, { from: fromName }), tr('pageWhere', lang)],
        note: tr('why', lang, { from: fromName }),
      }),
    });
    await sendPush(to._id, { title: subject, body: shown, url: path, tag: `share-${note._id}` });
  } catch (err) {
    console.warn('Share email failed:', err.message);
  }
}

/** A student was added to a study group */
export async function notifyGroupAdded({ toId, fromId, group }) {
  try {
    const { to, lang, fromName } = await people(toId, fromId);
    if (!to?.email) return;
    const name = (to.name || '').split(' ')[0] || to.email;
    const path = `/groups/${group._id}`;
    const subject = tr('groupSubject', lang, { from: fromName, title: group.name });
    await sendMail({
      to: to.email, toName: to.name, subject,
      ...layout({
        lang, title: subject, path, quote: group.description ? `${group.name} · ${group.description}` : group.name, button: tr('groupButton', lang),
        lines: [tr('hi', lang, { name }), tr('groupBody', lang, { from: fromName })],
        note: tr('why', lang, { from: fromName }),
      }),
    });
    await sendPush(to._id, { title: subject, body: group.description || group.name, url: path, tag: `group-${group._id}` });
  } catch (err) {
    console.warn('Group email failed:', err.message);
  }
}

/**
 * Languages on the server: the AI's answer language, recommendation text, and the emails
 * (password reset and reminders). The app sends its language in the X-Lang header, and the
 * account remembers it (User.language) for emails sent later by the scheduler.
 */
export const LANG_NAMES = { en: 'English', fr: 'French', es: 'Spanish', ar: 'Arabic', zh: 'Simplified Chinese', hi: 'Hindi' };
export const LOCALES = { en: 'en-US', fr: 'fr-FR', es: 'es-ES', ar: 'ar', zh: 'zh-CN', hi: 'hi-IN' };
export const isLang = (l) => Object.hasOwn(LANG_NAMES, l);
export const langOf = (req) => { const l = String(req.get?.('x-lang') || '').slice(0, 2).toLowerCase(); return isLang(l) ? l : 'en'; };

/** A line for AI instructions: answer in the student's language */
export const replyIn = (lang) => (lang && lang !== 'en'
  ? `\nLANGUAGE: The app is set to ${LANG_NAMES[lang]}. Answer in ${LANG_NAMES[lang]}, unless the student writes to you in another language; then answer in theirs.\n`
  : '');

/** Emails and other server text. {name} values are filled in by tr(). */
const T = {
  // Password reset
  resetSubject: { en: 'Reset your Study Assistant password', fr: 'Réinitialisez votre mot de passe Study Assistant', es: 'Restablece tu contraseña de Study Assistant', ar: 'إعادة تعيين كلمة مرور Study Assistant', zh: '重置你的 Study Assistant 密码', hi: 'अपना Study Assistant पासवर्ड रीसेट करें' },
  resetTitle: { en: 'Reset your password', fr: 'Réinitialisez votre mot de passe', es: 'Restablece tu contraseña', ar: 'إعادة تعيين كلمة المرور', zh: '重置密码', hi: 'अपना पासवर्ड रीसेट करें' },
  hi: { en: 'Hi {name},', fr: 'Bonjour {name},', es: 'Hola, {name}:', ar: 'مرحبًا {name}،', zh: '{name}，你好：', hi: 'नमस्ते {name},' },
  resetBody: {
    en: 'Someone asked to reset the password for your Study Assistant account. Click the button to choose a new one. The link works for {minutes} minutes.',
    fr: 'Quelqu’un a demandé à réinitialiser le mot de passe de votre compte Study Assistant. Cliquez sur le bouton pour en choisir un nouveau. Le lien est valable {minutes} minutes.',
    es: 'Alguien pidió restablecer la contraseña de tu cuenta de Study Assistant. Pulsa el botón para elegir una nueva. El enlace sirve durante {minutes} minutos.',
    ar: 'طلب أحدهم إعادة تعيين كلمة مرور حسابك في Study Assistant. انقر الزر لاختيار كلمة مرور جديدة. الرابط صالح لمدة {minutes} دقيقة.',
    zh: '有人请求重置你的 Study Assistant 账户密码。点击按钮设置新密码。链接在 {minutes} 分钟内有效。',
    hi: 'किसी ने आपके Study Assistant खाते का पासवर्ड रीसेट करने को कहा है। नया पासवर्ड चुनने के लिए बटन पर क्लिक करें। लिंक {minutes} मिनट तक काम करेगा।',
  },
  resetButton: { en: 'Choose a new password', fr: 'Choisir un nouveau mot de passe', es: 'Elegir una nueva contraseña', ar: 'اختر كلمة مرور جديدة', zh: '设置新密码', hi: 'नया पासवर्ड चुनें' },
  resetCopy: { en: 'If the button does not work, copy this address into your browser:', fr: 'Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :', es: 'Si el botón no funciona, copia esta dirección en tu navegador:', ar: 'إذا لم يعمل الزر، انسخ هذا العنوان في متصفحك:', zh: '如果按钮无法使用，请把这个地址复制到浏览器中：', hi: 'अगर बटन काम न करे, तो यह पता अपने ब्राउज़र में कॉपी करें:' },
  resetIgnore: { en: 'If this was not you, you can ignore this email. Your password will not change.', fr: 'Si ce n’était pas vous, ignorez cet e-mail. Votre mot de passe ne changera pas.', es: 'Si no fuiste tú, ignora este correo. Tu contraseña no cambiará.', ar: 'إذا لم تكن أنت، يمكنك تجاهل هذه الرسالة. لن تتغير كلمة مرورك.', zh: '如果不是你本人操作，可以忽略这封邮件，你的密码不会改变。', hi: 'अगर यह आप नहीं थे, तो इस ईमेल को अनदेखा करें। आपका पासवर्ड नहीं बदलेगा।' },

  // Reminder emails
  open: { en: 'Open Study Assistant', fr: 'Ouvrir Study Assistant', es: 'Abrir Study Assistant', ar: 'افتح Study Assistant', zh: '打开 Study Assistant', hi: 'Study Assistant खोलें' },
  footer: {
    en: 'You get this because you turned on reminders in AI Study Assistant. Change them under <b>Reminders</b> in the app, or <a href="{url}" style="color:#9b9a97">turn off reminder emails</a>.',
    fr: 'Vous recevez ceci car vous avez activé les rappels dans AI Study Assistant. Modifiez-les dans <b>Rappels</b>, ou <a href="{url}" style="color:#9b9a97">désactivez les e-mails de rappel</a>.',
    es: 'Recibes esto porque activaste los recordatorios en AI Study Assistant. Cámbialos en <b>Recordatorios</b>, o <a href="{url}" style="color:#9b9a97">desactiva los correos de recordatorio</a>.',
    ar: 'تصلك هذه الرسالة لأنك فعّلت التذكيرات في AI Study Assistant. غيّرها من <b>التذكيرات</b> في التطبيق، أو <a href="{url}" style="color:#9b9a97">أوقف رسائل التذكير</a>.',
    zh: '你收到这封邮件是因为在 AI Study Assistant 中开启了提醒。可在应用的<b>提醒</b>中修改，或<a href="{url}" style="color:#9b9a97">关闭提醒邮件</a>。',
    hi: 'आपको यह इसलिए मिला क्योंकि आपने AI Study Assistant में रिमाइंडर चालू किए हैं। इन्हें ऐप में <b>रिमाइंडर</b> में बदलें, या <a href="{url}" style="color:#9b9a97">रिमाइंडर ईमेल बंद करें</a>।',
  },
  turnOff: { en: 'Turn off reminder emails', fr: 'Désactiver les e-mails de rappel', es: 'Desactivar los correos de recordatorio', ar: 'إيقاف رسائل التذكير', zh: '关闭提醒邮件', hi: 'रिमाइंडर ईमेल बंद करें' },
  planTitle: { en: 'Your study plan for today', fr: 'Votre plan d’étude du jour', es: 'Tu plan de estudio para hoy', ar: 'خطة دراستك لليوم', zh: '你今天的学习计划', hi: 'आज की आपकी स्टडी योजना' },
  planIntro: { en: 'Here is what matters most today, {name}.', fr: 'Voici ce qui compte le plus aujourd’hui, {name}.', es: 'Esto es lo más importante hoy, {name}.', ar: 'إليك أهم ما في يومك يا {name}.', zh: '{name}，这是你今天最重要的事。', hi: '{name}, आज सबसे ज़रूरी यह है।' },
  dayIntro: { en: 'Here is your day, {name}.', fr: 'Voici votre journée, {name}.', es: 'Este es tu día, {name}.', ar: 'إليك يومك يا {name}.', zh: '{name}，这是你今天的安排。', hi: '{name}, यह रहा आपका दिन।' },
  subjectPriorities: { en: 'Today: {n} priorities', fr: 'Aujourd’hui : {n} priorités', es: 'Hoy: {n} prioridades', ar: 'اليوم: {n} أولويات', zh: '今天：{n} 项优先任务', hi: 'आज: {n} प्राथमिकताएँ' },
  subjectDueSoon: { en: ', {n} due soon', fr: ', {n} à rendre bientôt', es: ', {n} vencen pronto', ar: '، {n} مستحقة قريبًا', zh: '，{n} 项即将到期', hi: ', {n} जल्द बाकी' },
  subjectDay: { en: 'Your study day', fr: 'Votre journée d’étude', es: 'Tu día de estudio', ar: 'يوم دراستك', zh: '你的学习日', hi: 'आपका स्टडी दिन' },
  topPriorities: { en: 'Top priorities', fr: 'Priorités', es: 'Prioridades principales', ar: 'أهم الأولويات', zh: '首要任务', hi: 'मुख्य प्राथमिकताएँ' },
  dueTodayTomorrow: { en: 'Due today and tomorrow', fr: 'À rendre aujourd’hui et demain', es: 'Vence hoy y mañana', ar: 'مستحق اليوم وغدًا', zh: '今明两天到期', hi: 'आज और कल बाकी' },
  todaysSessions: { en: "Today's study sessions", fr: 'Séances d’étude du jour', es: 'Sesiones de estudio de hoy', ar: 'جلسات الدراسة اليوم', zh: '今天的学习时段', hi: 'आज के स्टडी सेशन' },
  stillToStudy: { en: 'about {h} still to study', fr: 'encore environ {h} à étudier', es: 'faltan unas {h} de estudio', ar: 'تبقى حوالي {h} للدراسة', zh: '还需学习约 {h}', hi: 'लगभग {h} पढ़ना बाकी' },
  dueToday: { en: 'due today', fr: 'à rendre aujourd’hui', es: 'vence hoy', ar: 'مستحق اليوم', zh: '今天到期', hi: 'आज बाकी' },
  dueTomorrow: { en: 'due tomorrow', fr: 'à rendre demain', es: 'vence mañana', ar: 'مستحق غدًا', zh: '明天到期', hi: 'कल बाकी' },
  dueOn: { en: 'due {date}', fr: 'pour le {date}', es: 'vence el {date}', ar: 'مستحق في {date}', zh: '{date} 到期', hi: '{date} तक' },
  daysLeft: { en: '{n} days left', fr: '{n} jours restants', es: 'quedan {n} días', ar: 'متبقٍ {n} أيام', zh: '还剩 {n} 天', hi: '{n} दिन बाकी' },
  oneDayLeft: { en: '1 day left', fr: '1 jour restant', es: 'queda 1 día', ar: 'متبقٍ يوم واحد', zh: '还剩 1 天', hi: '1 दिन बाकी' },
  deadlinesTitle: { en: 'Deadlines coming up', fr: 'Échéances à venir', es: 'Próximas fechas límite', ar: 'مواعيد نهائية قادمة', zh: '即将到来的截止日期', hi: 'आने वाली डेडलाइन' },
  deadlinesIntro: { en: 'Here is what is due soon.', fr: 'Voici ce qui arrive bientôt.', es: 'Esto vence pronto.', ar: 'إليك ما هو مستحق قريبًا.', zh: '以下内容即将到期。', hi: 'यह जल्द बाकी है।' },
  deadlinesSubject: { en: '{n} deadlines today and tomorrow', fr: '{n} échéances aujourd’hui et demain', es: '{n} fechas límite hoy y mañana', ar: '{n} مواعيد نهائية اليوم وغدًا', zh: '今明两天有 {n} 个截止日期', hi: 'आज और कल {n} डेडलाइन' },
  dueSubject: { en: 'Due {when}: {title}', fr: 'À rendre {when} : {title}', es: 'Vence {when}: {title}', ar: 'مستحق {when}: {title}', zh: '{when}到期：{title}', hi: '{when} बाकी: {title}' },
  today: { en: 'today', fr: 'aujourd’hui', es: 'hoy', ar: 'اليوم', zh: '今天', hi: 'आज' },
  tomorrow: { en: 'tomorrow', fr: 'demain', es: 'mañana', ar: 'غدًا', zh: '明天', hi: 'कल' },
  openTasks: { en: 'Open Assignments & Exams', fr: 'Ouvrir Devoirs et examens', es: 'Abrir Tareas y exámenes', ar: 'افتح الواجبات والاختبارات', zh: '打开作业与考试', hi: 'असाइनमेंट और परीक्षाएँ खोलें' },
  openSchedule: { en: 'Open Study Schedule', fr: 'Ouvrir le planning', es: 'Abrir el horario', ar: 'افتح جدول الدراسة', zh: '打开学习日程', hi: 'स्टडी शेड्यूल खोलें' },
  sessionIn: { en: 'Study session in {n} min', fr: 'Séance d’étude dans {n} min', es: 'Sesión de estudio en {n} min', ar: 'جلسة دراسة بعد {n} دقيقة', zh: '{n} 分钟后开始学习', hi: '{n} मिनट में स्टडी सेशन' },
  sessionTitle: { en: 'Your study session starts at {time}', fr: 'Votre séance commence à {time}', es: 'Tu sesión empieza a las {time}', ar: 'تبدأ جلسة دراستك الساعة {time}', zh: '你的学习时段在 {time} 开始', hi: 'आपका स्टडी सेशन {time} बजे शुरू होगा' },
  getReady: { en: 'Time to get ready.', fr: 'C’est le moment de se préparer.', es: 'Es hora de prepararte.', ar: 'حان وقت الاستعداد.', zh: '该准备了。', hi: 'तैयार होने का समय है।' },
  session: { en: 'Session', fr: 'Séance', es: 'Sesión', ar: 'الجلسة', zh: '学习时段', hi: 'सेशन' },
  weekTitle: { en: 'Your study week', fr: 'Votre semaine d’étude', es: 'Tu semana de estudio', ar: 'أسبوع دراستك', zh: '你的学习周', hi: 'आपका स्टडी हफ़्ता' },
  weekIntro: { en: 'You studied <b>{h}</b> this week', fr: 'Vous avez étudié <b>{h}</b> cette semaine', es: 'Estudiaste <b>{h}</b> esta semana', ar: 'درست <b>{h}</b> هذا الأسبوع', zh: '你本周学习了 <b>{h}</b>', hi: 'आपने इस हफ़्ते <b>{h}</b> पढ़ाई की' },
  weekGoal: { en: ' out of your <b>{h}</b> goal', fr: ' sur un objectif de <b>{h}</b>', es: ' de tu meta de <b>{h}</b>', ar: ' من هدفك البالغ <b>{h}</b>', zh: '，目标是 <b>{h}</b>', hi: ', लक्ष्य <b>{h}</b> था' },
  weekSubject: { en: 'Your week: {h} studied', fr: 'Votre semaine : {h} étudiées', es: 'Tu semana: {h} de estudio', ar: 'أسبوعك: {h} دراسة', zh: '你的一周：已学习 {h}', hi: 'आपका हफ़्ता: {h} पढ़ाई' },
  ofGoal: { en: ' of {h}', fr: ' sur {h}', es: ' de {h}', ar: ' من {h}', zh: '/{h}', hi: ' / {h}' },
  hoursPerCourse: { en: 'Hours per course (last 7 days)', fr: 'Heures par cours (7 derniers jours)', es: 'Horas por curso (últimos 7 días)', ar: 'الساعات لكل مقرر (آخر 7 أيام)', zh: '各课程学习时长（最近 7 天）', hi: 'हर कोर्स के घंटे (पिछले 7 दिन)' },
  ofGoalItem: { en: '{h} of {goal} goal', fr: '{h} sur {goal} d’objectif', es: '{h} de {goal} de meta', ar: '{h} من هدف {goal}', zh: '{h} / 目标 {goal}', hi: '{goal} लक्ष्य में से {h}' },
  dueNext7: { en: 'Due in the next 7 days', fr: 'À rendre dans les 7 prochains jours', es: 'Vence en los próximos 7 días', ar: 'مستحق خلال الأيام السبعة القادمة', zh: '未来 7 天内到期', hi: 'अगले 7 दिनों में बाकी' },
  deadlinesNextWeek: { en: '{n} deadlines next week.', fr: '{n} échéances la semaine prochaine.', es: '{n} fechas límite la próxima semana.', ar: '{n} مواعيد نهائية الأسبوع القادم.', zh: '下周有 {n} 个截止日期。', hi: 'अगले हफ़्ते {n} डेडलाइन।' },
  openApp: { en: 'Open the app to see your day.', fr: 'Ouvrez l’app pour voir votre journée.', es: 'Abre la app para ver tu día.', ar: 'افتح التطبيق لترى يومك.', zh: '打开应用查看今天的安排。', hi: 'अपना दिन देखने के लिए ऐप खोलें।' },
  sessionAt: { en: 'Study session at {time}', fr: 'Séance d’étude à {time}', es: 'Sesión de estudio a las {time}', ar: 'جلسة دراسة الساعة {time}', zh: '{time} 的学习时段', hi: '{time} बजे स्टडी सेशन' },
  testTitle: { en: 'Reminders are working 🎉', fr: 'Les rappels fonctionnent 🎉', es: 'Los recordatorios funcionan 🎉', ar: 'التذكيرات تعمل 🎉', zh: '提醒正常工作 🎉', hi: 'रिमाइंडर काम कर रहे हैं 🎉' },
  testBody: { en: 'This is how your study reminders will look.', fr: 'Voici à quoi ressembleront vos rappels.', es: 'Así se verán tus recordatorios de estudio.', ar: 'هكذا ستبدو تذكيرات دراستك.', zh: '你的学习提醒会是这个样子。', hi: 'आपके स्टडी रिमाइंडर ऐसे दिखेंगे।' },
  unsubTitle: { en: 'Reminder emails are off', fr: 'Les e-mails de rappel sont désactivés', es: 'Los correos de recordatorio están desactivados', ar: 'تم إيقاف رسائل التذكير', zh: '已关闭提醒邮件', hi: 'रिमाइंडर ईमेल बंद हैं' },
  unsubBody: { en: 'You will not get reminder emails anymore. You can turn them back on under Reminders in the app.', fr: 'Vous ne recevrez plus d’e-mails de rappel. Vous pouvez les réactiver dans Rappels.', es: 'Ya no recibirás correos de recordatorio. Puedes volver a activarlos en Recordatorios.', ar: 'لن تصلك رسائل التذكير بعد الآن. يمكنك إعادة تفعيلها من التذكيرات في التطبيق.', zh: '你将不再收到提醒邮件。可以在应用的“提醒”中重新开启。', hi: 'अब आपको रिमाइंडर ईमेल नहीं मिलेंगे। ऐप में रिमाइंडर से इन्हें फिर चालू कर सकते हैं।' },
  badLink: { en: 'This link is not valid', fr: 'Ce lien n’est pas valide', es: 'Este enlace no es válido', ar: 'هذا الرابط غير صالح', zh: '此链接无效', hi: 'यह लिंक मान्य नहीं है' },
  badLinkBody: { en: 'Open the app and change your reminders under Reminders.', fr: 'Ouvrez l’app et modifiez vos rappels dans Rappels.', es: 'Abre la app y cambia tus recordatorios en Recordatorios.', ar: 'افتح التطبيق وغيّر تذكيراتك من التذكيرات.', zh: '请打开应用，在“提醒”中修改设置。', hi: 'ऐप खोलें और रिमाइंडर में अपने रिमाइंडर बदलें।' },
  subjectPriorities1: { en: 'Today: 1 priority' },
  deadlinesNextWeek1: { en: '1 deadline next week.' },
  hoursUnit: { en: '{n} h', fr: '{n} h', es: '{n} h', ar: '{n} س', zh: '{n} 小时', hi: '{n} घं' },

  // Recommendations (rule-based text when the AI is off)
  recMessage: { en: 'Spend more time on {course}: your {title} {when}.', fr: 'Travaillez davantage {course} : votre {title} {when}.', es: 'Dedica más tiempo a {course}: tu {title} {when}.', ar: 'خصّص وقتًا أطول لـ {course}: {title} {when}.', zh: '多花些时间在 {course} 上：你的 {title} {when}。', hi: '{course} पर ज़्यादा समय दें: आपका {title} {when}।' },
  recToday: { en: 'is due today', fr: 'est à rendre aujourd’hui', es: 'vence hoy', ar: 'مستحق اليوم', zh: '今天到期', hi: 'आज बाकी है' },
  recTomorrow: { en: 'is due tomorrow', fr: 'est à rendre demain', es: 'vence mañana', ar: 'مستحق غدًا', zh: '明天到期', hi: 'कल बाकी है' },
  recInDays: { en: 'is in {n} days', fr: 'est dans {n} jours', es: 'es en {n} días', ar: 'بعد {n} أيام', zh: '还有 {n} 天', hi: '{n} दिन में है' },
  recNotYet: { en: 'You have not studied {course} yet for this {kind}. It needs about {need} h.', fr: 'Vous n’avez pas encore étudié {course} pour {kind}. Il faut environ {need} h.', es: 'Aún no has estudiado {course} para {kind}. Necesita unas {need} h.', ar: 'لم تدرس {course} بعد لهذا {kind}. يحتاج حوالي {need} س.', zh: '你还没有为这个{kind}学习 {course}。大约需要 {need} 小时。', hi: 'आपने इस {kind} के लिए अभी तक {course} नहीं पढ़ा है। इसे लगभग {need} घं चाहिए।' },
  recStudied: { en: 'You have studied {studied} h{planned}, but this {kind} needs about {need} h.', fr: 'Vous avez étudié {studied} h{planned}, mais {kind} demande environ {need} h.', es: 'Has estudiado {studied} h{planned}, pero {kind} necesita unas {need} h.', ar: 'درست {studied} س{planned}، لكن هذا {kind} يحتاج حوالي {need} س.', zh: '你已学习 {studied} 小时{planned}，但这个{kind}大约需要 {need} 小时。', hi: 'आपने {studied} घं पढ़ाई की है{planned}, लेकिन इस {kind} को लगभग {need} घं चाहिए।' },
  recPlanned: { en: ' and planned {n} h', fr: ' et planifié {n} h', es: ' y planificado {n} h', ar: ' وخططت {n} س', zh: '、已计划 {n} 小时', hi: ' और {n} घं प्लान किए हैं' },
};

const KINDS = {
  Assignment: { en: 'assignment', fr: 'devoir', es: 'trabajo', ar: 'الواجب', zh: '作业', hi: 'असाइनमेंट' },
  Exam: { en: 'exam', fr: 'examen', es: 'examen', ar: 'الاختبار', zh: '考试', hi: 'परीक्षा' },
  Quiz: { en: 'quiz', fr: 'quiz', es: 'cuestionario', ar: 'الاختبار القصير', zh: '小测验', hi: 'क्विज़' },
  Project: { en: 'project', fr: 'projet', es: 'proyecto', ar: 'المشروع', zh: '项目', hi: 'प्रोजेक्ट' },
  Reading: { en: 'reading', fr: 'lecture', es: 'lectura', ar: 'القراءة', zh: '阅读', hi: 'रीडिंग' },
};
// French and Spanish say "this exam" with a gendered word, so those carry it here
const THIS = {
  fr: { Assignment: 'ce devoir', Exam: 'cet examen', Quiz: 'ce quiz', Project: 'ce projet', Reading: 'cette lecture' },
  es: { Assignment: 'este trabajo', Exam: 'este examen', Quiz: 'este cuestionario', Project: 'este proyecto', Reading: 'esta lectura' },
};
export const kindName = (type, lang) => THIS[lang]?.[type] || (KINDS[type]?.[lang] || KINDS[type]?.en || String(type || '').toLowerCase());

/** Server text in a language: tr('dueToday', 'fr'), tr('daysLeft', 'es', { n: 3 }) */
export function tr(key, lang = 'en', values = {}) {
  const entry = T[key];
  let out = entry ? (entry[lang] ?? entry.en) : key;
  for (const [k, v] of Object.entries(values)) out = out.replaceAll(`{${k}}`, String(v));
  return out;
}
/** Like tr(), with a "1" form where a language has one: trn('subjectPriorities', 'en', 1) */
export const trn = (key, lang, n, values = {}) => tr(n === 1 && T[`${key}1`]?.[lang] ? `${key}1` : key, lang, { n, ...values });
export const dirOf = (lang) => (lang === 'ar' ? 'rtl' : 'ltr');

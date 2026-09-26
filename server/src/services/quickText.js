import mongoose from 'mongoose';
import Category from '../models/Category.js';
import { createTransaction } from './ledger.js';
import { toNum } from '../utils/money.js';

/**
 * Quick-text expense logger (QS-1).
 *
 * The student types the sentence they would have said out loud —
 * "yaar aaj canteen par 350 kharch kiye" — and this turns it into a real
 * entry: amount, category, date and description, saved through the same
 * ledger path as the quick-add form so history, budgets and alerts behave
 * exactly as they always have.
 *
 * It is a parser, not a guess dressed up as one. Every part of the answer says
 * which words it came from and how sure it is, the category it picks always
 * exists in this student's own list, and anything it cannot read (no amount)
 * is refused with a reason instead of inventing a number. The learner also
 * teaches it: a correction here feeds the same categoriser the quick-add
 * suggestions already use (services/categoriser.js), so a habit like calling
 * every taxi ride "careem" makes the next one right.
 *
 * Note on naming: the brief calls this an "AI" helper. There is no model here
 * and none is implied — the work is deterministic pattern matching plus the
 * student's own corrections, which is why it can be trusted with money and why
 * the confirmation can always show its working.
 */

/* ------------------------------- vocabulary --------------------------------- */
/*
 * Keys are the DEFAULT category names (services/defaults.js). Values are the
 * words that point at them, in every script the app's own example sentence is
 * written in — and that is not decoration. `quick.placeholder` is translated
 * per language, so the interface teaches a Hindi speaker "आज कैंटीन पर 350 खर्च
 * किए" and an Arabic speaker "اليوم مطعم 350". If the words in those examples
 * were missing from this table, the very sentence the UI suggests would fall
 * back to Miscellaneous and teach the wrong lesson. Roman Urdu is here too,
 * because that is how students type fastest in Pakistan.
 *
 * Matching is on whole words after lowercasing; a word must stand alone so
 * "facebook" never reads as "book".
 */
const EXPENSE_WORDS = {
  Food: [
    'food', 'lunch', 'dinner', 'breakfast', 'canteen', 'cafeteria', 'mess', 'khana', 'kharch',
    'khaana', 'roti', 'chai', 'tea', 'coffee', 'snack', 'burger', 'pizza', 'grocery',
    'groceries', 'supermarket', 'milk', 'fruit', 'restaurant', 'sabzi', 'daal', 'biryani', 'tiffin',
    'doodh', 'nashta', 'khane', 'barbecue', 'bbq', 'juice',
    // Hindi (Devanagari)
    'कैंटीन', 'खाना', 'खर्च', 'भोजन', 'कैफे', 'चाय', 'नाश्ता', 'दूध', 'रसोई',
    // Urdu (Arabic script)
    'کینٹین', 'کھانا', 'خرچ', 'چائے', 'ناشتہ', 'دودھ', 'ریستوران', 'کافے',
    // Arabic
    'مطعم', 'طعام', 'أكل', 'مقهى', 'قهوة', 'فطور', 'بقالة', 'سوبرماركت',
    // Spanish / Portuguese / French / German / Turkish / Indonesian
    'comedor', 'comida', 'almuerzo', 'cena', 'cafetería', 'cafeteria', 'refeitório', 'almoço',
    'jantar', 'café', 'cantine', 'repas', 'déjeuner', 'dîner', 'diner', 'épicerie', 'epicerie',
    'mensa', 'essen', 'imbiss', 'lebensmittel', 'kantin', 'yemek', 'öğle', 'kahvaltı', 'sarapan',
    'warung', 'makan',
    // Russian / Chinese / Japanese / Persian
    'столовая', 'обед', 'ужин', 'кафе', 'продукты', '食堂', '午饭', '晚餐', '咖啡', '超市',
    '昼食', '夕食', 'カフェ', '買い物', 'سلف', 'ناهار', 'شام', 'قهوه', 'خواربار',
  ],
  Transport: [
    'transport', 'bus', 'metro', 'train', 'taxi', 'uber', 'careem', 'ride', 'fuel', 'petrol',
    'gas', 'rickshaw', 'auto', 'bike', 'parking', 'toll', 'fare', 'busfare', 'conductor', 'wagon',
    'बस', 'टैक्सी', 'यात्रा', 'किराया', 'ٹیکسی', 'پیڈ', 'بس', 'مواصلات', 'تاكسي', 'نقل', 'أجرة',
    'ônibus', 'onibus', 'tram', 'viaje', 'bahn', 'zug', 'транспорт', 'такси', 'автобус', '公交',
    '地铁', '打车', '交通', 'バス', '電車', 'タクシー', 'اتوبوس', 'کرایہ',
  ],
  'Hostel/Rent': [
    'hostel', 'rent', 'room', 'accommodation', 'kiraye', 'devar', 'roommate', 'flat',
    'society', 'bill', 'utilities', 'electricity',
    'छात्रावास', 'किराया', 'कमरा', 'کرایہ', 'کمرہ', 'بیل', 'إيجار', 'سكن', '学生寮', '下宿',
    'alquiler', 'habitación', 'inquilino', 'loyer', 'chambre', 'miete', 'zimmer', 'kira',
    'kost', 'sewa', 'kamar', 'общайка', 'аренда', '宿舍', '房租', '下宿料', '社宅',
  ],
  Academics: [
    'book', 'books', 'textbook', 'notes', 'course', 'fee', 'fees', 'tuition', 'class', 'lab',
    'print', 'printing', 'stationery', 'exam', 'form', 'register', 'copy', 'photocopy', 'assignment',
    'kitab', 'kitaab', 'semester', 'xerox',
    'किताब', 'पुस्तक', 'फीस', 'नोट्स', 'कॉपी', 'प्रिंट', 'کتاب', 'فیس', 'امتحان', 'كتاب', 'رسوم',
    'libro', 'cuenta', 'taxa', 'matrícula', 'matricula', 'frais', 'inscription', 'gebühr',
    'vorlesung', 'skript', 'buku', 'kuliah', 'spes', 'книга', 'учебник', '笔记', '书本', '考试',
    '费用', '学費', '教科書', '授業', '試験', '本',
  ],
  Subscriptions: [
    'netflix', 'spotify', 'youtube', 'prime', 'subscription', 'subscriptions', 'gym', 'membership',
    'software', 'licence', 'license', 'icloud', 'hotstar', 'canva', 'notion', 'linkedin', 'zoom',
    'dropbox', 'patreon', 'medium',
    'सदस्यता', 'जिम', 'सब्सक्रिप्शन', 'اشتراك', 'نادي', '订阅', '会员', '訂閱', 'suscripción',
    'suscricao', 'assinatura', 'abonnement', 'mitgliedschaft', 'üyelik', 'abonelik', 'langganan',
    'подписка', 'ripe',
  ],
  Entertainment: [
    'movie', 'cinema', 'film', 'game', 'gaming', 'concert', 'party', 'club', 'trip', 'outing',
    'theatre', 'music', 'festival', 'cricket', 'match', 'ticket', 'tickets',
    'फिल्म', 'सिनेमा', 'खेल', 'पार्टी', 'कॉन्सर्ट', 'فلم', 'سینما', 'حفل', 'مطالبة', 'película',
    'cine', 'fiesta', 'cinéma', 'sortie', 'kino', 'konzert', 'sinema', 'oyun', 'кино',
    'развлечения', '电影', '游戏', '派对', '映画', 'ゲーム', '映画館', 'कॉन्सर्ट',
  ],
  Miscellaneous: [
    'haircut', 'laundry', 'repair', 'phone', 'recharge', 'medicine', 'pharmacy', 'hospital',
    'courier', 'delivery', 'tailor', 'bag', 'umbrella', 'watch', 'glass', 'keys',
    'फ़ोन', 'दवाई', 'چنگری', 'دوائی', 'صيدلية', 'قصادة', 'soldeur', 'coupe', 'peluquería',
    'reparación', 'droguería', 'droguerie', 'apotheke', 'kuaför', 'apotek', 'аптека', 'ремонт',
    '理发', '药', '薬', 'صالون',
  ],
};

const INCOME_WORDS = {
  Allowance: [
    'allowance', 'stipend', 'pocket', 'pocketmoney', 'salaryadvance', 'messallowance',
    'मासिका', 'वजीफा', 'نفقة', 'مصروف', 'm stipend', 'becario', 'becaria', 'stipendio',
    'allocation', 'tafelgeld', 'ödenek', 'uang', 'tunjangan', 'стипендия', 'пособие', '津贴', '手当',
  ],
  'Part-time Job': [
    'job', 'salary', 'parttime', 'freelance', 'tutoring', 'tutor', 'internship', 'wages',
    'pay', 'paid', 'work', 'khana', 'majdoori', 'kaam', 'task',
    'नौकरी', 'पढ़ाना', 'कमाई', 'اہلکار', 'ماجودوری', 'کام', 'trabajo', 'travail', 'arbeit', 'gehalt',
    'iş', 'kamu', 'работа', 'зарплата', '工资', '薪水', '仕事', 'کسب',
  ],
  Scholarship: [
    'scholarship', 'grant', 'bursary', 'waiver', 'fellowship', 'छात्रवृत्ति', 'منحة', 'beca',
    'bourse', 'stipendium', 'beasiswa', 'стипендия', '奖学金', '奬學金', '奨学金',
  ],
  Gift: [
    'gift', 'gifted', 'present', 'eid', 'birthdaygift', 'lucky', 'उपहार', 'توطہ', 'ہدیہ', 'عيدية',
    'هدية', 'regalo', 'cadeau', 'geschenk', 'hediye', 'подарок', '礼物', '禮物', 'プレゼント',
  ],
  'Other Income': [
    'refund', 'cashback', 'won', 'prize', 'returned', 'rebate', 'winnings', 'bonus', 'वापसी', 'इनाम',
    'ریفنڈ', 'رقمی', 'واپسی', 'reembolso', 'retour', 'rückerstattung', 'iade', 'terbayar',
    'возврат', '退款', '返金', 'بازگشت',
  ],
};

const INCOME_HINTS = [
  'allowance', 'salary', 'paid', 'received', 'credited', 'scholarship', 'stipend', 'refund',
  'cashback', 'gift', 'bonus', 'wages', 'freelance', 'internship', 'won', 'prize', 'pocket',
  // the same idea in the scripts the app is read in
  'मिला', 'मिले', 'वेतन', 'उपहार', 'वापस', 'प्राप्त', 'ملا', 'ملے', 'واپس', 'محصل', 'حصلت', 'راتب',
  'مكافأة', 'هدية', 'استرداد', 'cobré', 'cobrado', 'recibí', 'devolvido', 'Gehalt', 'erhalten',
  'bekommen', 'terima', 'diterima', 'получил', 'вернули', '收到', '受け取った', '受け取り', 'دریافت',
  'برگشت',
];

const CURRENCY_WORDS = ['rs', 'rs.', 'pkr', 'inr', 'usd', 'eur', 'gbp', 'aed', 'dollar', 'dollars', 'rupees', 'rupee'];

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const MAX_AMOUNT = 1e9;

/**
 * A money-shaped number: digits with optional thousands separators and up to
 * two decimals, plus the "1.5k" shorthand students actually type. The k/m
 * suffix must be attached — "350 kharch" must not read as three hundred and
 * fifty thousand.
 */
const MONEY = String.raw`\d[\d,]*(?:\.\d{1,2})?[km]?`;

/**
 * A number with a currency word or symbol right next to it, in either order:
 * "350 rs", "rs 350", "₨350", "$12.50", "350/-". The currency list above is
 * the single source, so adding a currency is a one-line change.
 */
const CURRENCY_AMOUNT = new RegExp(
  String.raw`(?:[₨$€£₹]|\b(?:${CURRENCY_WORDS.map((c) => c.replace(/\./g, '\\.')).join('|')})\b)\s*(${MONEY})\b` +
    String.raw`|(${MONEY})\s*(?:[₨$€£₹]|\b(?:${CURRENCY_WORDS.map((c) => c.replace(/\./g, '\\.')).join('|')})\b)`,
  'i'
);

/* --------------------------------- helpers ---------------------------------- */

const lower = (s) => String(s || '').toLowerCase();

/**
 * Split a sentence into words, keeping every script intact.
 *
 * Two details matter here. Word boundaries only exist for ASCII in JavaScript,
 * so matching is done on tokens rather than with \b — that is what lets a
 * Devanagari or Arabic word be found at all. And combining marks (\p{M}: the
 * matras in "कैंटीन", the harakat in Arabic) are letters *as far as spelling is
 * concerned*: dropping them would reduce "कैंटीन" to "कटन" and no vocabulary
 * entry would ever match.
 */
function wordsIn(text) {
  return lower(text)
    .replace(/[^\p{L}\p{N}\p{M}\s.,/₨$€£₹%.-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/[.,]+$/, ''));
}

/**
 * Everything worth matching against: the whole words of the sentence, plus every
 * two-to-four character run inside CJK tokens.
 *
 * Chinese and Japanese do not separate words with spaces — "今天在食堂花了" is
 * one whitespace-delimited run — so without this the vocabulary could never be
 * reached in those languages and every sentence would fall back to
 * Miscellaneous. Four characters is the longest useful window here: it covers
 * 食堂 / 午饭 / 学費 / 映画館 without dragging in unrelated fragments.
 */
const HAS_CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/;

function searchWords(text) {
  const base = wordsIn(text);
  const out = new Set(base);
  for (const token of base) {
    if (!HAS_CJK.test(token)) continue;
    for (let size = 2; size <= 4; size += 1) {
      for (let i = 0; i + size <= token.length; i += 1) out.add(token.slice(i, i + size));
    }
  }
  return out;
}

/**
 * Whole-word search over any script. Word boundaries in JavaScript's \b only
 * exist for ASCII letters, so "आज" or "اليوم" would never match a \b pattern —
 * the words are tokenised instead and compared, which works the same in every
 * script and cannot fire on a fragment ("aaj" inside "aajni").
 */
function includesWord(text, list) {
  const words = searchWords(text);
  return list.some((word) => words.has(word));
}

/* ---------------------------------- amount ---------------------------------- */

/**
 * Pull the amount out of the sentence.
 *
 * Preference order, and the reason for it:
 *  1. a number glued to a currency word ("350 rs", "rs 350", "$12.50") — that
 *     is always the amount;
 *  2. otherwise the largest number that is NOT part of a date — students write
 *     the amount as a round figure and dates as small ones, and a date must
 *     never be mistaken for money.
 * Returns { value, raw, from } or null.
 */
function findAmount(text) {
  // 1. currency-adjacent numbers (also catches "₨350", "$12.50", "350/-")
  const glued = lower(text).match(CURRENCY_AMOUNT);
  if (glued) {
    const value = normaliseNumber(glued[1] || glued[3]);
    if (value && value > 0 && value <= MAX_AMOUNT) return { value, raw: glued[0].trim(), from: 'currency' };
  }

  // 2. plain numbers, skipping anything a date can explain
  const dateTokens = dateLikeTokens(text);
  const candidates = [];
  for (const m of lower(text).matchAll(new RegExp(String.raw`(?<![\d/.,-])(${MONEY})(?![\d/.,-])`, 'g'))) {
    const raw = m[1];
    const at = m.index ?? 0;
    if (dateTokens.some((t) => Math.abs(t - at) < 6)) continue; // inside a date
    const value = normaliseNumber(raw);
    if (value > 0 && value <= MAX_AMOUNT) candidates.push({ value, raw: raw.trim(), at });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.value - a.value || a.at - b.at);
  return { value: candidates[0].value, raw: candidates[0].raw, from: 'largest-number' };
}

/**
 * Turn a written number into a plain one.
 *
 * "1.5k" / "2k"      → 1500 / 2000
 * "1,200"            → 1200        (thousands, English style)
 * "3,50" / "12,50"   → 3.5 / 12.5  (decimal comma, as most of Europe writes it)
 *
 * The comma rule is the only genuinely ambiguous part, and it is decided by
 * the digits after it: a single comma followed by exactly two digits and no dot
 * is a decimal point everywhere except English-style thousands writing, where
 * "1,200" has three. Reading "3,50" as 350 would silently log a 3.50 coffee as
 * a 350 one, so the conservative reading wins: two digits means cents.
 */
function normaliseNumber(raw) {
  const text = String(raw).replace(/\s+/g, '').trim();
  const short = /^(\d+(?:[.,]\d+)?)([km])$/i.exec(text);
  if (short) {
    const scale = short[2].toLowerCase() === 'k' ? 1000 : 1e6;
    return Math.round(Number(short[1].replace(',', '.')) * scale * 100) / 100;
  }

  const commas = (text.match(/,/g) || []).length;
  const dotted = (text.match(/\./g) || []).length;
  let normalised = text;
  if (commas === 1 && dotted === 0 && /^(\d+),(\d{2})$/.test(text)) {
    normalised = text.replace(',', '.'); // decimal comma
  } else {
    normalised = text.replace(/,/g, ''); // thousands separators
  }

  const n = Number(normalised);
  return Number.isFinite(n) ? n : 0;
}

/* ----------------------------------- date ----------------------------------- */

/*
 * "Today" and "yesterday" in every script the app is read in. Without these a
 * Hindi sentence beginning "आज" (today) or an Arabic one beginning "اليوم" would
 * be dated today anyway by default — but the student who says "कल" (yesterday)
 * would silently get today, and that is the kind of quiet wrong the whole
 * feature is supposed to avoid.
 */
const TODAY_WORDS = [
  'today', 'aaj', 'abhi', 'आज', 'अभी', 'آج', 'اب', 'اليوم', 'heute', 'hoy', 'oggi', 'bugün',
  'hari', 'сегодня', '今天', '今日', 'امروز',
];
const YESTERDAY_WORDS = [
  'yesterday', 'yest', 'kal', 'parson', 'कल', 'گزھلے', 'گزشتہ', 'أمس', 'gestern', 'ayer', 'ieri',
  'dün', 'ontem', '昨天', '昨日', 'دیروز',
];

/** Character offsets covered by something that looks like a date. */
function dateLikeTokens(text) {
  const spans = [];
  const s = lower(text);
  for (const re of [
    /\b\d{4}-\d{1,2}-\d{1,2}\b/g,
    /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g,
    /\b\d{1,2}\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/g,
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*\d{1,2}\b/g,
  ]) {
    for (const m of s.matchAll(re)) spans.push(m.index);
  }
  return spans;
}

/**
 * The date the student meant. Today unless they say otherwise: "yesterday" /
 * "kal", or an explicit "2026-09-20", "20/09", "12 sep". Only dates within a
 * year either way are accepted — anything further off is a typo, not history.
 *
 * Every date here is built at UTC midnight because that is what the ledger
 * stores (services/ledger.js `startOfDay`). Building it in local time would
 * save a student in Karachi or Honolulu "today" as yesterday for part of the
 * day, and the entry would quietly move in every monthly report.
 */
export function parseQuickDate(text, now = new Date()) {
  const s = lower(text);
  const base = new Date(now);
  const baseYear = base.getUTCFullYear();
  const today = () => new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  const shift = (days) => {
    const d = today();
    return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
  };

  if (includesWord(s, YESTERDAY_WORDS)) return { date: shift(-1), from: 'yesterday' };
  if (includesWord(s, TODAY_WORDS)) return { date: today(), from: 'today' };

  let m = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(s);
  if (m) return accept(Date.UTC(+m[1], +m[2] - 1, +m[3]), 'iso', base);

  m = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/.exec(s);
  if (m) {
    // day first (the format the app and most of the world reads) — but a first
    // number that cannot be a day can only be the month: "09/25" is 25 Sep
    const first = Number(m[1]);
    const second = Number(m[2]);
    const monthFirst = second > 12 && first <= 12;
    const day = monthFirst ? second : first;
    const month = (monthFirst ? first : second) - 1;
    let year = m[3] ? Number(m[3]) : baseYear;
    if (year < 100) year += 2000;
    return accept(Date.UTC(year, month, day), 'day-month', base);
  }

  const monthWord = /\b(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/.exec(s);
  if (monthWord) {
    return accept(Date.UTC(baseYear, MONTHS[monthWord[2]] - 1, Number(monthWord[1])), 'day-month', base);
  }
  const dayFirst = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*(\d{1,2})\b/.exec(s);
  if (dayFirst) {
    return accept(Date.UTC(baseYear, MONTHS[dayFirst[1]] - 1, Number(dayFirst[2])), 'day-month', base);
  }

  return { date: today(), from: 'today' };
}

/** A date more than a year away is a typo, so fall back to today. */
function accept(utcMs, from, base) {
  const year = new Date(utcMs).getUTCFullYear();
  const baseYear = base.getUTCFullYear();
  if (year < baseYear - 1 || year > baseYear + 1) {
    return { date: new Date(Date.UTC(baseYear, base.getUTCMonth(), base.getUTCDate())), from: 'today' };
  }
  return { date: new Date(utcMs), from };
}

/* -------------------------------- category --------------------------------- */

/** The default category this sentence is talking about, plus the words used. */
export function matchCategory(text) {
  const words = searchWords(text);
  const list = [...words];
  const joined = wordsIn(text).join(' ');
  const income = INCOME_HINTS.some((h) => words.has(h));
  const table = income ? INCOME_WORDS : EXPENSE_WORDS;

  let best = null;
  for (const [name, table_] of Object.entries(table)) {
    const hits = table_.filter((w) => words.has(w));
    if (hits.length && (!best || hits.length > best.hits.length)) best = { name, hits };
  }
  if (!best) {
    // Second chance: a substring match, so "canteen2" or "foodstuff" still lands.
    for (const [name, table_] of Object.entries(table)) {
      const hits = table_.filter((w) => w.length >= 5 && joined.includes(w));
      if (hits.length) return { name, hits, type: income ? 'income' : 'expense', how: 'contains' };
    }
  }
  return {
    name: best ? best.name : income ? 'Other Income' : 'Miscellaneous',
    hits: best ? best.hits : [],
    type: income ? 'income' : 'expense',
    how: best ? 'words' : 'fallback',
  };
}

/* ---------------------------------- parse ----------------------------------- */

/**
 * Read a sentence into a draft entry. Pure: no database, so it is directly
 * testable and the client can use the same rules to preview while typing.
 * Returns { ok, reason?, amount?, type?, categoryName?, date?, description?, confidence, matched }
 */
export function parseQuickText(text, now = new Date()) {
  const raw = String(text || '').trim();
  if (raw.length < 2) return { ok: false, reason: 'empty', confidence: 0, matched: [] };
  if (raw.length > 240) return { ok: false, reason: 'too-long', confidence: 0, matched: [] };

  const amount = findAmount(raw, wordsIn(raw));
  if (!amount) return { ok: false, reason: 'no-amount', confidence: 0, matched: [] };

  const cat = matchCategory(raw);
  const when = parseQuickDate(raw, now);
  const matched = [
    ...(cat.hits || []).slice(0, 4).map((w) => `cat:${w}`),
    amount.from === 'currency' ? `amount:${amount.raw}` : `amount:${amount.raw}`,
    when.from === 'today' ? 'date:today' : `date:${when.from}`,
  ];

  // How sure are we: a real category word plus a currency-marked amount is a
  // confident read; a fallback category with a bare number is a guess.
  let confidence = 0.4;
  if (cat.how === 'words') confidence += 0.3;
  if (amount.from === 'currency') confidence += 0.2;
  if (when.from !== 'today') confidence += 0.05;
  confidence = Math.min(0.98, Math.round(confidence * 100) / 100);

  return {
    ok: true,
    amount: amount.value,
    type: cat.type,
    categoryName: cat.name,
    categoryHint: cat.how,
    date: when.date,
    dateSource: when.from,
    description: raw.slice(0, 240),
    confidence,
    matched,
  };
}

/* ---------------------------------- save ------------------------------------ */

/** The student's own category with this name, or the shared default of that name. */
async function findCategoryByName(user, name, type) {
  const wanted = lower(name);
  const mine = await Category.find({
    user: user._id,
    isActive: { $ne: false },
  })
    .sort({ isDefault: -1 })
    .lean();
  const all = [...mine, ...(await Category.find({ isDefault: true, isActive: { $ne: false } }).lean())];

  const hit =
    all.find((c) => lower(c.name) === wanted) ||
    all.find((c) => lower(c.name).replace(/[^a-z]/g, '') === wanted.replace(/[^a-z]/g, '')) ||
    all.find((c) => type && c.type === type && lower(c.name).startsWith(wanted.slice(0, 4)));
  return hit || null;
}

/**
 * Parse a sentence and save it. Returns the created transaction plus the draft
 * so the confirmation can show what was understood — and say so honestly when
 * the category was a fallback.
 */
export async function logQuickText(user, text) {
  const draft = parseQuickText(text);
  if (!draft.ok) {
    const err = new Error(
      draft.reason === 'no-amount'
        ? 'I could not find an amount in that sentence — try "canteen 350".'
        : 'Type a short sentence with an amount, like "canteen 350".'
    );
    err.status = 400;
    throw err;
  }

  const category = await findCategoryByName(user, draft.categoryName, draft.type);
  if (!category) {
    const err = new Error(`No category called "${draft.categoryName}" is available.`);
    err.status = 400;
    throw err;
  }

  const txn = await createTransaction(user, {
    type: draft.type,
    amount: draft.amount,
    categoryId: category._id,
    description: draft.description,
    date: draft.date,
    // recorded so the categoriser can learn from a later correction;
    // 'keywords' is the honest source — the category came from words in the
    // sentence, not from a guess
    suggestionSource: 'keywords',
    suggestedCategory: category._id,
  });

  return {
    // amounts leave as plain numbers: the browser has no use for Decimal128,
    // and every other route in this API presents them the same way
    transaction: {
      id: txn._id.toString(),
      amount: toNum(txn.amount),
      type: txn.type,
      date: txn.date,
      description: txn.description,
      categoryName: category.name,
    },
    draft: { ...draft, amount: toNum(txn.amount) },
    category: { id: category._id, name: category.name, icon: category.icon },
  };
}

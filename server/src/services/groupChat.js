import mongoose from 'mongoose';

import GroupMessage from '../models/GroupMessage.js';
import { loadGroupFor } from './groups.js';
import { toDec, toNum, isPositiveAmount } from '../utils/money.js';

/**
 * The group chat (GRP-4): a WhatsApp-style thread inside a group, plus the "+"
 * button that posts a small poll card — chai at 4pm, 350 a head, who's in? —
 * which members tick themselves into and watch the total move.
 *
 * Three rules shape the whole file, and none of them is a feature:
 *
 *  1. ISOLATION. Every entry point starts with the same loader the rest of the
 *     group module uses (`loadGroupFor`), so a chat that is not yours is a 404
 *     and never an empty room. The router does not know or care who is a
 *     member — the group id goes down, the room comes back up.
 *
 *  2. PEOPLE ARE POSITIONS. `senderIndex` and every `memberIndex` are seats in
 *     `group.members`, because a roommate who has not signed up is still in the
 *     room. That is also why a response row can only ever be written for the
 *     caller's own seat: there is no id in the payload that could name somebody
 *     else's row, and a payload that tries is refused.
 *
 *  3. A CARD IS NOT MONEY. The rate is Decimal128 and the running total is
 *     worked in whole cents, but nothing here writes to the group's bills or
 *     balances — a poll is a plan, and only a bill moves money. The category
 *     travels as a key, never as a sentence: the wording of a card belongs to
 *     the client and to its dictionary (the growth guide's rule, services/growMoney.js).
 */

const MAX_MESSAGES = 100; // the last hundred lines, which is a whole screenful of chat
const MAX_TEXT = 1000;
const MAX_LOCATION = 120;
const MAX_PURPOSE = 120;
const MAX_NOTE = 200;

/** The kinds of thing a card can be about — keys, not wording. */
export const POLL_CATEGORIES = Object.freeze(['chai', 'transport', 'food', 'outing', 'shopping', 'other']);

/* ---------------------------------- reads ---------------------------------- */

/**
 * The room: who is in it (with the initials a chat bubble needs) and the last
 * hundred messages, oldest first, exactly as the thread reads.
 */
export async function chatRoom(user, groupId) {
  const group = await loadGroupFor(user, groupId);
  const you = group.memberIndexOf(user._id);

  // Newest first so the LIMIT keeps the hundred lines we want, then turned
  // around: a chat that renders bottom-up must be handed to it in reading
  // order. _id breaks a tie between two lines written in the same millisecond.
  const messages = await GroupMessage.find({ group: group._id })
    .sort({ createdAt: -1, _id: -1 })
    .limit(MAX_MESSAGES);
  messages.reverse();

  return {
    group: {
      id: group._id.toString(),
      name: group.name,
      currency: group.currency,
      members: group.members.map((member, index) => chatMember(member, index, index === you)),
    },
    rows: messages.map((message) => toPublicMessage(message, group, you)),
  };
}

/* ---------------------------------- writes --------------------------------- */

/** Something somebody typed. */
export async function postMessage(user, groupId, payload = {}) {
  const group = await loadGroupFor(user, groupId);

  const text = String(payload.text ?? '').trim();
  if (!text) throw badRequest('Write something before sending it.');
  if (text.length > MAX_TEXT) throw badRequest(`A message can be at most ${MAX_TEXT} characters long.`);

  const message = await GroupMessage.create({
    group: group._id,
    kind: 'text',
    text,
    senderIndex: group.memberIndexOf(user._id),
  });

  return toPublicMessage(message, group, group.memberIndexOf(user._id));
}

/**
 * A poll card. The only decision the server makes is whether the card is
 * well-formed; who is in and who is out is the group's business, answered by
 * the ticks that follow.
 */
export async function postPoll(user, groupId, payload = {}) {
  const group = await loadGroupFor(user, groupId);

  if (!POLL_CATEGORIES.includes(payload.category)) {
    throw badRequest('Say what the card is about: chai, transport, food, an outing, shopping or something else.');
  }
  if (!isPositiveAmount(payload.rate)) {
    throw badRequest('The rate must be more than 0 with at most 2 decimals.');
  }

  const poll = {
    category: payload.category,
    location: limited(payload.location, MAX_LOCATION, 'The place name can be at most 120 characters long.'),
    purpose: limited(payload.purpose, MAX_PURPOSE, 'The purpose can be at most 120 characters long.'),
    date: cardDate(payload.date),
    time: cardTime(payload.time),
    rate: toDec(payload.rate),
    note: limited(payload.note, MAX_NOTE, 'The note can be at most 200 characters long.'),
    // One row per member, every one of them PENDING. A card is meant to show
    // who has not answered yet, and that is only possible if "has not answered"
    // is stored rather than inferred from an absent row.
    //
    // A member added later does NOT get a row on this card: the card is a
    // snapshot of who was asked, and growing old cards would quietly change
    // what a question from last week is asking of today's group. They can still
    // tick the cards posted from the day they joined.
    responses: group.members.map((_, memberIndex) => ({ memberIndex, yes: null, at: null })),
  };

  const message = await GroupMessage.create({
    group: group._id,
    kind: 'poll',
    text: '',
    senderIndex: group.memberIndexOf(user._id),
    poll,
  });

  return toPublicMessage(message, group, group.memberIndexOf(user._id));
}

/**
 * Tick yourself in, or out, on a card — and tap the same button twice to take
 * your answer back. Nothing else about a card's responses is writable: the
 * row is found by the CALLER's own seat, so a payload naming somebody else is
 * refused instead of honoured, and the running total comes back with the message
 * so the client never does the arithmetic.
 */
export async function respondToPoll(user, groupId, messageId, payload = {}) {
  const group = await loadGroupFor(user, groupId);
  const message = await loadMessage(group, messageId);
  if (message.kind !== 'poll') throw badRequest('That is not a poll card.');

  const mine = group.memberIndexOf(user._id);
  if (payload.memberIndex !== undefined && Number(payload.memberIndex) !== mine) {
    throw badRequest('You can only answer a poll for yourself.');
  }

  const { yes } = payload;
  if (yes !== true && yes !== false && yes !== null) {
    throw badRequest('Answer the card with yes or no — tap the same button again to take your answer back.');
  }

  const row = message.poll.responses.find((response) => response.memberIndex === mine);
  if (!row) {
    throw badRequest('You joined this group after that poll was posted, so it was never asking you.');
  }

  row.yes = yes;
  row.at = yes === null ? null : new Date();
  await message.save();

  return {
    message: toPublicMessage(message, group, mine),
    total: pollTotal(message),
  };
}

/**
 * Take a line out of the thread. The sender may remove their own; the owner may
 * remove anybody's, because a group the owner can close is a group the owner
 * can tidy; anybody else gets the same 404 as a line that never existed.
 *
 * Removing a card changes no balance, and that is not an oversight: a card was
 * never in the balance board (see the model), so there is nothing to unwind.
 */
export async function deleteMessage(user, groupId, messageId) {
  const group = await loadGroupFor(user, groupId);
  const message = await loadMessage(group, messageId);

  const isOwner = String(group.owner) === String(user._id);
  if (!isOwner && message.senderIndex !== group.memberIndexOf(user._id)) throw notFound();

  await message.deleteOne();
  return true;
}

/* ------------------------------- public shapes ----------------------------- */

/**
 * One line as the thread reads it. `viewerIndex` is the reader's own seat, and
 * it is the only way this function can tell "my message" from somebody else's.
 */
export function toPublicMessage(message, group, viewerIndex) {
  const sender = group.members[message.senderIndex];
  const line = {
    id: message._id.toString(),
    kind: message.kind,
    text: message.text || '',
    createdAt: message.createdAt ? new Date(message.createdAt).toISOString() : null,
    sender: {
      index: message.senderIndex,
      name: sender?.name || '',
      initials: initialsOf(sender?.name || ''),
      user: sender?.user ? sender.user.toString() : null,
    },
    isYou: message.senderIndex === viewerIndex,
  };

  if (message.kind !== 'poll' || !message.poll) return line;

  const yesCount = message.poll.responses.filter((row) => row.yes === true).length;
  const noCount = message.poll.responses.filter((row) => row.yes === false).length;

  return {
    ...line,
    poll: {
      category: message.poll.category,
      location: message.poll.location || '',
      purpose: message.poll.purpose || '',
      date: message.poll.date || '',
      time: message.poll.time || '',
      rate: toNum(message.poll.rate),
      note: message.poll.note || '',
      yesCount,
      noCount,
      pendingCount: message.poll.responses.length - yesCount - noCount,
      total: pollTotal(message),
      responses: message.poll.responses.map((row) => ({
        memberIndex: row.memberIndex,
        name: group.members[row.memberIndex]?.name || '',
        initials: initialsOf(group.members[row.memberIndex]?.name || ''),
        yes: row.yes === undefined ? null : row.yes,
        at: row.at ? new Date(row.at).toISOString() : null,
      })),
    },
  };
}

function chatMember(member, index, isYou) {
  return {
    index,
    name: member.name,
    initials: initialsOf(member.name),
    user: member.user ? member.user.toString() : null,
    // position 0 is the owner by construction — see models/Group.js
    isOwner: index === 0,
    isYou: Boolean(isYou),
  };
}

/* --------------------------------- helpers --------------------------------- */

/** A line of this group's, and only of this group. */
async function loadMessage(group, messageId) {
  if (!mongoose.isValidObjectId(messageId)) throw notFound();
  const message = await GroupMessage.findOne({ _id: messageId, group: group._id });
  if (!message) throw notFound();
  return message;
}

/**
 * What the card costs so far: the rate times the number of yes ticks, counted
 * in whole cents and only turned back into a number at the JSON edge — 350 x 3
 * is 1050.00 by addition of 350 three times, never by multiplying floats. The
 * group has exactly one currency, so there is no rate and no conversion in here.
 */
function pollTotal(message) {
  const rate = toCents(message.poll?.rate);
  const yesCount = message.poll?.responses.filter((row) => row.yes === true).length || 0;
  return centsToNum(rate * yesCount);
}

/**
 * Two letters for an avatar: the first letter of the first word and of the
 * last one ("Aisha Khan" -> AK, "Bilal" -> B), uppercased. It is built from the
 * name already on the member row, so nobody is ever asked to type an avatar,
 * and it is only ever a nickname.
 */
function initialsOf(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const first = Array.from(words[0])[0] || '';
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] || '' : '';
  return (first + last).toUpperCase();
}

/** An optional calendar day, checked as a real date and not just a shape. */
function cardDate(value) {
  if (value === undefined || value === null || value === '') return '';
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(new Date(`${text}T00:00:00.000Z`).getTime())) {
    throw badRequest('Please pick a valid date for the card, like 2026-04-16.');
  }
  return text;
}

/** An optional time of day, in the 24-hour form a phone clock gives. */
function cardTime(value) {
  if (value === undefined || value === null || value === '') return '';
  const text = String(value).trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) {
    throw badRequest('Please give the time as HH:MM, e.g. 16:00.');
  }
  return text;
}

/** An optional short line of the student's own words, length-capped. */
function limited(value, max, message) {
  const text = String(value ?? '').trim();
  if (text.length > max) throw badRequest(message);
  return text;
}

/**
 * Whole cents. The same rule services/groups.js uses for a split, kept local
 * here rather than in utils/money.js so this module owns no money helper it
 * does not also have to explain.
 */
function toCents(value) {
  if (value === null || value === undefined) return 0;
  const raw = typeof value === 'object' && value.$numberDecimal !== undefined ? value.$numberDecimal : value;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Integer cents out to the API edge, rounded to two decimals — never a float
 *  on the way to a total somebody is going to add up. */
function centsToNum(cents) {
  return toNum(toDec(cents / 100));
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function notFound() {
  const err = new Error('Message not found.');
  err.status = 404;
  return err;
}

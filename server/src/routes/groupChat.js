import { Router } from 'express';
import { requireStudent } from '../middleware/auth.js';
import { chatRoom, postMessage, postPoll, respondToPoll, deleteMessage } from '../services/groupChat.js';

/**
 * The group chat (GRP-4), mounted at /api/groups/:id/chat so a chat belongs to
 * the same isolation as the group it lives in.
 *
 * Nothing is decided in this file: the student's id and the group id go down,
 * the room comes back up. Whether the person is a member is not even a question
 * here — services/groupChat.js asks the same loader the rest of the group module
 * uses, so somebody else's chat is a 404 and never an empty page.
 *
 * `mergeParams` is what carries the group's id in from the mount path: a router
 * mounted at /api/groups/:id/chat would otherwise replace `req.params` with its
 * own (`:messageId`) and the group would arrive as undefined. Reading both
 * names in `groupIdOf` below means the mount can say `:id` like the rest of
 * /api/groups, or `:groupId`, without this file having to care.
 */
const router = Router({ mergeParams: true });
router.use(requireStudent);

/** The room: who is in it, and the last hundred messages in reading order. */
router.get('/', async (req, res, next) => {
  try {
    res.json(await chatRoom(req.user, groupIdOf(req)));
  } catch (err) {
    next(err);
  }
});

/** Say something in the thread. */
router.post('/messages', async (req, res, next) => {
  try {
    const message = await postMessage(req.user, groupIdOf(req), req.body);
    res.status(201).json({ message });
  } catch (err) {
    next(err);
  }
});

/** The "+" button: post a card and ask who is in. */
router.post('/polls', async (req, res, next) => {
  try {
    const message = await postPoll(req.user, groupIdOf(req), req.body);
    res.status(201).json({ message });
  } catch (err) {
    next(err);
  }
});

/** Tick yourself in or out. The total comes back with the card. */
router.patch('/polls/:messageId/respond', async (req, res, next) => {
  try {
    const result = await respondToPoll(req.user, groupIdOf(req), req.params.messageId, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** The sender may remove their own line; the owner may remove anybody's. */
router.delete('/messages/:messageId', async (req, res, next) => {
  try {
    await deleteMessage(req.user, groupIdOf(req), req.params.messageId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * The group id, whichever name the mount path used. The rest of /api/groups
 * calls it `:id`, so that is what this router expects; `:groupId` is read too
 * so the mount can say what it likes without the two disagreeing.
 */
function groupIdOf(req) {
  return req.params.id || req.params.groupId;
}

export default router;

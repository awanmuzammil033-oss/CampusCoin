import { Router } from 'express';
import RateLimit from 'express-rate-limit';
import { requireStudent } from '../middleware/auth.js';
import { myReferrals, resolvePublicCode } from '../services/referrals.js';

/**
 * Invite a friend (NEW-10).
 *
 * Two doors, and the difference matters:
 *
 *  - `GET /api/referrals/resolve/:code` is PUBLIC. A person who has been sent
 *    the link opens it with no account, so this is the only read in the feature
 *    a stranger can make — and it answers with a display name and nothing else.
 *    Every other route here is behind a student session, and any code that
 *    belongs to somebody else is a 404, never a 403 and never data.
 *
 * The responses are FACTS. Not one sentence a reader would see is written here:
 * a refused code answers with a machine word and a `messageKey`, and the client
 * turns the key into words in whichever of the fourteen languages it is reading.
 */
const router = Router();

/**
 * A gentle per-address cap on the public resolve. A code is 31^8 and so cannot
 * realistically be guessed, but the endpoint is unauthenticated and answers
 * "does this code exist" by design — a per-address ceiling keeps a script from
 * asking the question a few hundred thousand times. It is generous enough that a
 * whole campus behind one NAT will not notice it, and it is defined here rather
 * than in middleware/rateLimit.js because it belongs to this one route.
 */
const resolveLimiter = RateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  // a machine word and a key, for the same reason the 404 below is: this is read
  // by whoever opens the link, in a language this server does not speak
  message: { error: 'too_many_requests', messageKey: 'ref.invite.tooMany' },
});

/**
 * Who sent you the link — a name, and no more.
 *
 * The 404 body is a machine code plus a translation key. The key is what the
 * page renders; the code is what anybody reading the raw response sees. A
 * stranger's code and a code that was never issued get the same answer, so this
 * cannot be used to ask which codes exist.
 */
router.get('/resolve/:code', resolveLimiter, async (req, res, next) => {
  try {
    const inviter = await resolvePublicCode(req.params.code);
    if (!inviter) {
      return res.status(404).json({ error: 'invite_not_found', messageKey: 'ref.invite.notFound' });
    }
    res.json(inviter);
  } catch (err) {
    next(err);
  }
});

/* ------------------------------ the owner's card ----------------------------- */

router.use(requireStudent);

/**
 * The whole invite screen in one call: the code, the link to share, the share
 * text as a key, who has joined, how many rewards have been earned and whether
 * the cap is full.
 *
 * The code is created here on first read and never changes, and the read also
 * settles any reward that has become due — so the card cannot be a screen that
 * says "4" for an hour after the fifth friend logged their first entry.
 */
router.get('/mine', async (req, res, next) => {
  try {
    res.json(await myReferrals(req.user));
  } catch (err) {
    next(err);
  }
});

export default router;

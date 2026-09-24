import RateLimit from 'express-rate-limit';

/**
 * Brute-force guard. Five wrong attempts on one account from one address
 * buys a 15-minute cool-down for that pair — real people mistype once or
 * twice, scripts try hundreds.
 */
export const loginLimiter = RateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}|${String(req.body?.email || '').toLowerCase()}`,
  message: { error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' },
});

/** Same idea for account creation and reset requests. */
export const accountLimiter = RateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again a little later.' },
});

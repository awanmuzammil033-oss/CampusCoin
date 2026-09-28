import { Router } from 'express';

import { requireStudent } from '../middleware/auth.js';
import { startExport, jobStatus, openDownload, listExports } from '../services/dataExport.js';

/**
 * "Download my data" (NEW-1) - the HTTP layer and nothing else.
 *
 *   POST /api/export                  start a job, answer immediately
 *   GET  /api/export                  this account's recent jobs
 *   GET  /api/export/:id              status, and a fresh one-time link when ready
 *   GET  /api/export/:id/download     the file itself, on a spent token
 *
 * THE ORDER OF THIS FILE IS THE POINT
 * -----------------------------------
 * The download route is registered BEFORE `router.use(requireStudent)`, so it is
 * the only handler here that is public - the browser cannot be made to send a
 * custom header with a plain navigation, and a query string is the only thing a
 * link can carry. Everything else sits behind the guard, so a signed-in person
 * cannot learn that a job exists unless it is theirs, and somebody else's id is
 * a 404 rather than a 403 (a 403 would confirm the job is real).
 *
 * That is exactly why the token is long (256 bits, from crypto), short lived
 * (24 hours) and single use: it is the ONLY thing standing between a pasted
 * URL and somebody else's spending history. It is stored hashed, compared in
 * constant time, and spent atomically - see openDownload() for the argument.
 */
const router = Router();

/* ------------------------------ the download -------------------------------- */

router.get('/:id/download', async (req, res, next) => {
  try {
    const { path, job } = await openDownload(req.params.id, req.query.token);
    res.setHeader('Content-Type', 'application/zip');
    // The whole point of a one-time link: no proxy, no browser cache and no
    // Referer may hold on to a file of somebody's spending.
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${job.fileName || 'campuscoin-data.zip'}"`
    );
    res.sendFile(path, (err) => {
      if (err && !res.headersSent) next(err);
    });
  } catch (err) {
    next(err);
  }
});

/* --------------------------- everything else ------------------------------- */

router.use(requireStudent);

/** Start a job. 202: accepted, and the work has not happened yet. */
router.post('/', async (req, res, next) => {
  try {
    const { job, reused } = await startExport(req.user);
    res.status(202).json({ job, reused });
  } catch (err) {
    next(err);
  }
});

/** This account's own jobs, newest first - the card's list. */
router.get('/', async (req, res, next) => {
  try {
    res.json({ jobs: await listExports(req.user) });
  } catch (err) {
    next(err);
  }
});

/** One job's status; a ready job also comes with a fresh single-use link. */
router.get('/:id', async (req, res, next) => {
  try {
    res.json(await jobStatus(req.user, req.params.id));
  } catch (err) {
    next(err);
  }
});

export default router;

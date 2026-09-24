import { Router } from 'express';
import multer from 'multer';
import { requireStudent } from '../middleware/auth.js';
import {
  templateCsv,
  parseCsv,
  validateRows,
  importRows,
  fileProblem,
  neutralise,
} from '../services/importer.js';

const router = Router();
router.use(requireStudent);

// Memory only: the file never touches the disk (see architecture §7).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024, files: 1 } });

/** Explicit click on the download button — nothing downloads automatically. */
router.get('/template', (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="campuscoin-import-template.csv"');
  res.send(templateCsv());
});

/** Step 1+2: parse, validate, suggest categories, return for preview. */
router.post('/preview', upload.single('file'), async (req, res, next) => {
  try {
    const problem = fileProblem(req.file);
    if (problem) return res.status(400).json({ error: problem });

    const text = req.file.buffer.toString('utf8');
    const parsed = parseCsv(text);
    const { errors, rows } = await validateRows(req.user, parsed);

    res.json({
      total: Math.max(0, parsed.length - 1),
      ready: rows.length,
      problems: errors.length,
      errors: errors.slice(0, 50),
      rows: rows.map((r) => ({
        line: r.line,
        date: neutralise(r.date),
        type: r.type,
        category: neutralise(r.category),
        amount: neutralise(r.amount),
        description: neutralise(r.description),
        categoryId: r.categoryId,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/** Step 3: the person pressed Confirm — write the accepted rows. */
router.post('/confirm', async (req, res, next) => {
  try {
    const imported = await importRows(req.user, req.body.rows);
    res.json({ imported });
  } catch (err) {
    next(err);
  }
});

export default router;

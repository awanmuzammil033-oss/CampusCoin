/** 404 for unknown API paths, then one last-resort handler so a bug
 *  never leaks a stack trace to the browser (Operability, PRD §4). */
export function notFound(req, res) {
  res.status(404).json({ error: 'Page not found.' });
}

export function errorHandler(err, req, res, _next) {
  // Mongoose validation — surface the first field problem in plain words.
  if (err.name === 'ValidationError') {
    const first = Object.values(err.errors)[0];
    return res.status(400).json({ error: first?.message || 'Please check the form fields.' });
  }
  // Duplicate key: our unique indexes (emails, category names, budgets).
  if (err.code === 11000) {
    return res.status(409).json({ error: 'That entry already exists.' });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid id in the request.' });
  }

  // Only genuine server-side faults get the stack trace in the console;
  // expected client problems (400/403/404/409) are part of normal traffic.
  if (!err.status || err.status >= 500) {
    console.error(`[${new Date().toISOString()}]`, err);
  }
  res.status(err.status || 500).json({ error: 'Something went wrong on our side. Please try again.' });
}

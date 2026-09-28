/**
 * One place that talks to the API.
 *  - always sends the session cookie,
 *  - attaches the CSRF token on every state-changing request,
 *  - unwraps JSON and throws a readable Error on failures so screens can
 *    just say "please try again" instead of showing raw statuses.
 */

let csrfToken = null;

/**
 * How to say "the server is not answering" in the reader's language.
 *
 * `api.js` sits above the locale tree, so it cannot call `t()` itself. The locale
 * provider registers a translator here, and the module keeps an English fallback
 * for the moment before it has - so the very first request after a reload cannot
 * show a raw key either.
 */
let translate = null;

export function setApiTranslator(fn) {
  translate = typeof fn === 'function' ? fn : null;
}

const OFFLINE_KEY = 'api.serverNotAnswering';

/**
 * The error every unreachable-server path produces, so that a screen showing
 * `err.message` says something true in every case, and `retryable` is available
 * for the ones that want to offer a button.
 */
function serverNotAnswering(status) {
  const fallback = 'The server is not answering right now. Nothing was lost — try again in a moment.';
  const error = new Error(translate ? translate(OFFLINE_KEY) : fallback);
  error.code = 'server_unreachable';
  error.retryable = true;
  if (status) error.status = status;
  return error;
}

export function setCsrfToken(token) {
  csrfToken = token || null;
}

export function getCsrfToken() {
  return csrfToken;
}

async function request(method, url, body) {
  const options = {
    method,
    credentials: 'include',
    headers: {},
  };

  if (body !== undefined) {
    if (body instanceof FormData) {
      options.body = body; // browser sets the multipart boundary itself
    } else {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
  }
  if (!['GET', 'HEAD'].includes(method) && csrfToken) {
    options.headers['X-CSRF-Token'] = csrfToken;
  }

  let res;
  try {
    res = await fetch(url, options);
  } catch {
    // No proxy in front, offline, or the tab lost the network mid-request. This is
    // not an error the app produced and it must not be reported as one.
    throw serverNotAnswering(0);
  }

  const text = await res.text();
  let data = null;
  let parsed = false;
  try {
    data = text ? JSON.parse(text) : null;
    parsed = data !== null;
  } catch {
    data = null;
  }

  // A 5xx that will not parse as JSON did not come from this app's error handler,
  // which always answers JSON. In development that is the proxy reporting that
  // the backend is not running; saying "Request failed (500)" for it tells the
  // reader nothing they can act on and blames a server that never answered.
  if (!res.ok && res.status >= 500 && !parsed) {
    throw serverNotAnswering(res.status);
  }

  if (!res.ok) {
    // Some endpoints answer with a machine code in `error` (e.g. "in_use")
    // and the human sentence in `message` — show the sentence when there is
    // one, keep the code on the error for screens that branch on it.
    const message = (data && (data.message || data.error)) || `Request failed (${res.status})`;
    const error = new Error(message);
    error.status = res.status;
    if (data && data.error && data.message) error.code = data.error;
    throw error;
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  patch: (url, body) => request('PATCH', url, body),
  put: (url, body) => request('PUT', url, body),
  del: (url, body) => request('DELETE', url, body),
  upload: (url, formData) => request('POST', url, formData),
};

/** Query-string builder that drops empty values. */
export function qs(params) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  });
  const out = search.toString();
  return out ? `?${out}` : '';
}

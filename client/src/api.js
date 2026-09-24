/**
 * One place that talks to the API.
 *  - always sends the session cookie,
 *  - attaches the CSRF token on every state-changing request,
 *  - unwraps JSON and throws a readable Error on failures so screens can
 *    just say "please try again" instead of showing raw statuses.
 */

let csrfToken = null;

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

  const res = await fetch(url, options);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
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

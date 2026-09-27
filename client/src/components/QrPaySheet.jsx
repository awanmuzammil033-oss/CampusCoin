import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import jsQR from 'jsqr';

import Modal from './Modal.jsx';
import FormField from './FormField.jsx';
import Icon from './Icon.jsx';
import { api } from '../api.js';
import { money, getLedgerCurrency } from '../money.js';
import { useLocale } from '../locale.jsx';
import { dayLabel } from '../dates.js';

/**
 * Scan a payment code and pay it (ADV-6).
 *
 * Three screens in one modal, and nothing happens until the person says so:
 *
 *   scan    - the camera looks for a code, and a field takes a pasted one.
 *             Both paths go through exactly the same `POST /api/qr/read`.
 *   confirm - what the code says, and what it costs in the student's own money
 *             with the rate, the day it was good for, and whether that rate was
 *             live or a dated reference. No transaction exists yet.
 *   done    - what was recorded, the new balance, and an honest note about the
 *             category when the merchant's name did not match one.
 *
 * Why the read and the pay are two calls: a person who scans a code and changes
 * their mind has already been told exactly what it would have cost, and the
 * amount the code stated is kept on the entry next to the rate - so the entry
 * can be checked against the receipt months later.
 *
 * WHY THE CAMERA IS WRAPPED IN ONE FUNCTION
 *
 * A camera left running after the sheet closes is a bug a judge will find, so
 * there is exactly one teardown, `stopCamera()`, and it cancels the decode loop
 * AND stops every track. It is called on all five ways out:
 *
 *   1. the sheet is closed (the X, Escape, or the backdrop) - close()
 *   2. the sheet is unmounted - the two effects' cleanups
 *   3. a frame decoded a code - decoded(): the camera has done its job
 *   4. the payment succeeded - pay(): the camera is not wanted any more
 *   5. the stage moved off `scan` - the camera effect's own cleanup
 *
 * It is idempotent, so calling it twice is harmless, and a stream that arrives
 * after the sheet has already closed is stopped on the spot rather than left
 * running (see `wanted` below).
 */

/** The long edge of the frame handed to the decoder. Bigger is slower. */
const MAX_EDGE = 480;

/**
 * How often a frame is decoded, in milliseconds. The loop itself runs on
 * requestAnimationFrame as it should; decoding is the expensive part, and a
 * phone can do this eight times a second without the preview stuttering.
 */
const DECODE_EVERY_MS = 120;

const STAGE_SCAN = 'scan';
const STAGE_CONFIRM = 'confirm';
const STAGE_DONE = 'done';

/** The amount the code itself stated, in the code's own currency - never converted. */
function asScanned(amount, currency) {
  const value = Number(amount);
  const safe = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: String(currency || 'USD'),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
  } catch {
    return `${currency} ${safe.toFixed(2)}`;
  }
}

/** A rate the way the currency drawer writes it: fixed at 4, or 3 significant. */
function rateText(rate) {
  const value = Number(rate);
  if (!Number.isFinite(value)) return '—';
  return value >= 0.01 ? String(Number(value.toFixed(4))) : String(Number(value.toPrecision(3)));
}

/** A label/figure row. Wraps at 360px rather than pushing the sheet sideways. */
const ROW_STYLE = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 8,
  flexWrap: 'wrap',
};

export default function QrPaySheet({ open, onClose, onPaid }) {
  const { t } = useLocale();
  const [stage, setStage] = useState(STAGE_SCAN);
  const [camera, setCamera] = useState('starting'); // starting | live | unsupported | denied | unavailable
  const [attempt, setAttempt] = useState(0);
  const [manual, setManual] = useState('');
  const [code, setCode] = useState('');
  const [scanned, setScanned] = useState(null);
  const [paid, setPaid] = useState(null);
  const [reading, setReading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const [categoryNames, setCategoryNames] = useState(() => new Map());

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(0);
  const wantedRef = useRef(false); // the camera is wanted right now
  const readingRef = useRef(false); // a read is in flight, so ignore frames
  const payingRef = useRef(false); // a pay is in flight: never pay twice
  const decodedRef = useRef(() => {}); // the latest decoded(), so the loop never goes stale

  /*
   * THE teardown. Cancels the loop, stops every track, detaches the stream.
   * It touches refs only, so the copy an effect closed over is as good as the
   * one from the latest render - which is why it is deliberately NOT in any
   * dependency list below. Putting it there would restart the camera on every
   * render, and a camera that restarts on every render is a camera that never
   * gets to see a frame.
   */
  const stopCamera = () => {
    wantedRef.current = false;
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    }
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          /* the track had already ended */
        }
      });
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  /** Read a code - scanned or pasted. The two paths differ only in where the text came from. */
  async function readCode(text) {
    const value = String(text || '').trim();
    if (!value || readingRef.current) return;
    readingRef.current = true;
    setReading(true);
    setError('');
    try {
      const res = await api.post('/api/qr/read', { code: value, currency: getLedgerCurrency() });
      setCode(value);
      setScanned(res);
      setStage(STAGE_CONFIRM);
    } catch (err) {
      // The server's sentence, as it is. A refused pair or a broken code is
      // information, and inventing a friendlier line would hide which one it was.
      setError(err.message);
    } finally {
      readingRef.current = false;
      setReading(false);
    }
  }

  function decoded(text) {
    stopCamera(); // exit 3 - the frame has been read; nothing else is wanted from the lens
    readCode(text);
  }
  decodedRef.current = decoded;

  async function pay() {
    // The ref, not the state: two clicks inside one tick would both read the
    // old `paying`, and a payment recorded twice is worse than a slow button.
    if (payingRef.current || !code) return;
    payingRef.current = true;
    setPaying(true);
    setError('');
    try {
      const res = await api.post('/api/qr/pay', { code, currency: getLedgerCurrency() });
      stopCamera(); // exit 4 - the entry exists, so the camera is stopped here and not on close
      setPaid(res);
      setStage(STAGE_DONE);
      onPaid?.(res.transaction);
    } catch (err) {
      setError(err.message);
    } finally {
      payingRef.current = false;
      setPaying(false);
    }
  }

  function close() {
    stopCamera(); // exit 1 - closing, whichever way it was closed
    onClose?.();
  }

  function scanAnother() {
    // Back to the lens with the last code forgotten. Nothing was paid.
    setCode('');
    setScanned(null);
    setError('');
    setStage(STAGE_SCAN);
  }

  /* A reopened sheet is a blank sheet. */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setStage(STAGE_SCAN);
      setManual('');
      setCode('');
      setScanned(null);
      setPaid(null);
      setReading(false);
      setPaying(false);
      setError('');
      setCamera('starting');
      /* the names behind the category ids, for the receipt screen. Missing
         names are not fatal - the id is still what was written. */
      let alive = true;
      api
        .get('/api/categories')
        .then((res) => {
          if (!alive) return;
          const map = new Map();
          [...(res?.income || []), ...(res?.expense || [])].forEach((row) => {
            if (row?.id) map.set(row.id, row.name);
          });
          setCategoryNames(map);
        })
        .catch(() => {
          /* the sheet works without the names */
        });
    }
    wasOpen.current = open;
  }, [open]);

  /*
   * The camera's lifetime IS this effect's lifetime. It runs while the sheet is
   * open AND the stage is `scan`, so moving to the confirm or the receipt tears
   * the camera down (exit 5) exactly like closing does. `attempt` is the retry
   * button: a permission the student has just allowed in the address bar can be
   * asked for again.
   */
  useEffect(() => {
    if (!open) return undefined;
    if (stage !== STAGE_SCAN) {
      stopCamera();
      return undefined;
    }

    let disposed = false;
    wantedRef.current = true;
    setCamera('starting');

    // the frame buffer is never in the document
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    let last = 0;

    function tick(now) {
      frameRef.current = 0; // the frame we were asked for is the one we are in
      if (!wantedRef.current) return;
      if (now - last < DECODE_EVERY_MS || readingRef.current) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }
      last = now;
      const video = videoRef.current;
      if (!context || !video || video.readyState < 2 || !video.videoWidth) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }
      const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const shot = context.getImageData(0, 0, canvas.width, canvas.height);
      const found = jsQR(shot.data, shot.width, shot.height, { inversionAttempts: 'attemptBoth' });
      if (found?.data) {
        decodedRef.current(found.data); // stops the camera itself
        return; // and the loop ends here: there is nothing left to look for
      }
      frameRef.current = requestAnimationFrame(tick);
    }

    async function openCamera() {
      const media = typeof navigator === 'undefined' ? null : navigator.mediaDevices;
      if (!media || typeof media.getUserMedia !== 'function') {
        setCamera('unsupported');
        return;
      }
      try {
        const stream = await media.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        // The sheet can be closed while the permission prompt is still up. A
        // stream that arrives after that must not be left running.
        if (disposed || !wantedRef.current) {
          stream.getTracks().forEach((track) => {
            try {
              track.stop();
            } catch {
              /* already ended */
            }
          });
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.muted = true; // some browsers only honour the property
          video.srcObject = stream;
          try {
            await video.play();
          } catch {
            /* the preview can start on its own; the decoder needs no playback */
          }
        }
        if (disposed || !wantedRef.current) {
          stopCamera();
          return;
        }
        setCamera('live');
        frameRef.current = requestAnimationFrame(tick);
      } catch (err) {
        if (disposed) return;
        const name = err?.name || '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
          setCamera('denied');
        } else {
          // NotFoundError (no camera), NotReadableError (in use elsewhere),
          // OverconstrainedError, or anything this browser invents later.
          setCamera('unavailable');
        }
      }
    }

    openCamera();

    return () => {
      disposed = true;
      stopCamera(); // exit 2 - unmount, and the stage change that closed the lens
    };
  }, [open, stage, attempt]);

  /* The backstop: whichever way the sheet leaves the tree, the same teardown. */
  useEffect(() => () => stopCamera(), []);

  /*
   * Every hook has run by here, so a sheet that is not open renders nothing.
   * The camera effect above has already returned without starting anything at
   * this point, so there is nothing to switch off on the way out.
   */
  if (!open) return null;

  const quote = scanned?.quote || paid?.quote || null;
  const converted = Boolean(quote?.converted);
  const payable = quote ? money(quote.amount) : '';
  const categoryName = paid
    ? paid.category?.id
      ? categoryNames.get(paid.category.id) || '—'
      : t('qr.noCategory')
    : '';

  /* ------------------------------- the footer ------------------------------ */
  let footer = null;
  if (stage === STAGE_SCAN) {
    footer = (
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => readCode(manual)}
        disabled={reading || !manual.trim()}
      >
        {reading ? <span className="spinner" /> : <Icon name="search" size={16} />} {reading ? t('qr.reading') : t('qr.read')}
      </button>
    );
  } else if (stage === STAGE_CONFIRM) {
    footer = (
      <>
        <button type="button" className="btn btn-ghost" onClick={scanAnother} disabled={paying}>
          {t('ui.cancel')}
        </button>
        <button type="button" className="btn btn-primary" onClick={pay} disabled={paying}>
          {paying ? <span className="spinner" /> : <Icon name="checkCircle" size={16} />} {paying ? t('qr.paying') : t('qr.pay', { amount: payable })}
        </button>
      </>
    );
  } else {
    footer = (
      <button type="button" className="btn btn-primary" onClick={close}>
        {t('qr.close')}
      </button>
    );
  }

  return (
    <Modal title={t('qr.title')} onClose={close} footer={footer}>
      {error && (
        <p className="field-error mb-3" role="alert">
          <Icon name="warning" size={16} />
          <span>{error}</span>
        </p>
      )}

      {/* --------------------------------- scan -------------------------------- */}
      {stage === STAGE_SCAN && (
        <>
          <div
            className="cc-qr-video"
            aria-hidden="true"
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '4 / 3',
              borderRadius: 'var(--cc-radius)',
              overflow: 'hidden',
              background: 'var(--cc-surface-2)',
              border: '1px solid var(--cc-border)',
              marginBottom: 10,
            }}
          >
            <video
              ref={videoRef}
              className="cc-qr-stream"
              playsInline
              muted
              autoPlay
              style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {camera === 'live' && (
              <span
                className="cc-qr-frame"
                style={{
                  position: 'absolute',
                  inset: '20% 24%',
                  border: '2px dashed var(--cc-primary)',
                  borderRadius: 'var(--cc-radius)',
                  opacity: 0.9,
                }}
              />
            )}
          </div>

          {camera === 'live' && (
            <p className="smallish muted mb-3">
              <Icon name="search" size={14} /> {t('qr.cameraHint')}
            </p>
          )}

          {camera === 'starting' && (
            <p className="smallish muted mb-3" role="status">
              <span className="spinner" /> {t('qr.cameraStarting')}
            </p>
          )}

          {(camera === 'unsupported' || camera === 'denied' || camera === 'unavailable') && (
            <div className="cc-qr-nocamera mb-3">
              <p className="smallish mb-2">
                <Icon name="warning" size={15} />{' '}
                {camera === 'unsupported'
                  ? t('qr.cameraUnsupported')
                  : camera === 'denied'
                    ? t('qr.cameraDenied')
                    : t('qr.cameraUnavailable')}
              </p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAttempt((n) => n + 1)}>
                <Icon name="repeat" size={15} /> {t('qr.cameraTryAgain')}
              </button>
            </div>
          )}

          <FormField label={t('qr.code')} htmlFor="qr-manual" help={t('qr.codeHelp')}>
            {(aria) => (
              <textarea
                id="qr-manual"
                className="input"
                rows={2}
                spellCheck={false}
                autoComplete="off"
                value={manual}
                onChange={(event) => setManual(event.target.value)}
                {...aria}
              />
            )}
          </FormField>
        </>
      )}

      {/* -------------------------------- confirm ------------------------------- */}
      {stage === STAGE_CONFIRM && scanned?.code && (
        <>
          <p className="cc-qr-readTitle mb-1" style={{ fontWeight: 700 }}>
            {t('qr.confirmTitle')}
          </p>
          <p className="cc-qr-merchant mb-3" style={{ fontSize: '1.125rem' }}>
            {scanned.code.merchant}
          </p>

          <dl className="cc-qr-rows mb-3" style={{ margin: 0, display: 'grid', gap: 8 }}>
            {converted ? (
              <>
                <div className="cc-qr-row" style={ROW_STYLE}>
                  <dt className="smallish muted">{t('qr.asScanned')}</dt>
                  <dd className="num mb-0" style={{ minWidth: 0 }}>
                    {asScanned(scanned.code.amount, scanned.code.currency)}
                  </dd>
                </div>
                <div className="cc-qr-row cc-qr-row-strong" style={ROW_STYLE}>
                  <dt className="smallish muted">{t('qr.yourMoney')}</dt>
                  <dd className="num mb-0" style={{ minWidth: 0, fontSize: '1.25rem' }}>
                    {payable}
                  </dd>
                </div>
              </>
            ) : (
              <div className="cc-qr-row cc-qr-row-strong" style={ROW_STYLE}>
                <dt className="smallish muted">{t('ui.amount')}</dt>
                <dd className="num mb-0" style={{ minWidth: 0, fontSize: '1.25rem' }}>
                  {payable}
                </dd>
              </div>
            )}

            {scanned.code.note && (
              <div className="cc-qr-row" style={ROW_STYLE}>
                <dt className="smallish muted">{t('ui.note')}</dt>
                <dd className="mb-0" style={{ minWidth: 0 }}>
                  {scanned.code.note}
                </dd>
              </div>
            )}

            {scanned.code.reference && (
              <div className="cc-qr-row" style={ROW_STYLE}>
                <dt className="smallish muted">{t('qr.reference')}</dt>
                <dd className="num mb-0" style={{ minWidth: 0, wordBreak: 'break-word' }}>
                  {scanned.code.reference}
                </dd>
              </div>
            )}
          </dl>

          {converted && (
            <div className="cc-qr-quote mb-3" style={{ display: 'grid', gap: 3, padding: 12, borderRadius: 'var(--cc-radius)', background: 'var(--cc-primary-soft)' }}>
              <p className="smallish num mb-0">
                {t('conv.rateLine', { from: quote.from, rate: rateText(quote.rate), to: quote.to })}
              </p>
              {/* asOf is always sent with a converted quote, and dayLabel()
                  reads it as a plain calendar day so it can never slip a day.
                  If a future shape ever arrives without one, the line is left
                  out rather than printed with a date nobody has. */}
              {quote.asOf && (
                <p className="smallish muted mb-0">
                  {quote.source === 'reference'
                    ? t('qr.rateReference', { when: dayLabel(quote.asOf) })
                    : t('qr.rateLive', { when: dayLabel(quote.asOf) })}
                </p>
              )}
            </div>
          )}

          <p className="smallish muted mb-0">
            <Icon name="shield" size={14} /> {t('qr.nothingPaid')}
          </p>
        </>
      )}

      {/* --------------------------------- done --------------------------------- */}
      {stage === STAGE_DONE && paid && (
        <>
          <p className="cc-qr-doneTitle mb-3" style={{ fontWeight: 700, color: 'var(--cc-income)' }}>
            <Icon name="checkCircle" size={17} /> {t('qr.recordedTitle')}
          </p>

          <dl className="cc-qr-rows mb-3" style={{ margin: 0, display: 'grid', gap: 8 }}>
            <div className="cc-qr-row" style={ROW_STYLE}>
              <dt className="smallish muted">{t('qr.merchant')}</dt>
              <dd className="mb-0" style={{ minWidth: 0 }}>
                {paid.scan?.merchant || paid.transaction?.description}
              </dd>
            </div>
            <div className="cc-qr-row" style={ROW_STYLE}>
              <dt className="smallish muted">{t('ui.amount')}</dt>
              <dd className="num mb-0" style={{ minWidth: 0 }}>
                {money(paid.transaction?.amount ?? paid.quote?.amount)}
              </dd>
            </div>
            <div className="cc-qr-row" style={ROW_STYLE}>
              <dt className="smallish muted">{t('ui.category')}</dt>
              <dd className="mb-0" style={{ minWidth: 0 }}>
                {categoryName}
              </dd>
            </div>
            <div className="cc-qr-row" style={ROW_STYLE}>
              <dt className="smallish muted">{t('qr.balanceNow')}</dt>
              <dd className="num mb-0" style={{ minWidth: 0 }}>
                {paid.balance == null ? '—' : money(paid.balance)}
              </dd>
            </div>
          </dl>

          {paid.scan?.originalAmount != null && (
            <p className="smallish muted mb-2">
              <Icon name="shield" size={14} />{' '}
              {t('qr.kept', {
                amount: Number(paid.scan.originalAmount).toFixed(2),
                currency: paid.scan.originalCurrency,
              })}
            </p>
          )}

          {paid.belowZero && (
            <p className="cc-qr-below smallish mb-2" style={{ display: 'flex', gap: 6, alignItems: 'flex-start', color: 'var(--cc-danger)' }}>
              <Icon name="warning" size={15} /> <span>{t('qr.belowZero')}</span>
            </p>
          )}

          {paid.category?.fallback && (
            <p className="cc-qr-fallback smallish mb-2">
              <Icon name="info" size={14} /> {t('qr.categoryChosen')}
            </p>
          )}

          {paid.transaction?.id && (
            <Link className="btn btn-ghost btn-sm" to={`/transactions/${paid.transaction.id}/edit`} onClick={close}>
              <Icon name="pencil" size={15} /> {t('qr.editEntry')}
            </Link>
          )}
        </>
      )}
    </Modal>
  );
}

/**
 * The button that opens the sheet, for a caller that does not want to own the
 * open state. It is a real button with a real label, and it carries its own
 * state so a screen only has to place one thing.
 */
export function QrPayButton({ onPaid, className = 'btn btn-primary' }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <Icon name="phone" size={16} /> {t('qr.open')}
      </button>
      {open && <QrPaySheet open onClose={() => setOpen(false)} onPaid={onPaid} />}
    </>
  );
}

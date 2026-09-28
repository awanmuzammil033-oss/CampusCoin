import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import jsQR from 'jsqr';
import {
  MultiFormatReader,
  BinaryBitmap,
  HybridBinarizer,
  RGBLuminanceSource,
  DecodeHintType,
  BarcodeFormat,
} from '@zxing/library';

import Modal from './Modal.jsx';
import FormField from './FormField.jsx';
import Icon from './Icon.jsx';
import { api } from '../api.js';
import { money, moneyInLedger, getDisplayCurrency, getLedgerCurrency } from '../money.js';
import { useLocale } from '../locale.jsx';
import { dayLabel } from '../dates.js';

/**
 * Scan a payment code and pay it (ADV-6).
 *
 * Supported formats:
 * - 2D QR Codes (via ultra-fast jsQR + ZXing fallback)
 * - 1D Barcodes: EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39, ITF, Data Matrix (via ZXing with hints)
 * - Image file / Photo upload scanning (fallback for browsers blocking camera or pre-taken photos)
 * - Front / Back camera switching
 * - Direct manual input & paste
 */

const DECODE_EVERY_MS = 100;

const STAGE_SCAN    = 'scan';
const STAGE_FILL    = 'fill';   // barcode/plain ref scanned - fill in the payment details
const STAGE_CONFIRM = 'confirm';
const STAGE_DONE    = 'done';

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

function rateText(rate) {
  const value = Number(rate);
  if (!Number.isFinite(value)) return '—';
  return value >= 0.01 ? String(Number(value.toFixed(4))) : String(Number(value.toPrecision(3)));
}

const ROW_STYLE = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 8,
  flexWrap: 'wrap',
};

function isNotPaymentCode(message) {
  return /does not look like a payment code/i.test(String(message || ''));
}

export default function QrPaySheet({ open, onClose, onPaid }) {
  const { t } = useLocale();
  const [stage, setStage] = useState(STAGE_SCAN);
  const [camera, setCamera] = useState('starting'); // starting | live | unsupported | denied | unavailable
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' | 'user'
  const [attempt, setAttempt] = useState(0);
  const [manual, setManual] = useState('');
  const [code, setCode] = useState('');
  const [scanned, setScanned] = useState(null);
  const [paid, setPaid] = useState(null);
  const [reading, setReading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const [fileScanning, setFileScanning] = useState(false);
  const [categoryNames, setCategoryNames] = useState(() => new Map());

  // STAGE_FILL state
  const [fillRef, setFillRef] = useState('');
  const [fillMerchant, setFillMerchant] = useState('');
  const [fillAmount, setFillAmount] = useState('');
  const [fillNote, setFillNote] = useState('');

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(0);
  const wantedRef = useRef(false);
  const readingRef = useRef(false);
  const payingRef = useRef(false);
  const decodedRef = useRef(() => {});
  const zxingRef = useRef(null);
  const fileInputRef = useRef(null);

  // Stop camera tracks and cancel RAF loop
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
          // already stopped
        }
      });
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  /**
   * Helper to scan any canvas/imageData using jsQR first, then ZXing MultiFormatReader
   */
  const scanImageData = (imageData, width, height) => {
    // 1. Try jsQR first (ultra-fast for QR codes)
    try {
      const qrResult = jsQR(imageData.data, width, height, { inversionAttempts: 'attemptBoth' });
      if (qrResult && qrResult.data && qrResult.data.trim()) {
        return qrResult.data.trim();
      }
    } catch {
      // ignore
    }

    // 2. Try ZXing MultiFormatReader for 1D Barcodes + other formats
    try {
      if (!zxingRef.current) {
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.QR_CODE,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.ITF,
          BarcodeFormat.DATA_MATRIX,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new MultiFormatReader();
        reader.setHints(hints);
        zxingRef.current = reader;
      }

      const lum = new RGBLuminanceSource(imageData.data, width, height);
      const bitmap = new BinaryBitmap(new HybridBinarizer(lum));
      const zxResult = zxingRef.current.decode(bitmap);
      if (zxResult && zxResult.getText()) {
        return zxResult.getText().trim();
      }
    } catch {
      // NotFoundException or no code found in this frame
    }

    return null;
  };

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
      if (isNotPaymentCode(err.message)) {
        setFillRef(value.slice(0, 80));
        setFillMerchant('');
        setFillAmount('');
        setFillNote('');
        setStage(STAGE_FILL);
      } else {
        setError(err.message);
      }
    } finally {
      readingRef.current = false;
      setReading(false);
    }
  }

  async function confirmFill() {
    const merchant = fillMerchant.trim();
    const amount   = fillAmount.trim();
    const currency = getLedgerCurrency();
    if (!merchant || !amount) return;
    const jsonCode = JSON.stringify({
      merchant,
      amount,
      currency,
      note: fillNote.trim() || undefined,
      ref: fillRef || undefined,
    });
    await readCode(jsonCode);
  }

  function decoded(text) {
    stopCamera();
    readCode(text);
  }
  decodedRef.current = decoded;

  // Handle uploaded image scanning
  async function handleImageUpload(e) {
    const file = e.target?.files?.[0];
    if (!file) return;
    setFileScanning(true);
    setError('');

    try {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 1200;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            const scale = Math.min(maxDim / w, maxDim / h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, w, h);
          const imgData = ctx.getImageData(0, 0, w, h);
          const found = scanImageData(imgData, w, h);
          setFileScanning(false);

          if (found) {
            decoded(found);
          } else {
            setError(t('qr.imageNotFound') || 'No QR code or barcode found in this image. Please try a clearer picture.');
          }
        };
        img.onerror = () => {
          setFileScanning(false);
          setError('Failed to load image file.');
        };
        img.src = reader.result;
      };
      reader.onerror = () => {
        setFileScanning(false);
        setError('Failed to read image file.');
      };
      reader.readAsDataURL(file);
    } catch {
      setFileScanning(false);
      setError('Error processing image file.');
    } finally {
      if (e.target) e.target.value = '';
    }
  }

  async function pay() {
    if (payingRef.current || !code) return;
    payingRef.current = true;
    setPaying(true);
    setError('');
    try {
      const res = await api.post('/api/qr/pay', { code, currency: getLedgerCurrency() });
      stopCamera();
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
    stopCamera();
    onClose?.();
  }

  function scanAnother() {
    setCode('');
    setScanned(null);
    setError('');
    setStage(STAGE_SCAN);
  }

  // Initialize ZXing hints once
  useEffect(() => {
    try {
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.QR_CODE,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.ITF,
        BarcodeFormat.DATA_MATRIX,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      const r = new MultiFormatReader();
      r.setHints(hints);
      zxingRef.current = r;
    } catch {
      // fallback
    }
  }, []);

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
      setFillRef('');
      setFillMerchant('');
      setFillAmount('');
      setFillNote('');
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
        .catch(() => {});
      return () => { alive = false; };
    }
    wasOpen.current = open;
  }, [open]);

  // Camera stream & live frame decoding loop
  useEffect(() => {
    if (!open) return undefined;
    if (stage !== STAGE_SCAN) {
      stopCamera();
      return undefined;
    }

    let disposed = false;
    wantedRef.current = true;
    setCamera('starting');

    const canvas  = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    let last = 0;

    function tick(now) {
      frameRef.current = 0;
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

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      // Cap processing canvas size to max 800px for speed & low CPU
      const scale = Math.min(1, 800 / Math.max(vw, vh));
      const cw = Math.max(1, Math.floor(vw * scale));
      const ch = Math.max(1, Math.floor(vh * scale));
      canvas.width  = cw;
      canvas.height = ch;
      context.drawImage(video, 0, 0, cw, ch);

      try {
        const imageData = context.getImageData(0, 0, cw, ch);
        const codeFound = scanImageData(imageData, cw, ch);
        if (codeFound) {
          decodedRef.current(codeFound);
          return;
        }
      } catch {
        // continue loop
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
        const constraints = {
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        };

        let stream;
        try {
          stream = await media.getUserMedia(constraints);
        } catch {
          // fallback without facingMode constraints if specific camera fails
          stream = await media.getUserMedia({ video: true, audio: false });
        }

        if (disposed || !wantedRef.current) {
          stream.getTracks().forEach((track) => {
            try { track.stop(); } catch { /* already ended */ }
          });
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.muted = true;
          video.playsInline = true;
          video.srcObject = stream;
          try { await video.play(); } catch { /* ignore */ }
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
          setCamera('unavailable');
        }
      }
    }

    openCamera();

    return () => {
      disposed = true;
      stopCamera();
    };
  }, [open, stage, attempt, facingMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => stopCamera(), []);

  if (!open) return null;

  const quote     = scanned?.quote || paid?.quote || null;
  const converted = Boolean(quote?.converted);
  const payable   = quote ? moneyInLedger(quote.amount) : '';
  const inDisplay = quote && getDisplayCurrency() !== quote.to ? money(quote.amount) : '';
  const categoryName = paid
    ? paid.category?.id
      ? categoryNames.get(paid.category.id) || '—'
      : t('qr.noCategory')
    : '';

  const fillAmountOk = /^\d+([.,]\d{1,2})?$/.test(fillAmount.trim().replace(',', '.'));
  const fillReady    = fillMerchant.trim().length > 0 && fillAmountOk;

  /* ------------------------------- footer ------------------------------ */
  let footer = null;
  if (stage === STAGE_SCAN) {
    footer = (
      <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={reading || fileScanning}
        >
          {fileScanning ? <span className="spinner" /> : <Icon name="camera" size={15} />}
          <span>{t('qr.uploadImage') || 'Scan Image / File'}</span>
        </button>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => readCode(manual)}
          disabled={reading || !manual.trim()}
        >
          {reading ? <span className="spinner" /> : <Icon name="search" size={16} />}{' '}
          {reading ? t('qr.reading') : t('qr.read')}
        </button>
      </div>
    );
  } else if (stage === STAGE_FILL) {
    footer = (
      <>
        <button type="button" className="btn btn-ghost" onClick={scanAnother} disabled={reading}>
          {t('ui.cancel')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={confirmFill}
          disabled={reading || !fillReady}
        >
          {reading ? <span className="spinner" /> : <Icon name="checkCircle" size={16} />}{' '}
          {reading ? t('qr.reading') : t('qr.read')}
        </button>
      </>
    );
  } else if (stage === STAGE_CONFIRM) {
    footer = (
      <>
        <button type="button" className="btn btn-ghost" onClick={scanAnother} disabled={paying}>
          {t('ui.cancel')}
        </button>
        <button type="button" className="btn btn-primary" onClick={pay} disabled={paying}>
          {paying ? <span className="spinner" /> : <Icon name="checkCircle" size={16} />}{' '}
          {paying ? t('qr.paying') : t('qr.pay', { amount: payable })}
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
      {/* Hidden file input for scanning from photos/files */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleImageUpload}
      />

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
              background: '#04100d',
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

            {/* Target Reticle & Laser Beam */}
            {camera === 'live' && (
              <>
                <div
                  className="cc-qr-frame"
                  style={{
                    position: 'absolute',
                    inset: '16% 14%',
                    border: '2px solid rgba(16, 185, 129, 0.75)',
                    borderRadius: 14,
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.4)',
                    pointerEvents: 'none',
                  }}
                >
                  {/* Laser line moving across */}
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      height: 2,
                      background: 'linear-gradient(90deg, transparent, #10b981, #34d399, transparent)',
                      boxShadow: '0 0 8px #10b981, 0 0 16px #34d399',
                      animation: 'scanLaser 2s ease-in-out infinite alternate',
                    }}
                  />
                  {/* Corner accents */}
                  <span style={{ position: 'absolute', top: -2, left: -2, width: 14, height: 14, borderTop: '3px solid #10b981', borderLeft: '3px solid #10b981', borderTopLeftRadius: 6 }} />
                  <span style={{ position: 'absolute', top: -2, right: -2, width: 14, height: 14, borderTop: '3px solid #10b981', borderRight: '3px solid #10b981', borderTopRightRadius: 6 }} />
                  <span style={{ position: 'absolute', bottom: -2, left: -2, width: 14, height: 14, borderBottom: '3px solid #10b981', borderLeft: '3px solid #10b981', borderBottomLeftRadius: 6 }} />
                  <span style={{ position: 'absolute', bottom: -2, right: -2, width: 14, height: 14, borderBottom: '3px solid #10b981', borderRight: '3px solid #10b981', borderBottomRightRadius: 6 }} />
                </div>

                {/* Flip camera button */}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setFacingMode((m) => m === 'environment' ? 'user' : 'environment')}
                  title="Switch Camera (Front/Back)"
                  style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    background: 'rgba(0,0,0,0.6)',
                    color: '#fff',
                    borderRadius: '50%',
                    width: 38,
                    height: 38,
                    padding: 0,
                    zIndex: 5,
                  }}
                >
                  <Icon name="repeat" size={16} />
                </button>
              </>
            )}
          </div>

          <style>{`
            @keyframes scanLaser {
              0% { top: 6%; opacity: 0.9; }
              100% { top: 92%; opacity: 0.9; }
            }
          `}</style>

          {camera === 'live' && (
            <div className="d-flex justify-content-between align-items-center mb-3">
              <p className="smallish muted mb-0">
                <Icon name="search" size={14} /> {t('qr.cameraHint')}
              </p>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => fileInputRef.current?.click()}
                style={{ fontSize: '0.8125rem' }}
              >
                <Icon name="camera" size={14} /> {t('qr.uploadImage') || 'Scan Image / File'}
              </button>
            </div>
          )}

          {camera === 'starting' && (
            <p className="smallish muted mb-3" role="status">
              <span className="spinner" /> {t('qr.cameraStarting')}
            </p>
          )}

          {(camera === 'unsupported' || camera === 'denied' || camera === 'unavailable') && (
            <div className="cc-qr-nocamera mb-3" style={{ padding: 12, borderRadius: 'var(--cc-radius)', background: 'var(--cc-surface-2)', border: '1px solid var(--cc-border)' }}>
              <p className="smallish mb-2">
                <Icon name="warning" size={15} />{' '}
                {camera === 'unsupported'
                  ? t('qr.cameraUnsupported')
                  : camera === 'denied'
                    ? t('qr.cameraDenied')
                    : t('qr.cameraUnavailable')}
              </p>
              <div className="d-flex gap-2 flex-wrap">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAttempt((n) => n + 1)}>
                  <Icon name="repeat" size={15} /> {t('qr.cameraTryAgain')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Icon name="camera" size={15} /> {t('qr.uploadImage') || 'Select / Take Photo'}
                </button>
              </div>
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
                placeholder="campuscoin://pay?... or barcode numbers"
                value={manual}
                onChange={(event) => setManual(event.target.value)}
                {...aria}
              />
            )}
          </FormField>
        </>
      )}

      {/* ---------------------------------- fill --------------------------------- */}
      {stage === STAGE_FILL && (
        <>
          <p className="smallish mb-3" style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <Icon name="info" size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{t('qr.barcodeHint')}</span>
          </p>

          {fillRef && (
            <div
              className="mb-3 smallish muted"
              style={{
                padding: '6px 10px',
                borderRadius: 'var(--cc-radius)',
                background: 'var(--cc-surface-2)',
                border: '1px solid var(--cc-border)',
                wordBreak: 'break-all',
              }}
            >
              <span style={{ opacity: 0.7 }}>{t('qr.reference')}: </span>
              <span className="num">{fillRef}</span>
            </div>
          )}

          <FormField label={t('qr.fillMerchant')} htmlFor="qr-fill-merchant">
            {(aria) => (
              <input
                id="qr-fill-merchant"
                type="text"
                className="input"
                autoComplete="off"
                value={fillMerchant}
                onChange={(e) => setFillMerchant(e.target.value)}
                {...aria}
              />
            )}
          </FormField>

          <FormField label={t('ui.amount')} htmlFor="qr-fill-amount">
            {(aria) => (
              <input
                id="qr-fill-amount"
                type="text"
                inputMode="decimal"
                className="input"
                autoComplete="off"
                placeholder={`0.00 ${getLedgerCurrency()}`}
                value={fillAmount}
                onChange={(e) => setFillAmount(e.target.value)}
                {...aria}
              />
            )}
          </FormField>

          <FormField label={t('ui.note')} htmlFor="qr-fill-note">
            {(aria) => (
              <input
                id="qr-fill-note"
                type="text"
                className="input"
                autoComplete="off"
                value={fillNote}
                onChange={(e) => setFillNote(e.target.value)}
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

            {inDisplay && (
              <div className="cc-qr-row" style={ROW_STYLE}>
                <dt className="smallish muted">{t('qr.inDisplay')}</dt>
                <dd className="num mb-0" style={{ minWidth: 0 }}>
                  {inDisplay}
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
                {moneyInLedger(paid.transaction?.amount ?? paid.quote?.amount)}
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

export function QrPayFab({ onPaid, className = 'fab-scan' }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} aria-label={t('qr.open')}>
        <Icon name="scan" />
      </button>
      {open && <QrPaySheet open onClose={() => setOpen(false)} onPaid={onPaid} />}
    </>
  );
}

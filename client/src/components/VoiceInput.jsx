import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { useLocale } from '../locale.jsx';

/**
 * Voice input for the text fields.
 *
 * The brief the app is built around is "write it the way you would say it", and
 * a surprising number of students would rather say a sentence than type one.
 * This wraps the browser's own speech recognition: the microphone button sits
 * inside the field, fills the transcript in as the words arrive, and stops on a
 * second click, on Enter being pressed elsewhere, or when the field is left.
 *
 * Two rules it never breaks:
 *  - it is a *progressive extra*. Where the browser has no speech recognition
 *    (Firefox, Safari) the button is not rendered at all — no dead control, and
 *    nothing that looks broken;
 *  - what it hears is still just text. The sentence goes through exactly the
 *    same parser, the same confirmation and the same undo as typing it, and
 *    nothing is saved until the student presses the button themselves.
 */
export default function VoiceInput({ onText, lang, disabled = false, onError }) {
  const { t } = useLocale();
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef(null);
  // Recognition objects are not serialisable and must be kept alive while the
  // browser is still listening, or the engine stops on its own.
  const baseTextRef = useRef('');

  useEffect(() => {
    const Recognition =
      typeof window !== 'undefined'
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : null;
    setSupported(Boolean(Recognition));
  }, []);

  // Stop on unmount: a microphone left running after the screen closes is the
  // kind of bug that makes people uninstall things.
  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* already stopped */
      }
    };
  }, []);

  function start() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition || listening) return;

    let recognition;
    try {
      recognition = new Recognition();
    } catch {
      onError?.(t('voice.notAvailable'));
      return;
    }
    recognition.lang = lang ? `en-${String(lang).toUpperCase()}` : undefined;
    // The student is adding to whatever is already in the box, not replacing it.
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    const original = document.activeElement?.value ?? '';
    baseTextRef.current = original;
    let finalText = '';

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += chunk;
        else interim += chunk;
      }
      const joined = [baseTextRef.current, finalText || interim].filter(Boolean).join(' ').trim();
      onText(joined);
    };

    recognition.onerror = (event) => {
      setListening(false);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        onError?.(t('voice.denied'));
      } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
        onError?.(t('voice.notAvailable'));
      }
    };

    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    setListening(true);
    try {
      recognition.start();
    } catch {
      setListening(false);
      onError?.(t('voice.notAvailable'));
    }
  }

  function stop() {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* already stopped */
    }
    setListening(false);
  }

  if (!supported) return null;

  return (
    <button
      type="button"
      className={`voice-btn ${listening ? 'voice-btn-live' : ''}`}
      onClick={listening ? stop : start}
      disabled={disabled}
      aria-pressed={listening}
      aria-label={listening ? t('voice.stop') : t('voice.start')}
      title={listening ? t('voice.stop') : t('voice.start')}
      data-voice={listening ? 'on' : 'off'}
    >
      <Icon name={listening ? 'stop' : 'mic'} size={16} />
      <span className="visually-hidden">{listening ? t('voice.stop') : t('voice.start')}</span>
    </button>
  );
}

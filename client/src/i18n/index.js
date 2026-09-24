/**
 * Dictionary map for t(). Keys missing from a language fall back to English
 * one key at a time (see locale.jsx), so languages may grow into their
 * translations gradually without breaking the interface.
 */
import en from './en.js';
import ur from './ur.js';
import ar from './ar.js';
import hi from './hi.js';
import es from './es.js';
import fr from './fr.js';
import de from './de.js';
import tr from './tr.js';
import pt from './pt.js';
import id from './id.js';
import ru from './ru.js';
import zh from './zh.js';
import ja from './ja.js';
import fa from './fa.js';

export default { en, ur, ar, hi, es, fr, de, tr, pt, id, ru, zh, ja, fa };

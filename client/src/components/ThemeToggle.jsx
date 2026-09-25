import { useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { useLocale } from '../locale.jsx';
import Icon from './Icon.jsx';

/**
 * The one theme switch for every piece of chrome: student topbar, admin
 * topbar and the public header. Sign-in cards deliberately have no toggle —
 * the theme lives on the landing navbar and the dashboard only, so the whole
 * site is flavoured from one place.
 *
 * Persistence rules (UX / theme):
 *  - Default is light — index.html only stores a theme once somebody picks.
 *  - Signed-in: the choice is written to the account, so it survives a
 *    refresh AND a new device.
 *  - Signed out: localStorage, which is exactly what the boot script reads,
 *    so a dark page stays dark on refresh; going back to light is a manual
 *    toggle, never an ambush.
 *
 * The icon follows the <html> attribute via MutationObserver instead of
 * local state, because the Profile chips and the account sync change the
 * theme from elsewhere — the button must never show a stale icon.
 */
export default function ThemeToggle({ className = 'icon-btn', labels }) {
  const { user, updatePreferences } = useAuth() || {};
  const { t } = useLocale();
  const [dark, setDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark');

  useEffect(() => {
    const obs = new MutationObserver(() => {
      setDark(document.documentElement.getAttribute('data-theme') === 'dark');
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  async function toggle() {
    const next = dark ? 'light' : 'dark';
    if (user && updatePreferences) {
      try {
        await updatePreferences({ theme: next });
        return;
      } catch {
        /* offline or session ended — still honour the tap locally */
      }
    }
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('cc.theme', next);
      // Explicit pick on THIS device: wins over the account copy on the
      // next sign-in (same rule language/currency picks follow).
      localStorage.setItem('cc.theme.picked', '1');
    } catch {}
  }

  const aria = labels?.aria || t('a11y.switchTheme');
  const title = labels?.title || t('topbar.lightDark');

  return (
    <button type="button" className={className} onClick={toggle} aria-label={aria} title={title}>
      {/* current-state icon, like the board: sun while light, moon while dark —
          drawn as SVG so it matches the rest of the icon set exactly */}
      <Icon name={dark ? 'moon' : 'sun'} size={20} />
    </button>
  );
}

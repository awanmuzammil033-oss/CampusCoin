import { Link } from 'react-router-dom';
import { useLocale } from '../locale.jsx';
import { useAuth } from '../auth.jsx';

/**
 * Breadcrumbs (UX-3) — every inner page passes its trail.
 * The last crumb is plain text: it is the page you are on, not a link.
 *
 * "Home" means the place a person calls home. Signed in, that is their
 * dashboard — sending somebody back to the marketing page from inside their own
 * account is a small wrong turn that costs them their place. Signed out, it is
 * the landing page, which is the only home there is.
 */
export default function Breadcrumbs({ trail = [] }) {
  const { t } = useLocale();
  const { user } = useAuth();
  if (!trail.length) return null;

  const homeTo = user ? '/dashboard' : '/';

  return (
    <nav className="breadcrumbs" aria-label={t('ui.breadcrumb')}>
      <Link to={homeTo}>{t('nav.home')}</Link>
      {trail.map((crumb, i) => (
        <span key={`${crumb.label}-${i}`} className="d-inline-flex gap-1">
          <span className="sep" aria-hidden="true">›</span>
          {crumb.to && i < trail.length - 1 ? (
            <Link to={crumb.to}>{crumb.label}</Link>
          ) : (
            <span aria-current={i === trail.length - 1 ? 'page' : undefined}>{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

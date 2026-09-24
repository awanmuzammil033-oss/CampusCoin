import { Link } from 'react-router-dom';

/**
 * Breadcrumbs (UX-3) — every inner page passes its trail.
 * The last crumb is plain text: it is the page you are on, not a link.
 */
export default function Breadcrumbs({ trail = [] }) {
  if (!trail.length) return null;

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <Link to="/">Home</Link>
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

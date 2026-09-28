import Breadcrumbs from './Breadcrumbs.jsx';
import { PageLoader } from './PageProgress.jsx';

/** Standard inner-page frame: breadcrumb, title, optional action buttons, and center screen loader. */
export default function Page({ trail, title, subtitle, actions, loading, children }) {
  return (
    <>
      {loading && <PageLoader />}
      <Breadcrumbs trail={trail} />
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          {subtitle && <p className="muted mb-0">{subtitle}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
      {children}
    </>
  );
}

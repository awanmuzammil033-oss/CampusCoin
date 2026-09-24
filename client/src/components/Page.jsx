import Breadcrumbs from './Breadcrumbs.jsx';

/** Standard inner-page frame: breadcrumb, title, optional action buttons. */
export default function Page({ trail, title, subtitle, actions, children }) {
  return (
    <>
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

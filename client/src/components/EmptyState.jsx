/** Friendly empty state: says what is missing and offers the next step. */
export default function EmptyState({ icon = '💰', title, children, action }) {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden="true">
        {icon}
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

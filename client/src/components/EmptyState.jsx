import Icon from './Icon.jsx';

/**
 * Friendly empty state: says what is missing and offers the next step.
 *
 * `icon` is an Icon.jsx name ("chart", "inbox", "wallet" …), not an emoji —
 * every glyph in the app is drawn SVG so it inherits the theme colours and
 * looks the same on every machine.
 */
export default function EmptyState({ icon = 'wallet', title, children, action }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={30} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

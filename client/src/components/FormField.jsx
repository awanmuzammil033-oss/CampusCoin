import Icon from './Icon.jsx';

/**
 * Form field wrapper: visible label, optional help text, and an error tied
 * to the input with aria-describedby so screen readers announce it.
 * Placeholders are never used as labels (design.md §5).
 */
export default function FormField({ label, htmlFor, help, error, children, hint }) {
  const helpId = help ? `${htmlFor}-help` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;

  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {typeof children === 'function'
        ? children({ 'aria-describedby': [helpId, errorId].filter(Boolean).join(' ') || undefined, 'aria-invalid': Boolean(error) })
        : children}
      {help && (
        <div className="field-help" id={helpId}>
          {help}
        </div>
      )}
      {hint && !error && <div className="field-help">{hint}</div>}
      {error && (
        <div className="field-error" id={errorId}>
          <Icon name="warning" size={16} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

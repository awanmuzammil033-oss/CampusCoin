/**
 * Centered, branded PageLoader component.
 * Displays a sleek frosted glass card with glowing dual rings,
 * 3D embossed coin with animated sheen, and dynamic status text.
 * 
 * Always renders as position:fixed covering the full viewport.
 */
export function PageLoader({ label }) {
  const cleanLabel = (label || 'Loading').replace(/[.…]+$/, '').trim() || 'Loading';

  return (
    <div
      className="cc-page-loader"
      aria-live="polite"
      aria-label="Loading page"
      role="status"
    >
      <div className="cc-page-loader-card">
        <div className="cc-page-loader-visual">
          <div className="cc-page-loader-glow" aria-hidden="true" />
          <div className="cc-page-loader-ring cc-ring-outer" aria-hidden="true" />
          <div className="cc-page-loader-ring cc-ring-inner" aria-hidden="true" />
          <div className="cc-page-loader-coin" aria-hidden="true">
            <span className="cc-coin-letter">C</span>
            <div className="cc-coin-shine" />
          </div>
        </div>

        <div className="cc-page-loader-content">
          <span className="cc-page-loader-brand-title">CampusCoin</span>
          <div className="cc-page-loader-status">
            <span>{cleanLabel}</span>
            <span className="cc-loader-dots" aria-hidden="true">
              <span>.</span><span>.</span><span>.</span>
            </span>
          </div>
        </div>

        <div className="cc-page-loader-track" aria-hidden="true">
          <div className="cc-page-loader-bar" />
        </div>
      </div>
    </div>
  );
}

/**
 * Suspense fallback – same branded loader.
 */
export function PageSkeleton() {
  return <PageLoader />;
}

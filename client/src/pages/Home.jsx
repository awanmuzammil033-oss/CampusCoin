import { Link } from 'react-router-dom';

/**
 * Home (public): the pitch, the feature strip, the sitemap (SRS deliverable
 * §1.9 — a real nested list of links, not a picture), and the footer.
 */
export default function Home() {
  return (
    <div>
      <a className="skip-link" href="#main-content">Skip to content</a>

      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true">C</span>
          Campus Coin
        </Link>
        <div className="topbar-spacer" />
        <Link className="btn btn-ghost btn-sm" to="/login">Sign in</Link>
        <Link className="btn btn-primary btn-sm" to="/register">Create account</Link>
      </header>

      <main id="main-content">
        <section className="landing-hero">
          <h1>Smart Spending, Student Style</h1>
          <p className="tagline">
            Track your allowance and expenses in seconds, see exactly where the money goes,
            and get simple tips built from your own numbers.
          </p>
          <div className="d-flex gap-3 justify-content-center flex-wrap">
            <Link className="btn btn-primary" to="/register">Get started free</Link>
            <Link className="btn btn-secondary" to="/login">I have an account</Link>
          </div>
        </section>

        <section className="feature-strip" aria-label="What Campus Coin does">
          <div className="card">
            <h3>⚡ Log in 10 seconds</h3>
            <p className="muted mb-0">Amount, category, done. Recurring allowance and subscriptions fill themselves in.</p>
          </div>
          <div className="card">
            <h3>🎯 Budgets that warn you early</h3>
            <p className="muted mb-0">Set a monthly limit per category and get a nudge at 80% — not after it is too late.</p>
          </div>
          <div className="card">
            <h3>📊 Reports you can export</h3>
            <p className="muted mb-0">Category, six-month and daily views, saved as PDF or shared by email when you click.</p>
          </div>
          <div className="card">
            <h3>💡 Tips from your own history</h3>
            <p className="muted mb-0">Suggestions ranked by how much you would actually save this month.</p>
          </div>
        </section>

        {/* Sitemap (SRS §1.9): real links, grouped, keyboard-navigable. */}
        <section className="sitemap-block card" aria-labelledby="sitemap-heading">
          <h2 id="sitemap-heading">Sitemap</h2>
          <p className="muted">Every corner of Campus Coin, in one list.</p>
          <nav aria-label="Sitemap" className="sitemap-grid">
            <div>
              <h3>Account</h3>
              <ul>
                <li><Link to="/register">Register</Link></li>
                <li><Link to="/login">Sign in</Link></li>
                <li><Link to="/forgot-password">Reset password</Link></li>
              </ul>
            </div>
            <div>
              <h3>Money</h3>
              <ul>
                <li><Link to="/dashboard">Dashboard</Link></li>
                <li><Link to="/transactions">Transactions</Link></li>
                <li><Link to="/transactions/new">Add income / expense</Link></li>
                <li><Link to="/transactions/import">Import from CSV</Link></li>
                <li><Link to="/recurring">Recurring entries</Link></li>
                <li><Link to="/categories">Categories</Link></li>
                <li><Link to="/budgets">Budgets</Link></li>
              </ul>
            </div>
            <div>
              <h3>Understand</h3>
              <ul>
                <li><Link to="/reports">Reports</Link></li>
                <li><Link to="/insights">Monthly insights</Link></li>
                <li><Link to="/tips">Saving tips</Link></li>
                <li><Link to="/bookmarks">Bookmarks & notes</Link></li>
                <li><Link to="/notifications">Notifications</Link></li>
              </ul>
            </div>
            <div>
              <h3>Settings</h3>
              <ul>
                <li><Link to="/profile">Profile</Link></li>
                <li><Link to="/profile">Theme (light / dark)</Link></li>
                <li><Link to="/profile">Text size</Link></li>
              </ul>
            </div>
            <div>
              <h3>Staff</h3>
              <ul>
                <li><Link to="/control/login">Administrator sign-in</Link></li>
              </ul>
            </div>
          </nav>
        </section>
      </main>

      <footer className="site-footer">
        <p className="mb-1">Campus Coin — a student budget companion. Your entries stay yours.</p>
        <p className="mb-0">Suggestions offered here are general guidance, not financial advice.</p>
      </footer>
    </div>
  );
}

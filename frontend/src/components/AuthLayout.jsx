import { Link } from "react-router-dom";

export default function AuthLayout({ children }) {
  return (
    <div className="auth-shell">
      <div className="auth-center">
        <header className="auth-header">
          <div className="wordmark">Note World</div>
          <p className="auth-tagline">Private notes, organized in clarity.</p>
        </header>
        <main className="auth-card">{children}</main>
        <p className="auth-explore">
          <Link to="/world">Browse public World Notes</Link>
        </p>
      </div>
    </div>
  );
}

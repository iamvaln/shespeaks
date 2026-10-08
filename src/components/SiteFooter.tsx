export function SiteFooter({ ellipse = true }: { ellipse?: boolean }) {
  return (
    <footer className="site-footer">
      <div className="container">
        {ellipse && <div className="ellipse" aria-hidden="true" />}
        <div className="footer-row">
          <p className="label-s muted">SHESPEAKS BY TECHIES CONNECT&apos;</p>
          <nav className="footer-social" aria-label="Social links">
            <a className="footer-link" href="https://www.linkedin.com/in/iamnv/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn — iamnv">LinkedIn ↗</a>
            <a className="footer-link" href="https://x.com/iam_n_v" target="_blank" rel="noopener noreferrer" aria-label="X — iam_n_v">X ↗</a>
          </nav>
          {/* the coach space is French only */}
          <a className="footer-link" href="/admin/login" lang="fr" rel="nofollow">Espace coach</a>
        </div>
      </div>
    </footer>
  );
}

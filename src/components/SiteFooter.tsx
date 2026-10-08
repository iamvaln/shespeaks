export function SiteFooter({ ellipse = true }: { ellipse?: boolean }) {
  return (
    <footer className="site-footer">
      <div className="container">
        {ellipse && <div className="ellipse" aria-hidden="true" />}
        <div className="footer-row">
          <p className="label-s muted">SHESPEAKS BY TECHIES CONNECT&apos;</p>
          {/* the coach space is French only */}
          <a className="footer-link" href="/admin/login" lang="fr" rel="nofollow">Espace coach</a>
        </div>
      </div>
    </footer>
  );
}

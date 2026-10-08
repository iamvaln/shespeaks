export function SiteFooter({ ellipse = true }: { ellipse?: boolean }) {
  return (
    <footer className="site-footer">
      <div className="container">
        {ellipse && <div className="ellipse" aria-hidden="true" />}
        <p className="label-s muted">SHESPEAKS BY TECHIES CONNECT&apos;</p>
      </div>
    </footer>
  );
}

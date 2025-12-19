export default function NotFound({ pathname }: { pathname?: string }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="stylesheet" href="/frame-master-not-found.css" />
        <title>404 - Page Not Found</title>
      </head>
      <body>
        <div className="decoration"></div>
        <div className="decoration"></div>
        <div className="decoration"></div>

        <div className="container">
          <div className="error-code">404</div>
          <h1 className="error-title">Page Not Found</h1>
          <p className="error-message">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <a href="/" className="home-button">
            Go Home
          </a>
        </div>
      </body>
    </html>
  );
}

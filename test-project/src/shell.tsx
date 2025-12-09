import { APP_DATA } from "./common";

export default function RenderShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="/static/style.css" />
        <link rel="icon" href="/static/favicon.ico" />
        <title>{APP_DATA.projectName}</title>
      </head>
      <body id="root">{children}</body>
    </html>
  );
}

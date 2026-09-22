"use client";

/**
 * The last boundary. This one replaces the root layout, so it is reached only
 * when the layout itself threw — which means the stylesheet may not have
 * loaded and `<html>` / `<body>` have to be rendered here. Styles are
 * therefore inline and self-contained rather than Tailwind classes, using the
 * same ink/marine tokens as `tailwind.config.ts` so it still looks like the
 * product on the one day anybody sees it.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#060912",
          color: "#e8edf7",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          padding: "1.5rem",
        }}
      >
        <div
          style={{
            maxWidth: "28rem",
            width: "100%",
            textAlign: "center",
            background: "#0e1525",
            border: "1px solid #1e2a48",
            borderRadius: "0.875rem",
            padding: "2.5rem",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>OceancOS could not start</h1>
          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#8294b3" }}>
            Something failed before the page could be built. Reloading usually clears it.
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: "0.75rem",
                fontSize: "11px",
                color: "#7e90ad",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
            >
              Reference {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              background: "#3b82f6",
              color: "#fff",
              border: "none",
              borderRadius: "0.5rem",
              padding: "0.55rem 1.1rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}

/**
 * Printed across a demo record's PDF, so a fictional change order or quote
 * cannot be mistaken for a real one once it leaves the application.
 */
export function DemoMark() {
  return (
    <>
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: "40%",
          left: 0,
          right: 0,
          textAlign: "center",
          transform: "rotate(-24deg)",
          fontSize: 88,
          fontWeight: 800,
          letterSpacing: 12,
          color: "rgba(180, 83, 9, 0.12)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      >
        DEMO
      </div>
      <p
        style={{
          margin: "10px 0 0",
          padding: "6px 10px",
          border: "1px solid #b45309",
          color: "#92400e",
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        DEMO DATA — a fictional walkthrough record, not a real vessel&rsquo;s.
      </p>
    </>
  );
}

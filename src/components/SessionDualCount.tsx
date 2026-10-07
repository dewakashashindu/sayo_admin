import React from "react";

/**
 * The two numbers a summary card has to carry at once: BookingIDs and the
 * service rows (sessions) behind them.
 *
 * A booking holding a Facial and a Haircut is 1 booking and 2 sessions, and
 * the two numbers answer different questions — how many clients were filed,
 * and how much work is actually on the floor. Both are captioned, so the pair
 * is never read the wrong way round.
 */
export default function SessionDualCount({
  bookings,
  sessions,
  color,
  size = 24,
}: {
  bookings: number;
  sessions: number;
  color?: string;
  /** Pixel size of the two numbers. Cards on a narrow screen pass less. */
  size?: number;
}) {
  const caption = Math.max(7, Math.round(size * 0.36));

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        flexWrap: "wrap",
        gap: size > 26 ? 8 : 6,
        color,
      }}
      title={`${bookings} Booking${bookings === 1 ? "" : "s"} · ${sessions} Session${
        sessions === 1 ? "" : "s"
      }`}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontSize: size, fontWeight: 800, lineHeight: 1.05 }}>
          {bookings}
        </span>
        <span
          style={{
            fontSize: caption,
            fontWeight: 700,
            letterSpacing: ".06em",
            textTransform: "uppercase",
            opacity: 0.55,
          }}
        >
          Bookings
        </span>
      </div>
      <span
        style={{
          fontSize: size - 8,
          fontWeight: 300,
          lineHeight: 1.45,
          opacity: 0.3,
        }}
      >
        |
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontSize: size, fontWeight: 800, lineHeight: 1.05 }}>
          {sessions}
        </span>
        <span
          style={{
            fontSize: caption,
            fontWeight: 700,
            letterSpacing: ".06em",
            textTransform: "uppercase",
            opacity: 0.55,
          }}
        >
          Sessions
        </span>
      </div>
    </div>
  );
}

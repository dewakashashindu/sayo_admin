// src/lib/serviceStatus.ts
/**
 * Per-SERVICE lifecycle, one row (tbl_bookingservicedetail) at a time.
 *
 * Before this, "done" and "cancelled" only existed for a whole booking
 * (header.Status / BillingTime) or a whole guest (tbl_bookingtxndetail).
 * The billing accordion needs to know, for EACH service, whether the
 * technician finished it, whether it was cancelled on its own, or whether it
 * is still on the floor — so a single service can be billed, cancelled or
 * rescheduled without touching its siblings.
 *
 * The two new stamps live on tbl_bookingservicedetail (see
 * scripts/migrate-add-service-status-mysql.sql):
 *   ServiceDoneTime      — technician marked this ONE service finished
 *   ServiceCancelledDate — this ONE service was cancelled
 */

/** What a service row carries once the read model has resolved it. */
export interface ServiceStatusInput {
  /** The row's own guest is already checked in. */
  checkedIn?: boolean;
  /** Technician marked this single service finished. */
  done?: boolean;
  /** This single service was cancelled. */
  cancelled?: boolean;
}

export type ServiceLifecycle =
  | "cancelled"
  | "done"
  | "ongoing"
  | "confirmed";

/**
 * The state one service row is in, in priority order:
 *   cancelled > done > ongoing (guest is in the chair) > confirmed (upcoming).
 */
export function serviceLifecycle(
  row: ServiceStatusInput,
): ServiceLifecycle {
  if (row.cancelled) return "cancelled";
  if (row.done) return "done";
  if (row.checkedIn) return "ongoing";
  return "confirmed";
}

/** True when a service may still be cancelled or rescheduled — it has not been
 *  finished and has not already been cancelled. */
export function serviceIsActive(row: ServiceStatusInput): boolean {
  const state = serviceLifecycle(row);
  return state === "ongoing" || state === "confirmed";
}

/** True when a service is billable — finished and not cancelled. */
export function serviceIsBillable(row: ServiceStatusInput): boolean {
  return serviceLifecycle(row) === "done";
}

/** A service with a money value, used for summing. */
export interface PricedService extends ServiceStatusInput {
  qty?: number;
  price?: number;
}

const lineTotal = (s: PricedService): number => {
  const qty = Number(s.qty);
  const price = Number(s.price);
  return (Number.isFinite(qty) && qty > 0 ? qty : 1) *
    (Number.isFinite(price) ? price : 0);
};

/** Total of the DONE, not-cancelled services — what "Create Bill" covers. */
export function billableTotal(services: readonly PricedService[]): number {
  return services
    .filter((s) => serviceIsBillable(s))
    .reduce((sum, s) => sum + lineTotal(s), 0);
}

/** Total of every not-cancelled service — the booking's full value. */
export function activeTotal(services: readonly PricedService[]): number {
  return services
    .filter((s) => !s.cancelled)
    .reduce((sum, s) => sum + lineTotal(s), 0);
}

/** Human label + colour token for a lifecycle state, shared by the screens. */
export function serviceLifecycleBadge(
  state: ServiceLifecycle,
): { label: string; tone: "red" | "violet" | "blue" | "green" } {
  switch (state) {
    case "cancelled":
      return { label: "Cancelled", tone: "red" };
    case "done":
      return { label: "Done", tone: "violet" };
    case "ongoing":
      return { label: "On-Going", tone: "blue" };
    default:
      return { label: "Confirmed", tone: "green" };
  }
}

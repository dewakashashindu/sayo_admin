export interface ServiceItem {
  name:     string;
  price:    string;
  duration: string;
  category: string;
}

export interface Provider {
  name:      string;
  role:      string;
  avatar:    string;
  expertise: string[];
}

export interface SwappedDetails {
  /** Services in the winning permutation order */
  orderedServices: string[];
  /** Why the original order fails */
  reason:          string;
  /**
   * permutation[i] = original index that goes in position i.
   * e.g. [1,0] = "do service[1] first, then service[0]"
   * e.g. [2,0,1] for a 3-service reorder
   */
  permutation:     number[];
  // Legacy 2-service compat — ConflictModal uses these
  firstService:    string;
  secondService:   string;

  /**
   * Gap between when service 1 ends and service 2 starts in the WINNING
   * permutation, measured in minutes.
   *
   * Calculated precisely as:
   *   startOf(service[i+1]) − (startOf(service[i]) + duration(service[i]))
   * across all consecutive pairs, then summed.
   *
   * === 0 : back-to-back, no waiting time
   *  > 0  : customer has to wait this many minutes between services
   */
  gapMinutes: number;

  /**
   * The clock time at which service 2 (or the second service in the
   * winning order) actually starts, accounting for the gap.
   * Useful for the "Why?" sentence: "Provider 2 is busy until <nextFreeTime>".
   */
  nextFreeTime: string;
}

export interface SlotResult {
  status: 'available' | 'partial' | 'booked';
  isSequenceSwapped:        boolean;
  swappedDetails?:          SwappedDetails;
  recommendedOriginalTime?: string;
}

/* ─────────────────────────────────────────────────────────────────────────────
    CONSTANTS
───────────────────────────────────────────────────────────────────────────── */

export const TIME_SLOTS = [
  '09:00 AM','09:30 AM','10:00 AM','10:30 AM',
  '11:00 AM','11:30 AM','12:00 PM','12:30 PM',
  '01:00 PM','01:30 PM','02:00 PM','02:30 PM',
  '03:00 PM','03:30 PM','04:00 PM','04:30 PM',
  '05:00 PM','05:30 PM','06:00 PM',
] as const;

const SLOT_INCREMENT = 30;

/* ─────────────────────────────────────────────────────────────────────────────
    LOW-LEVEL HELPERS
───────────────────────────────────────────────────────────────────────────── */

export function slotToMinutes(slot: string): number {
  const m = slot.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i);
  if (!m) return 0;
  let h = parseInt(m[1], 10);
  const mn = parseInt(m[2], 10);
  const period = m[3].toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return h * 60 + mn;
}

export function minutesToSlot(minutes: number): string | null {
  const h24    = Math.floor(minutes / 60);
  const mn     = minutes % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12    = h24 % 12 === 0 ? 12 : h24 % 12;
  const candidate = `${String(h12).padStart(2,'0')}:${String(mn).padStart(2,'0')} ${period}`;
  return (TIME_SLOTS as readonly string[]).includes(candidate) ? candidate : null;
}

/**
 * Converts a raw minute value to a display time string even if it falls
 * outside the bookable TIME_SLOTS grid. Used for displaying "busy until"
 * times in conflict messages where the exact end time may not land on a
 * 30-min boundary.
 */
function minutesToDisplayTime(minutes: number): string {
  if (minutes < 0)    minutes = 0;
  if (minutes > 1439) minutes = 1439;

  const h24    = Math.floor(minutes / 60);
  const mn     = minutes % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12    = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2,'0')}:${String(mn).padStart(2,'0')} ${period}`;
}

export function parseDurationMins(duration: string): number {
  return parseInt(duration, 10) || 0;
}

function occupiedChunks(startMinutes: number, durationMins: number): string[] {
  const chunks: string[] = [];
  for (let t = startMinutes; t < startMinutes + durationMins; t += SLOT_INCREMENT) {
    const label = minutesToSlot(t);
    if (label) chunks.push(label);
  }
  return chunks;
}

function isProviderFreeFor(
  providerName:  string,
  startMinutes:  number,
  durationMins:  number,
  providerSlots: Record<string, string[]>,
): boolean {
  const busy   = new Set(providerSlots[providerName] ?? []);
  const chunks = occupiedChunks(startMinutes, durationMins);
  return chunks.every(c => !busy.has(c));
}

/* ─────────────────────────────────────────────────────────────────────────────
    SEQUENCE CHECKER
    Returns ok:true when every (provider, service) pair is free back-to-back.
    On failure returns the first failing pair's index, provider name, and the
    next minute at which that provider becomes free for the required duration.
───────────────────────────────────────────────────────────────────────────── */

function checkSequence(
  baseMinutes:   number,
  providers:     Provider[],
  services:      ServiceItem[],
  providerSlots: Record<string, string[]>,
): { ok: true } | {
  ok:           false;
  failIndex:    number;
  failProvider: string;
  nextFreeAt:   number | null;
} {
  let cursor = baseMinutes;

  for (let i = 0; i < services.length; i++) {
    const svc  = services[i];
    const prov = providers[i];

    if (!prov?.name) {
      return { ok: false, failIndex: i, failProvider: 'Unknown', nextFreeAt: null };
    }

    const duration = parseDurationMins(svc.duration);

    if (!isProviderFreeFor(prov.name, cursor, duration, providerSlots)) {
      const nextFreeAt = findNextFreeStart(prov.name, cursor, duration, providerSlots);
      return { ok: false, failIndex: i, failProvider: prov.name, nextFreeAt };
    }
    cursor += duration;
  }
  return { ok: true };
}

function findNextFreeStart(
  providerName:  string,
  fromMinutes:   number,
  durationMins:  number,
  providerSlots: Record<string, string[]>,
): number | null {
  const LAST_SLOT_MINS = slotToMinutes('06:00 PM');
  for (
    let t = fromMinutes + SLOT_INCREMENT;
    t <= LAST_SLOT_MINS;
    t += SLOT_INCREMENT
  ) {
    if (isProviderFreeFor(providerName, t, durationMins, providerSlots)) return t;
  }
  return null;
}

function findRecommendedOriginalTime(
  fromSlot:      string,
  providers:     Provider[],
  services:      ServiceItem[],
  providerSlots: Record<string, string[]>,
): string | undefined {
  const fromIdx = TIME_SLOTS.indexOf(fromSlot as typeof TIME_SLOTS[number]);
  if (fromIdx === -1) return undefined;

  for (let i = fromIdx + 1; i < TIME_SLOTS.length; i++) {
    const result = checkSequence(slotToMinutes(TIME_SLOTS[i]), providers, services, providerSlots);
    if (result.ok) return TIME_SLOTS[i];
  }
  return undefined;
}

/* ─────────────────────────────────────────────────────────────────────────────
    GAP CALCULATOR
    Given a winning permutation, calculates the total waiting-time gap the
    customer will experience.

    For each consecutive pair (i, i+1) in the permuted sequence:
      - Service i runs from `cursor` to `cursor + duration_i`
      - Provider i+1's earliest free start ≥ end of service i is found
      - gap_i = (earliest free start of provider i+1) − (cursor + duration_i)

    Sum of all gap_i = total waiting time.
    If every service can start exactly when the previous one ends: gap = 0.
───────────────────────────────────────────────────────────────────────────── */

function calculatePermutationGap(
  baseMinutes:   number,
  providers:     Provider[],
  services:      ServiceItem[],
  providerSlots: Record<string, string[]>,
): { gapMinutes: number; nextFreeTime: string } {
  let cursor      = baseMinutes;
  let totalGap    = 0;
  let nextFreeMin = baseMinutes; // will be set to where the 2nd service starts

  for (let i = 0; i < services.length; i++) {
    const duration    = parseDurationMins(services[i].duration);
    const serviceEnd  = cursor + duration;                // end of THIS service

    if (i < services.length - 1) {
      // Find the earliest moment ≥ serviceEnd at which provider[i+1] is free
      // for the full duration of services[i+1].
      const nextDur      = parseDurationMins(services[i + 1].duration);
      const nextProvider = providers[i + 1];

      let earliestStart = serviceEnd; // optimistic: provider is free immediately
      if (!isProviderFreeFor(nextProvider.name, serviceEnd, nextDur, providerSlots)) {
        // Provider not free at serviceEnd — scan forward in 30-min steps
        const found = findNextFreeStart(nextProvider.name, serviceEnd - SLOT_INCREMENT, nextDur, providerSlots);
        earliestStart = found !== null ? found : serviceEnd; // fallback keeps gap=0 if scan fails
      }

      const gapHere = Math.max(0, earliestStart - serviceEnd);
      totalGap     += gapHere;
      cursor        = earliestStart; // next service actually starts here

      // Capture the start time of service[1] (the second slot in the sequence)
      // for use in the "Why?" explanation sentence.
      if (i === 0) {
        nextFreeMin = earliestStart;
      }
    } else {
      cursor = serviceEnd;
    }
  }

  return {
    gapMinutes:  totalGap,
    nextFreeTime: minutesToDisplayTime(nextFreeMin),
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
    PERMUTATION HELPERS
    N-provider support: n=2→2 perms, n=3→6 perms, n=4→24 perms.
    Salon context: n≤4 realistic, no perf concern.
───────────────────────────────────────────────────────────────────────────── */

function getPermutations(n: number): number[][] {
  if (n === 0) return [];
  if (n === 1) return [[0]];

  function permute(arr: number[]): number[][] {
    if (arr.length <= 1) return [arr];
    const result: number[][] = [];
    for (let i = 0; i < arr.length; i++) {
      const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
      for (const perm of permute(rest)) result.push([arr[i], ...perm]);
    }
    return result;
  }

  return permute(Array.from({ length: n }, (_, i) => i));
}

function findWorkingPermutation(
  baseMinutes:          number,
  providers:            Provider[],
  services:             ServiceItem[],
  providerSlots:        Record<string, string[]>,
  originalFailIndex:    number,
  originalFailProvider: string,
  originalNextFreeAt:   number | null,
): SwappedDetails | null {
  const n = providers.length;
  if (n < 2) return null;

  const identityStr = Array.from({ length: n }, (_, i) => i).join(',');

  for (const perm of getPermutations(n)) {
    if (perm.join(',') === identityStr) continue; // skip original order

    const permProviders = perm.map(i => providers[i]);
    const permServices  = perm.map(i => services[i]);

    // A permutation "works" if ALL providers are free when it's their turn.
    // We use the gap calculator rather than checkSequence so we can handle
    // permutations where provider[i+1] isn't free exactly at serviceEnd but
    // IS free a little later (the gap case).
    //
    // Strategy: run checkSequence first as the fast path.  If it passes
    // without conflict, gap = 0 — ideal.  If it fails because a provider
    // needs to wait, we compute the gap and accept the permutation only if
    // every provider eventually becomes free (i.e. nextFreeAt is not null).
    const seqResult = checkSequence(baseMinutes, permProviders, permServices, providerSlots);

    let accepted = false;

    if (seqResult.ok) {
      accepted = true;
    } else {
      // The permutation has a conflict, but maybe it resolves with a gap.
      // Accept it if the conflicting provider has a free slot later today.
      accepted = seqResult.nextFreeAt !== null;
    }

    if (!accepted) continue;

    // ── Calculate precise gap for the accepted permutation ────────────────
    const { gapMinutes, nextFreeTime } = calculatePermutationGap(
      baseMinutes, permProviders, permServices, providerSlots,
    );

    const orderedServices = perm.map(i => services[i].name);

    const failedSvc  = services[originalFailIndex];
    const failedProv = providers[originalFailIndex];
    const nextLabel  =
      originalNextFreeAt !== null
        ? (minutesToSlot(originalNextFreeAt) ?? minutesToDisplayTime(originalNextFreeAt))
        : 'later today';

    const reason =
      `${failedProv?.name ?? 'Provider'} is busy during ` +
      `"${failedSvc?.name ?? 'service'}" — next free at ${nextLabel}`;

    return {
      orderedServices,
      reason,
      permutation:   perm,
      firstService:  orderedServices[0] ?? '',
      secondService: orderedServices[1] ?? '',
      gapMinutes,
      nextFreeTime,
    };
  }

  return null;
}

/* ─────────────────────────────────────────────────────────────────────────────
    MAIN EXPORT: evaluateSlot
───────────────────────────────────────────────────────────────────────────── */

export function evaluateSlot(
  slot:          string,
  providers:     Provider[],
  services:      ServiceItem[],
  providerSlots: Record<string, string[]>,
  bookedSlots:   Set<string> | string[],
): SlotResult {

  /* ── Guard: globally blocked ── */
  const blocked = bookedSlots instanceof Set ? bookedSlots : new Set(bookedSlots);
  if (blocked.has(slot)) return { status: 'booked', isSequenceSwapped: false };

  /* ── Guard: nothing selected ── */
  if (providers.length === 0 || services.length === 0) {
    return { status: 'available', isSequenceSwapped: false };
  }

  /*
   * Guard: providers/services count mismatch.
   * Evaluate only the paired portion so we never crash on undefined access.
   */
  const pairCount       = Math.min(providers.length, services.length);
  const pairedProviders = providers.slice(0, pairCount);
  const pairedServices  = services.slice(0, pairCount);

  /* ── Single pair fast path ── */
  if (pairCount === 1) {
    if (!pairedProviders[0]?.name) return { status: 'booked', isSequenceSwapped: false };
    const free = isProviderFreeFor(
      pairedProviders[0].name,
      slotToMinutes(slot),
      parseDurationMins(pairedServices[0].duration),
      providerSlots,
    );
    return free
      ? { status: 'available', isSequenceSwapped: false }
      : { status: 'booked',    isSequenceSwapped: false };
  }

  const baseMins = slotToMinutes(slot);

  /* ── Check ORIGINAL sequence ── */
  const originalCheck = checkSequence(baseMins, pairedProviders, pairedServices, providerSlots);

  if (originalCheck.ok) return { status: 'available', isSequenceSwapped: false };

  /* ── Try every permutation (N-provider generalisation) ── */
  const swappedDetails = findWorkingPermutation(
    baseMins,
    pairedProviders,
    pairedServices,
    providerSlots,
    originalCheck.failIndex,
    originalCheck.failProvider,
    originalCheck.nextFreeAt,
  );

  const isSequenceSwapped = swappedDetails !== null;

  /* ── Find recommended original time ── */
  const recommendedOriginalTime = findRecommendedOriginalTime(
    slot, pairedProviders, pairedServices, providerSlots,
  );

  const status: SlotResult['status'] =
    isSequenceSwapped || recommendedOriginalTime ? 'partial' : 'booked';

  return {
    status,
    isSequenceSwapped,
    swappedDetails:          swappedDetails ?? undefined,
    recommendedOriginalTime,
  };
}
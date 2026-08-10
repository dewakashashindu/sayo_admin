/* ═══════════════════════════════════════════════════════════════════════════
   slotEvaluator.ts  —  Booking slot logic engine
═══════════════════════════════════════════════════════════════════════════ */

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
  orderedServices: string[];
  reason:          string;
  permutation:     number[];
  firstService:    string;
  secondService:   string;
  gapMinutes:      number;
  nextFreeTime:    string;
  occupiedSlots:   string[];
}

export interface SlotResult {
  status:                   'available' | 'partial' | 'booked';
  isSequenceSwapped:        boolean;
  swappedDetails?:          SwappedDetails;
  recommendedOriginalTime?: string;
  occupiedSlots:            string[];
  gapOnlyDetails?: {
    gapMinutes:    number;
    busyUntil:     string;
    busyProvider:  string;
    busyService:   string;
    occupiedSlots: string[];
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────────────────────── */
export const TIME_SLOTS = [
  '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM',
  '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM',
  '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM',
  '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM',
  '05:00 PM', '05:30 PM', '06:00 PM',
] as const;

const SLOT_INCREMENT = 30;
const LAST_SLOT_MINS = slotToMinutes('06:00 PM');

/* ─────────────────────────────────────────────────────────────────────────────
   TIME HELPERS
───────────────────────────────────────────────────────────────────────────── */
export function slotToMinutes(slot: string): number {
  const m = slot.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i);
  if (!m) return 0;
  let h          = parseInt(m[1], 10);
  const mn       = parseInt(m[2], 10);
  const period   = m[3].toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h  = 0;
  return h * 60 + mn;
}

export function minutesToSlot(minutes: number): string | null {
  const h24      = Math.floor(minutes / 60);
  const mn       = minutes % 60;
  const period   = h24 >= 12 ? 'PM' : 'AM';
  const h12      = h24 % 12 === 0 ? 12 : h24 % 12;
  const candidate = `${String(h12).padStart(2, '0')}:${String(mn).padStart(2, '0')} ${period}`;
  return (TIME_SLOTS as readonly string[]).includes(candidate) ? candidate : null;
}

function minutesToDisplay(minutes: number): string {
  if (minutes < 0)    minutes = 0;
  if (minutes > 1439) minutes = 1439;
  const h24    = Math.floor(minutes / 60);
  const mn     = minutes % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12    = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, '0')}:${String(mn).padStart(2, '0')} ${period}`;
}

export function parseDurationMins(duration: string): number {
  return Math.max(parseInt(duration, 10) || 0, 0);
}

/* ─────────────────────────────────────────────────────────────────────────────
   CHUNK HELPERS
───────────────────────────────────────────────────────────────────────────── */
function occupiedChunks(startMinutes: number, durationMins: number): string[] {
  const chunks: string[] = [];
  for (let t = startMinutes; t < startMinutes + durationMins; t += SLOT_INCREMENT) {
    const label = minutesToSlot(t);
    if (label) chunks.push(label);
  }
  return chunks;
}

function buildOccupiedSlots(
  segments: Array<{ startMins: number; durationMins: number }>,
): string[] {
  const seen   = new Set<string>();
  const result: string[] = [];
  for (const seg of segments) {
    for (const slot of occupiedChunks(seg.startMins, seg.durationMins)) {
      if (!seen.has(slot)) { seen.add(slot); result.push(slot); }
    }
  }
  return result;
}

/* ─────────────────────────────────────────────────────────────────────────────
   PROVIDER AVAILABILITY
───────────────────────────────────────────────────────────────────────────── */
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

function findNextFreeStart(
  providerName:  string,
  fromMinutes:   number,
  durationMins:  number,
  providerSlots: Record<string, string[]>,
): number | null {
  for (
    let t = fromMinutes + SLOT_INCREMENT;
    t <= LAST_SLOT_MINS;
    t += SLOT_INCREMENT
  ) {
    if (isProviderFreeFor(providerName, t, durationMins, providerSlots)) return t;
  }
  return null;
}

/* ─────────────────────────────────────────────────────────────────────────────
   SEQUENCE CHECKER
───────────────────────────────────────────────────────────────────────────── */
type SeqOk   = { ok: true };
type SeqFail = {
  ok:           false;
  failIndex:    number;
  failProvider: string;
  failService:  string;
  nextFreeAt:   number | null;
};

function checkSequence(
  baseMinutes:   number,
  providers:     Provider[],
  services:      ServiceItem[],
  providerSlots: Record<string, string[]>,
): SeqOk | SeqFail {
  let cursor = baseMinutes;
  for (let i = 0; i < services.length; i++) {
    const svc  = services[i];
    const prov = providers[i];
    if (!prov?.name) {
      return { ok: false, failIndex: i, failProvider: 'Unknown', failService: svc?.name ?? '', nextFreeAt: null };
    }
    const duration = parseDurationMins(svc.duration);
    if (!isProviderFreeFor(prov.name, cursor, duration, providerSlots)) {
      const nextFreeAt = findNextFreeStart(prov.name, cursor, duration, providerSlots);
      return { ok: false, failIndex: i, failProvider: prov.name, failService: svc.name, nextFreeAt };
    }
    cursor += duration;
  }
  return { ok: true };
}

/* ─────────────────────────────────────────────────────────────────────────────
   GAP CALCULATOR
───────────────────────────────────────────────────────────────────────────── */
interface GapResult {
  gapMinutes:   number;
  nextFreeTime: string;
  segments:     Array<{ startMins: number; durationMins: number }>;
}

function calculateSequenceGap(
  baseMinutes:   number,
  providers:     Provider[],
  services:      ServiceItem[],
  providerSlots: Record<string, string[]>,
): GapResult {
  let cursor             = baseMinutes;
  let totalGap           = 0;
  let secondServiceStart = baseMinutes;
  const segments: Array<{ startMins: number; durationMins: number }> = [];

  for (let i = 0; i < services.length; i++) {
    const duration   = parseDurationMins(services[i].duration);
    const serviceEnd = cursor + duration;
    segments.push({ startMins: cursor, durationMins: duration });

    if (i < services.length - 1) {
      const nextProvider = providers[i + 1];
      const nextDur      = parseDurationMins(services[i + 1].duration);
      let earliestStart  = serviceEnd;

      if (!isProviderFreeFor(nextProvider.name, serviceEnd, nextDur, providerSlots)) {
        const found = findNextFreeStart(
          nextProvider.name,
          serviceEnd - SLOT_INCREMENT,
          nextDur,
          providerSlots,
        );
        if (found !== null) earliestStart = found;
      }

      const gapHere = Math.max(0, earliestStart - serviceEnd);
      totalGap     += gapHere;
      cursor        = earliestStart;
      if (i === 0) secondServiceStart = earliestStart;
    } else {
      cursor = serviceEnd;
    }
  }

  return {
    gapMinutes:   totalGap,
    nextFreeTime: minutesToDisplay(secondServiceStart),
    segments,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   RECOMMENDED TIME
───────────────────────────────────────────────────────────────────────────── */
function findRecommendedOriginalTime(
  fromSlot:      string,
  providers:     Provider[],
  services:      ServiceItem[],
  providerSlots: Record<string, string[]>,
): string | undefined {
  const fromIdx = TIME_SLOTS.indexOf(fromSlot as typeof TIME_SLOTS[number]);
  if (fromIdx === -1) return undefined;

  // ✅ FIX: Only scan FUTURE slots (fromIdx + 1 onwards)
  for (let i = fromIdx + 1; i < TIME_SLOTS.length; i++) {
    const candidateSlot = TIME_SLOTS[i];
    const result = checkSequence(
      slotToMinutes(candidateSlot),
      providers,
      services,
      providerSlots,
    );
    if (result.ok) return candidateSlot;
  }
  return undefined;
}

/* ─────────────────────────────────────────────────────────────────────────────
   PERMUTATION HELPERS
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

/* ─────────────────────────────────────────────────────────────────────────────
   WORKING PERMUTATION FINDER  ← MAIN BUG FIX HERE
───────────────────────────────────────────────────────────────────────────── */
function findWorkingPermutation(
  baseMinutes:          number,
  providers:            Provider[],
  services:             ServiceItem[],
  providerSlots:        Record<string, string[]>,
  originalFailIndex:    number,
  originalFailProvider: string,
  originalFailService:  string,
  originalNextFreeAt:   number | null,
): SwappedDetails | null {
  const n = providers.length;
  if (n < 2) return null;

  const identityStr = Array.from({ length: n }, (_, i) => i).join(',');

  interface Candidate {
    perm:       number[];
    gapMinutes: number;
    gapResult:  GapResult;
  }
  const candidates: Candidate[] = [];

  for (const perm of getPermutations(n)) {
    if (perm.join(',') === identityStr) continue;

    const permProviders = perm.map(i => providers[i]);
    const permServices  = perm.map(i => services[i]);

    // ✅ FIX #1: First provider in swapped order MUST be free at baseMinutes
    // Without this check, we accept swaps where the first service is also blocked,
    // which causes the modal to show wrong time slots (e.g., 09:00 AM for an 11:30 AM booking)
    const firstDuration = parseDurationMins(permServices[0].duration);
    const firstProviderFree = isProviderFreeFor(
      permProviders[0].name,
      baseMinutes,
      firstDuration,
      providerSlots,
    );
    if (!firstProviderFree) continue;

    // ✅ FIX #2: Also verify the swapped sequence actually improves on original
    // The first service must start exactly at baseMinutes with no gap
    const seqResult = checkSequence(
      baseMinutes,
      permProviders,
      permServices,
      providerSlots,
    );

    let accepted = false;
    if (seqResult.ok) {
      // Zero-gap permutation — best case
      accepted = true;
    } else {
      // Has a gap but first service is free and next provider eventually becomes free
      accepted = seqResult.nextFreeAt !== null;
    }

    if (!accepted) continue;

    const gapResult = calculateSequenceGap(
      baseMinutes,
      permProviders,
      permServices,
      providerSlots,
    );
    candidates.push({ perm, gapMinutes: gapResult.gapMinutes, gapResult });
  }

  if (candidates.length === 0) return null;

  // Prefer zero-gap; then smallest gap
  candidates.sort((a, b) => a.gapMinutes - b.gapMinutes);
  const best = candidates[0];

  const { perm, gapResult } = best;
  const permProviders   = perm.map(i => providers[i]);
  const permServices    = perm.map(i => services[i]);
  const orderedServices = permServices.map(s => s.name);
  const occupiedSlots   = buildOccupiedSlots(gapResult.segments);

  const nextLabel =
    originalNextFreeAt !== null
      ? (minutesToSlot(originalNextFreeAt) ?? minutesToDisplay(originalNextFreeAt))
      : 'later today';

  const reason =
    `${originalFailProvider} is busy during "${originalFailService}" — ` +
    `next free at ${nextLabel}`;

  return {
    orderedServices,
    reason,
    permutation:   perm,
    firstService:  orderedServices[0]  ?? '',
    secondService: orderedServices[1]  ?? '',
    gapMinutes:    gapResult.gapMinutes,
    nextFreeTime:  gapResult.nextFreeTime,
    occupiedSlots,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN EXPORT
───────────────────────────────────────────────────────────────────────────── */
export function evaluateSlot(
  slot:          string,
  providers:     Provider[],
  services:      ServiceItem[],
  providerSlots: Record<string, string[]>,
  bookedSlots:   Set<string> | string[],
): SlotResult {

  /* Guard: globally blocked */
  const blocked = bookedSlots instanceof Set ? bookedSlots : new Set(bookedSlots);
  if (blocked.has(slot)) {
    return { status: 'booked', isSequenceSwapped: false, occupiedSlots: [] };
  }

  /* Guard: nothing selected */
  if (providers.length === 0 || services.length === 0) {
    return { status: 'available', isSequenceSwapped: false, occupiedSlots: [] };
  }

  const pairCount       = Math.min(providers.length, services.length);
  const pairedProviders = providers.slice(0, pairCount);
  const pairedServices  = services.slice(0, pairCount);
  const baseMins        = slotToMinutes(slot);

  /* ══════════════════════════════════════════════════════════════════════════
     SINGLE SERVICE
  ══════════════════════════════════════════════════════════════════════════ */
  if (pairCount === 1) {
    if (!pairedProviders[0]?.name) {
      return { status: 'booked', isSequenceSwapped: false, occupiedSlots: [] };
    }
    const duration = parseDurationMins(pairedServices[0].duration);
    const free     = isProviderFreeFor(pairedProviders[0].name, baseMins, duration, providerSlots);
    if (free) {
      const slots = buildOccupiedSlots([{ startMins: baseMins, durationMins: duration }]);
      return { status: 'available', isSequenceSwapped: false, occupiedSlots: slots };
    }
    return { status: 'booked', isSequenceSwapped: false, occupiedSlots: [] };
  }

  /* ══════════════════════════════════════════════════════════════════════════
     MULTI-SERVICE
  ══════════════════════════════════════════════════════════════════════════ */

  /* Step 1: Try original order */
  const originalCheck = checkSequence(baseMins, pairedProviders, pairedServices, providerSlots);

  if (originalCheck.ok) {
    const { segments } = calculateSequenceGap(baseMins, pairedProviders, pairedServices, providerSlots);
    const slots = buildOccupiedSlots(segments);
    return { status: 'available', isSequenceSwapped: false, occupiedSlots: slots };
  }

  /* Step 2: Try alternative permutations (R2 / R3) */
  const swappedDetails = findWorkingPermutation(
    baseMins,
    pairedProviders,
    pairedServices,
    providerSlots,
    originalCheck.failIndex,
    originalCheck.failProvider,
    originalCheck.failService,
    originalCheck.nextFreeAt,
  );

  /* Step 3: Check gap-only path (R4) */
  let gapOnlyDetails: SlotResult['gapOnlyDetails'] | undefined;

  // ✅ FIX #3: Only compute gapOnly when there's no valid swap,
  // OR when the swap also has a gap (to show both options in modal)
  const shouldCheckGapOnly = !swappedDetails || swappedDetails.gapMinutes > 0;

  if (shouldCheckGapOnly) {
    const fail = originalCheck as SeqFail;
    if (fail.nextFreeAt !== null) {
      const gapResult = calculateSequenceGap(
        baseMins,
        pairedProviders,
        pairedServices,
        providerSlots,
      );

      if (gapResult.gapMinutes > 0) {
        gapOnlyDetails = {
          gapMinutes:    gapResult.gapMinutes,
          busyUntil:     minutesToDisplay(fail.nextFreeAt),
          busyProvider:  fail.failProvider,
          busyService:   fail.failService,
          occupiedSlots: buildOccupiedSlots(gapResult.segments),
        };
      }
    }
  }

  /* Step 4: Recommended original time */
  // ✅ FIX #4: Only find recommended time when there's actually a conflict
  // This prevents showing "start at 09:00 AM" for an 11:30 AM booking
  const recommendedOriginalTime = (swappedDetails !== null || gapOnlyDetails !== undefined)
    ? findRecommendedOriginalTime(slot, pairedProviders, pairedServices, providerSlots)
    : undefined;

  /* Step 5: Final status */
  const isSequenceSwapped = swappedDetails !== null;
  const isPartial         = isSequenceSwapped || !!gapOnlyDetails || !!recommendedOriginalTime;
  const status: SlotResult['status'] = isPartial ? 'partial' : 'booked';

  const occupiedSlots: string[] =
    swappedDetails?.occupiedSlots ??
    gapOnlyDetails?.occupiedSlots ??
    [];

  return {
    status,
    isSequenceSwapped,
    swappedDetails:          swappedDetails ?? undefined,
    recommendedOriginalTime,
    occupiedSlots,
    gapOnlyDetails,
  };
}
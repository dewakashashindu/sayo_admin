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

/** The persisted execution schedule for one selected service. */
export interface ServiceScheduleEntry {
  serviceIndex: number;
  providerName: string;
  startTime:    string;
  endTime:      string;
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
  schedule:        ServiceScheduleEntry[];
}

export interface SlotResult {
  status:                   'available' | 'partial' | 'booked';
  isSequenceSwapped:        boolean;
  swappedDetails?:          SwappedDetails;
  recommendedOriginalTime?: string;
  /** The service-by-service schedule when this result can be booked. */
  serviceSchedule?:         ServiceScheduleEntry[];
  occupiedSlots:            string[];
  gapOnlyDetails?: {
    gapMinutes:    number;
    busyUntil:     string;
    busyProvider:  string;
    busyService:   string;
    occupiedSlots: string[];
    schedule:      ServiceScheduleEntry[];
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
  if (durationMins <= 0) return [];

  /*
   * A service may end at (or start at) a non-30-minute boundary. Iterating
   * from startMinutes and converting each value to a label drops values such
   * as 09:15 because minutesToSlot(09:15) is intentionally null. Instead,
   * walk the fixed 30-minute grid and include every cell whose interval
   * intersects the real [start, end) service window.
   */
  const chunks: string[] = [];
  const endMinutes = startMinutes + durationMins;
  const firstGridStart = Math.floor(startMinutes / SLOT_INCREMENT) * SLOT_INCREMENT;

  for (let gridStart = firstGridStart; gridStart < endMinutes; gridStart += SLOT_INCREMENT) {
    const gridEnd = gridStart + SLOT_INCREMENT;
    if (gridStart >= endMinutes || gridEnd <= startMinutes) continue;

    const label = minutesToSlot(gridStart);
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

function nextGridStart(minutes: number): number {
  return Math.ceil(minutes / SLOT_INCREMENT) * SLOT_INCREMENT;
}

interface SequenceSegment {
  serviceIndex: number;
  providerName: string;
  startMins:    number;
  durationMins: number;
}

function scheduleFromSegments(segments: SequenceSegment[]): ServiceScheduleEntry[] {
  return segments.map((segment) => ({
    serviceIndex: segment.serviceIndex,
    providerName: segment.providerName,
    startTime:    minutesToDisplay(segment.startMins),
    endTime:      minutesToDisplay(segment.startMins + segment.durationMins),
  }));
}

/**
 * Build the normal sequential schedule used when the customer books the
 * original order (or chooses a recommended later slot).
 *
 * A single provider can move directly from one service into the next. When
 * services use different providers, each next service must begin on a real
 * 30-minute slot; a 09:15 boundary is therefore carried forward to 09:30.
 */
export function buildSequentialServiceSchedule(
  startSlot: string,
  providers: Provider[],
  services: ServiceItem[],
): ServiceScheduleEntry[] {
  const startMins = slotToMinutes(startSlot);
  if (startMins < 0 || providers.length === 0) return [];

  let cursor = startMins;
  return services.map((service, serviceIndex) => {
    const provider = providers[Math.min(serviceIndex, providers.length - 1)];
    const durationMins = parseDurationMins(service.duration);
    const segment: ServiceScheduleEntry = {
      serviceIndex,
      providerName: provider?.name ?? '',
      startTime: minutesToDisplay(cursor),
      endTime: minutesToDisplay(cursor + durationMins),
    };

    const serviceEnd = cursor + durationMins;
    cursor = providers.length === 1 ? serviceEnd : nextGridStart(serviceEnd);
    return segment;
  });
}

/**
 * Build the legacy split-visit schedule. Each service starts at the selected
 * anchor or at the second slot supplied by the modal when its provider is
 * busy at the anchor. Services belonging to the same provider remain
 * sequential instead of being placed on top of one another.
 */
export function buildSplitServiceSchedule(
  firstSlot: string,
  secondSlot: string,
  providers: Provider[],
  services: ServiceItem[],
  providerSlots: Record<string, string[]>,
): ServiceScheduleEntry[] {
  const firstMins = slotToMinutes(firstSlot);
  const secondMins = slotToMinutes(secondSlot);
  if (firstMins < 0 || secondMins < 0 || providers.length === 0) return [];

  const cursors = new Map<string, number>();
  return services.map((service, serviceIndex) => {
    const provider = providers[Math.min(serviceIndex, providers.length - 1)];
    const providerName = provider?.name ?? '';
    const preferredStart = (providerSlots[providerName] ?? []).includes(firstSlot)
      ? secondMins
      : firstMins;
    const startMins = Math.max(preferredStart, cursors.get(providerName) ?? preferredStart);
    const durationMins = parseDurationMins(service.duration);
    const endMins = startMins + durationMins;
    cursors.set(providerName, endMins);

    return {
      serviceIndex,
      providerName,
      startTime: minutesToDisplay(startMins),
      endTime: minutesToDisplay(endMins),
    };
  });
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
  earliestStart: number,
  durationMins:  number,
  providerSlots: Record<string, string[]>,
): number | null {
  /* Only return starts that actually exist in TIME_SLOTS. */
  for (
    let t = Math.max(SLOT_INCREMENT, nextGridStart(earliestStart));
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
      const nextFreeAt = findNextFreeStart(prov.name, cursor + 1, duration, providerSlots);
      return { ok: false, failIndex: i, failProvider: prov.name, failService: svc.name, nextFreeAt };
    }

    const serviceEnd = cursor + duration;
    /* A new provider can only start on one of the public 30-minute slots. */
    cursor = i < services.length - 1 ? nextGridStart(serviceEnd) : serviceEnd;
  }
  return { ok: true };
}

/* ─────────────────────────────────────────────────────────────────────────────
   GAP CALCULATOR
───────────────────────────────────────────────────────────────────────────── */
interface GapResult {
  gapMinutes:   number;
  nextFreeTime: string;
  segments:     SequenceSegment[];
  schedule:     ServiceScheduleEntry[];
  complete:     boolean;
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
  let complete            = true;
  const segments: SequenceSegment[] = [];

  for (let i = 0; i < services.length; i++) {
    const duration   = parseDurationMins(services[i].duration);
    const serviceEnd = cursor + duration;
    segments.push({
      serviceIndex: i,
      providerName: providers[i]?.name ?? '',
      startMins:    cursor,
      durationMins: duration,
    });

    if (i < services.length - 1) {
      const nextProvider = providers[i + 1];
      const nextDur      = parseDurationMins(services[i + 1].duration);
      /* A service boundary that is not on the public grid moves to the next
         real slot instead of becoming an uncheckable 09:15 start. */
      let earliestStart  = nextGridStart(serviceEnd);

      if (!isProviderFreeFor(nextProvider.name, earliestStart, nextDur, providerSlots)) {
        const found = findNextFreeStart(
          nextProvider.name,
          earliestStart,
          nextDur,
          providerSlots,
        );
        if (found !== null) earliestStart = found;
        else complete = false;
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
    schedule:     scheduleFromSegments(segments),
    complete,
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

function findRecommendedSingleProviderTime(
  fromSlot:      string,
  providerName:   string,
  durationMins:   number,
  providerSlots: Record<string, string[]>,
): string | undefined {
  const fromIdx = TIME_SLOTS.indexOf(fromSlot as typeof TIME_SLOTS[number]);
  if (fromIdx === -1) return undefined;

  for (let i = fromIdx + 1; i < TIME_SLOTS.length; i++) {
    const candidateSlot = TIME_SLOTS[i];
    if (isProviderFreeFor(
      providerName,
      slotToMinutes(candidateSlot),
      durationMins,
      providerSlots,
    )) return candidateSlot;
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
    if (!gapResult.complete) continue;
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
  const schedule        = gapResult.schedule.map((entry, position) => ({
    ...entry,
    serviceIndex: perm[position],
  }));
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
    schedule,
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

  const baseMins = slotToMinutes(slot);

  /* ══════════════════════════════════════════════════════════════════════════
     ONE PROVIDER / MULTIPLE SERVICES
     All services in one category are performed sequentially by the selected
     provider. Do not reduce the service list to providers.length: that made a
     second service disappear whenever one provider was selected.
  ══════════════════════════════════════════════════════════════════════════ */
  if (providers.length === 1) {
    if (!providers[0]?.name) {
      return { status: 'booked', isSequenceSwapped: false, occupiedSlots: [] };
    }

    const totalDuration = services.reduce(
      (total, service) => total + parseDurationMins(service.duration),
      0,
    );
    const free = isProviderFreeFor(
      providers[0].name,
      baseMins,
      totalDuration,
      providerSlots,
    );
    const serviceSchedule = buildSequentialServiceSchedule(slot, providers, services);

    if (free) {
      const slots = buildOccupiedSlots([
        { startMins: baseMins, durationMins: totalDuration },
      ]);
      return {
        status: 'available',
        isSequenceSwapped: false,
        serviceSchedule,
        occupiedSlots: slots,
      };
    }

    /* Keep a conflicted start visible as a partial result when a later public
       slot can fit the full combined duration. This lets the existing
       recommendation modal use the same real duration instead of silently
       offering the first service only. */
    const recommendedOriginalTime = findRecommendedSingleProviderTime(
      slot,
      providers[0].name,
      totalDuration,
      providerSlots,
    );
    return {
      status: recommendedOriginalTime ? 'partial' : 'booked',
      isSequenceSwapped: false,
      recommendedOriginalTime,
      occupiedSlots: [],
    };
  }

  const pairCount       = Math.min(providers.length, services.length);
  const pairedProviders = providers.slice(0, pairCount);
  const pairedServices  = services.slice(0, pairCount);

  /* ══════════════════════════════════════════════════════════════════════════
     MULTI-SERVICE
  ══════════════════════════════════════════════════════════════════════════ */

  /* Step 1: Try original order */
  const originalCheck = checkSequence(baseMins, pairedProviders, pairedServices, providerSlots);

  if (originalCheck.ok) {
    const gapResult = calculateSequenceGap(
      baseMins,
      pairedProviders,
      pairedServices,
      providerSlots,
    );
    const slots = buildOccupiedSlots(gapResult.segments);
    return {
      status: 'available',
      isSequenceSwapped: false,
      serviceSchedule: gapResult.schedule,
      occupiedSlots: slots,
    };
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

      if (gapResult.complete && gapResult.gapMinutes > 0) {
        gapOnlyDetails = {
          gapMinutes:    gapResult.gapMinutes,
          busyUntil:     minutesToDisplay(fail.nextFreeAt),
          busyProvider:  fail.failProvider,
          busyService:   fail.failService,
          occupiedSlots: buildOccupiedSlots(gapResult.segments),
          schedule:      gapResult.schedule,
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
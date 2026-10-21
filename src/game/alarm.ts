// alarm.ts — the POI alarm ENGINE (SYSTEMS_SPEC §4.4, closing GAP §A's
// "never designed" item). Pure logic, no three/store imports: a
// registry of alarmed POIs, the trip/disarm state machine, and the
// event shape consumers execute. Interact.ts wires it to containers;
// Game-side effects (the 60m noise burst, the scout-pair spawn) drain
// from the registry's event queue — see the lane report's integration
// steps. POI *instances* ship with the POI wave (buildings are
// parked); per §4.4 the flagged set is: strip mall, military
// checkpoint, faction outposts — mode 'active'.

export type AlarmMode = 'silent' | 'active';
export type AlarmState = 'armed' | 'tripped' | 'disarmed';
export type AlarmTrigger = 'container_trip' | 'forced_entry';

export interface AlarmDef {
  poiId: string;
  mode: AlarmMode;
  /** Owning faction — a trip at their POI costs rep (they notice). */
  faction?: string;
}

export interface AlarmEvent {
  poiId: string;
  trigger: AlarmTrigger;
  effect: {
    /** Husks within this radius investigate the POI. */
    noiseRadius: 60;
    /** Two husks from the POI's zone spawn at its edge. */
    spawn: 'scout_pair';
    factionRep?: { faction: string; delta: -5 };
    toast: 'You hear an alarm winding up.';
  };
}

/** Disarm terms (§4.4): a tool kit in the pack, Mechanics 2, 30 seconds
 *  at the box. The seconds are the caller's hold-to-interact timer;
 *  the engine owns the requirements and the state flip. */
export const DISARM_SECONDS = 30;
export const DISARM_SKILL = 'mechanics';
export const DISARM_SKILL_LEVEL = 2;

export type DisarmCheck =
  | { ok: true }
  | { ok: false; reason: 'no_alarm' | 'not_armed' | 'no_toolkit' | 'low_skill' };

export class AlarmRegistry {
  private defs = new Map<string, AlarmDef>();
  private states = new Map<string, AlarmState>();
  /** Tripped events, in order — Game drains this to fire noise/spawns. */
  readonly events: AlarmEvent[] = [];

  register(def: AlarmDef): void {
    this.defs.set(def.poiId, def);
    if (!this.states.has(def.poiId)) this.states.set(def.poiId, 'armed');
  }

  registerAll(defs: AlarmDef[]): void {
    for (const d of defs) this.register(d);
  }

  /** The spec's flagged set. Instances bind when their POIs exist;
   *  until then the registry simply has nothing to trip. */
  static specDefs(): AlarmDef[] {
    return [
      { poiId: 'strip_mall', mode: 'active' },
      { poiId: 'military_checkpoint', mode: 'active', faction: 'remnants' },
    ];
  }

  has(poiId: string): boolean {
    return this.defs.has(poiId);
  }

  mode(poiId: string): AlarmMode | undefined {
    return this.defs.get(poiId)?.mode;
  }

  state(poiId: string): AlarmState | undefined {
    return this.states.get(poiId);
  }

  /**
   * Something crossed the wire. Only an ACTIVE, ARMED alarm answers —
   * silent POIs keep their secret, disarmed boxes stay quiet, and a
   * blown alarm doesn't blow twice. On a trip the event is queued for
   * the effect consumers and returned.
   */
  trip(poiId: string, trigger: AlarmTrigger): AlarmEvent | null {
    const def = this.defs.get(poiId);
    if (!def || def.mode !== 'active') return null;
    if (this.states.get(poiId) !== 'armed') return null;
    this.states.set(poiId, 'tripped');
    const ev: AlarmEvent = {
      poiId,
      trigger,
      effect: {
        noiseRadius: 60,
        spawn: 'scout_pair',
        ...(def.faction ? { factionRep: { faction: def.faction, delta: -5 as const } } : {}),
        toast: 'You hear an alarm winding up.',
      },
    };
    this.events.push(ev);
    return ev;
  }

  /** Can this survivor open the box and kill the alarm before it trips? */
  canDisarm(poiId: string, hasToolKit: boolean, mechanicsLevel: number): DisarmCheck {
    if (!this.defs.has(poiId)) return { ok: false, reason: 'no_alarm' };
    if (this.states.get(poiId) !== 'armed') return { ok: false, reason: 'not_armed' };
    if (!hasToolKit) return { ok: false, reason: 'no_toolkit' };
    if (mechanicsLevel < DISARM_SKILL_LEVEL) return { ok: false, reason: 'low_skill' };
    return { ok: true };
  }

  /** The 30 seconds are up and nobody shot you: the box goes dark. */
  disarm(poiId: string): boolean {
    if (this.states.get(poiId) !== 'armed') return false;
    this.states.set(poiId, 'disarmed');
    return true;
  }

  /** Re-arm (a restocked POI resets its wire on the respawn clock). */
  reset(poiId: string): void {
    if (this.defs.has(poiId)) this.states.set(poiId, 'armed');
  }
}

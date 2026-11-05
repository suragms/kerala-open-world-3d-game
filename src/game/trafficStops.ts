/** A bus may dwell once on a stop segment; expiry must allow it to leave that segment. */
export class TrafficStopDwell {
  private serviced = new WeakMap<object, { segment: string; until: number }>();
  reset(agent: object) { this.serviced.delete(agent); }
  waiting(agent: object, segment: string, eligible: boolean, time: number, seconds = 4) {
    let stop = this.serviced.get(agent);
    if (stop && stop.segment !== segment) { this.serviced.delete(agent); stop = undefined; }
    if (!stop && eligible) { stop = { segment, until: time + seconds }; this.serviced.set(agent,stop); }
    return Boolean(stop && time < stop.until);
  }
}

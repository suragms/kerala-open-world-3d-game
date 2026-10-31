import type { BusType } from "../types";

/** Original vehicle proportions; these are game classes, not manufacturer specifications. */
export const BUS_SPECS: Record<BusType, { length: number; seats: number; color: string; label: string }> = {
  public: { length: 9.2, seats: 20, color: "#a62e30", label: "PUBLIC" },
  private: { length: 8.6, seats: 20, color: "#1c8292", label: "LOCAL" },
  fast: { length: 10, seats: 20, color: "#cc4c2e", label: "FAST PASSENGER" },
  coach: { length: 10.8, seats: 20, color: "#e0dfc5", label: "AC COACH" },
  mini: { length: 6.5, seats: 12, color: "#d4a93b", label: "MINI" },
};
export const busScale = (type: BusType) => BUS_SPECS[type].length / 9.2;

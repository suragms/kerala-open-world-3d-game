import * as THREE from "three";
import { Human, VehicleModel, box, material, seeded } from "./assets";
import type { VehicleKind } from "./assets";
import { distance } from "./navigation";
import type { Road } from "./navigation";
import type { Vec2 } from "../types";
import { World } from "./world";
import { toLocal } from "../data/geography";

export interface TrafficAgent {
  model: VehicleModel;
  road: Road;
  segment: number;
  t: number;
  speed: number;
  direction: number;
}
export interface Pedestrian {
  human: Human;
  a: Vec2;
  b: Vec2;
  progress: number;
  direction: number;
  name: string;
}
export class TrafficManager {
  agents: TrafficAgent[] = [];
  pedestrians: Pedestrian[] = [];
  root = new THREE.Group();
  train?: THREE.Group;
  private trainPoints: Vec2[] = [];
  private trainDistance = 0;
  private trainLength = 0;
  private trainAltitude = 0;
  private agentDwellUntil = new Map<TrafficAgent, number>();
  private trainDwellUntil = 0;
  private stationPositions: Vec2[] = [];
  constructor(public world: World) {
    world.scene.add(this.root);
    const rng = seeded(world.region.id.length * 1821),
      roads = world.roads.filter((r) => r.width >= 6 && r.points.length > 2);
    const pool = roads.length ? roads : world.roads;
    const count = world.settings.quality === "low" ? 6 : 12;
    for (let i = 0; i < count && pool.length; i++) {
      const road = pool[Math.floor(rng() * pool.length)],
        kind: VehicleKind =
          i % 6 === 0
            ? "Bus"
            : i % 4 === 0
              ? "Auto rickshaw"
              : i % 3 === 0
                ? "Scooter"
                : "Hatchback";
      const model = new VehicleModel(
        kind,
        ["#a0a89b", "#e4d6b7", "#386c62", "#aa6549", "#b2b4ad"][i % 5],
      );
      const a = {
        model,
        road,
        segment: 1,
        t: rng(),
        speed: 4 + rng() * 4,
        direction: road.oneway ? 1 : i % 2 ? 1 : -1,
      };
      this.agents.push(a);
      this.root.add(model.root);
    }
    const primary = world.network.nearest(world.spawn)?.road;
    for (let i = 0; i < (world.settings.quality === "low" ? 3 : 8); i++) {
      const road =
        i < 5 && primary ? primary : pool[Math.floor(rng() * pool.length)];
      if (!road) continue;
      const index = Math.min(
          road.points.length - 1,
          1 + Math.floor(rng() * (road.points.length - 1)),
        ),
        a = road.points[index - 1],
        b = road.points[index],
        length = distance(a, b);
      if (length < 5) continue;
      const ox = (-(b.z - a.z) / length) * (road.width / 2 + 1.7),
        oz = ((b.x - a.x) / length) * (road.width / 2 + 1.7),
        pa = { x: a.x + ox, z: a.z + oz },
        pb = { x: b.x + ox, z: b.z + oz };
      if (world.collisions.blocked(pa) || world.collisions.blocked(pb))
        continue;
      const human = new Human({
        gender: i % 2 ? "female" : "male",
        skin: ["#8e5537", "#b57e55", "#794a35"][i % 3],
        shirt: ["#c6b88f", "#bd8665", "#597b78", "#a4b7a4"][i % 4],
        pants: i % 2 ? "#ab6657" : "#dad0ac",
        shoes: "#3b3027",
        hair: i % 2 ? "long" : "short",
      });
      this.pedestrians.push({
        human,
        a: pa,
        b: pb,
        progress: rng(),
        direction: 1,
        name: ["Anil · local guide", "Meera · traveller", "Rajan · shopkeeper"][
          i % 3
        ],
      });
      this.root.add(human.root);
    }
    // Keep the arrival area inhabited even when the nearest imported pavement is far away.
    for (let angle = 0; angle < Math.PI * 2; angle += 0.45) {
      const a = {
        x: world.spawn.x + Math.cos(angle) * 6,
        z: world.spawn.z + Math.sin(angle) * 6,
      };
      const b = {
        x: world.spawn.x + Math.cos(angle) * 12,
        z: world.spawn.z + Math.sin(angle) * 12,
      };
      const blocked = Array.from({ length: 9 }, (_, i) => ({
        x: a.x + ((b.x - a.x) * i) / 8,
        z: a.z + ((b.z - a.z) * i) / 8,
      })).some((p) => world.collisions.blocked(p, 0.6));
      if (blocked) continue;
      const human = new Human({
        gender: "female",
        skin: "#a96c48",
        shirt: "#ba8a6a",
        pants: "#e2d3ae",
        shoes: "#382d24",
        hair: "long",
      });
      this.pedestrians.push({
        human,
        a,
        b,
        progress: 0.1,
        direction: 1,
        name: "Meera · local guide",
      });
      this.root.add(human.root);
      break;
    }
    const rail =
      world.railways.find((p) => p.length > 3) ??
      world.metroTracks.find((p) => p.length > 3);
    this.trainAltitude = world.railways.includes(rail ?? []) ? 0 : 7.5;
    if (rail && world.region.id !== "idukki" && world.region.id !== "wayanad") {
      this.trainPoints = rail;
      this.trainLength = rail
        .slice(1)
        .reduce((s, p, i) => s + distance(p, rail[i]), 0);
      this.train = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const coach = new THREE.Group();
        box(coach, material(i ? "#b3b7a3" : "#955644"), 0, 1.8, 0, 2.8, 3, 13);
        for (let z = -5; z < 6; z += 2)
          for (const x of [-1.42, 1.42])
            box(coach, material("#3a4a4c"), x, 2.2, z, 0.05, 0.9, 1.1);
        coach.position.z = i * 14;
        this.train.add(coach);
      }
      this.root.add(this.train);
    }
    // Station positions for train dwell behaviour
    this.stationPositions = world.tile.features
      .filter(
        (f) =>
          f.tags.railway === "station" ||
          f.tags.railway === "halt" ||
          f.tags.railway === "stop",
      )
      .flatMap((f) =>
        f.points.map((p) => toLocal(p as [number, number], world.tile.origin)),
      );
    // Airport passenger NPCs
    if (world.region.theme === "airport") {
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2;
        const a = {
          x: world.spawn.x + Math.cos(angle) * 8,
          z: world.spawn.z + Math.sin(angle) * 8,
        };
        const b = {
          x: world.spawn.x + Math.cos(angle) * 18,
          z: world.spawn.z + Math.sin(angle) * 18,
        };
        if (world.collisions.blocked(a) || world.collisions.blocked(b)) continue;
        const human = new Human({
          gender: i % 2 ? "female" : "male",
          skin: ["#8e5537", "#b57e55", "#c9a882"][i % 3],
          shirt: ["#3a5f6e", "#7a8b6f", "#c2b48e"][i % 3],
          pants: i % 2 ? "#4a5c68" : "#9b9278",
          shoes: "#3b3027",
          hair: i % 2 ? "long" : "short",
        });
        this.pedestrians.push({
          human,
          a,
          b,
          progress: i * 0.33,
          direction: 1,
          name: ["Passenger · departing", "Traveller · arrivals", "Airport staff"][
            i % 3
          ],
        });
        this.root.add(human.root);
      }
    }
  }
  update(dt: number, time: number, player: Vec2) {
    for (const agent of this.agents) {
      const { road, model } = agent;
      let a = road.points[agent.segment - 1],
        b = road.points[agent.segment],
        len = distance(a, b) || 1;
      const close = this.agents.some(
        (other) =>
          other !== agent &&
          other.road === road &&
          other.direction === agent.direction &&
          distance(other.model.root.position, model.root.position) < 10 &&
          ((other.segment - agent.segment) * agent.direction > 0 ||
            (other.t - agent.t) * agent.direction > 0),
      );
      const playerClose = distance(model.root.position, player) < 4;
      const signal =
        road.points.length > 4 &&
        agent.segment % 7 === 0 &&
        Math.floor(time / 9) % 2 === 0 &&
        agent.t > 0.72;

      // Bus dwell at bus stops
      let atBusStop = false;
      if (agent.model.kind === "Bus") {
        const dwell = this.agentDwellUntil.get(agent) ?? 0;
        if (time < dwell) {
          atBusStop = true;
        } else {
          if (dwell > 0 && time >= dwell) this.agentDwellUntil.delete(agent);
          const currentPos = {
            x: road.points[agent.segment - 1]?.x ?? 0,
            z: road.points[agent.segment - 1]?.z ?? 0,
          };
          const nearStop =
            (this.world as unknown as { busStopPositions?: Vec2[] }).busStopPositions?.some(
              (s) => distance(s, currentPos) < 12,
            ) ?? false;
          if (nearStop && agent.t > 0.3 && agent.t < 0.75) {
            this.agentDwellUntil.set(agent, time + 4);
            atBusStop = true;
          }
        }
      }

      const rate = atBusStop || close || playerClose || signal ? 0 : agent.speed;
      agent.t += (agent.direction * rate * dt) / len;
      if (agent.t > 1) {
        agent.t = 0;
        agent.segment++;
        if (agent.segment >= road.points.length) {
          agent.segment = 1;
          agent.t = 0;
        }
      }
      if (agent.t < 0) {
        agent.segment--;
        agent.t = 1;
        if (agent.segment < 1) {
          agent.segment = road.points.length - 1;
          agent.t = 1;
        }
      }
      a = road.points[agent.segment - 1];
      b = road.points[agent.segment];
      len = distance(a, b) || 1;
      const dx = (b.x - a.x) / len,
        dz = (b.z - a.z) / len,
        lane = Math.min(2, road.width * 0.24);
      const x = a.x + (b.x - a.x) * agent.t + dz * lane * agent.direction,
        z = a.z + (b.z - a.z) * agent.t - dx * lane * agent.direction;
      model.root.position.set(x, this.world.height(x, z), z);
      model.root.rotation.y = Math.atan2(
        -dx * agent.direction,
        -dz * agent.direction,
      );
      model.root.visible = distance(player, model.root.position) < 330;
      model.animate(rate, rate === 0, dt);
    }
    for (const p of this.pedestrians) {
      const len = distance(p.a, p.b) || 1;
      if (((Math.floor(time + p.a.x) % 15) + 15) % 15 > 2)
        p.progress += (p.direction * dt * 0.85) / len;
      if (p.progress > 1) {
        p.progress = 1;
        p.direction = -1;
      }
      if (p.progress < 0) {
        p.progress = 0;
        p.direction = 1;
      }
      const x = p.a.x + (p.b.x - p.a.x) * p.progress,
        z = p.a.z + (p.b.z - p.a.z) * p.progress;
      const valid = !this.world.collisions.blocked({ x, z });
      if (valid) p.human.root.position.set(x, this.world.height(x, z), z);
      p.human.root.rotation.y = Math.atan2(
        (p.b.x - p.a.x) * p.direction,
        (p.b.z - p.a.z) * p.direction,
      );
      p.human.animate(time, 0.85, 0);
      p.human.root.visible =
        valid && distance(player, p.human.root.position) < 180;
    }
    if (this.train && this.trainLength > 50) {
      const trainPos = this.train.children[0]?.position;
      const atStation =
        trainPos &&
        this.stationPositions.some(
          (s) => distance({ x: trainPos.x, z: trainPos.z }, s) < 24,
        );
      const stationDwellActive = (this.trainDwellUntil ?? 0) > time;
      if (atStation && !stationDwellActive && !this.trainDwellUntil) {
        this.trainDwellUntil = time + 6;
      }
      if (time >= (this.trainDwellUntil ?? 0) && !atStation)
        this.trainDwellUntil = 0;
      const pause = (this.trainDwellUntil ?? 0) > time;

      if (!pause)
        this.trainDistance = (this.trainDistance + dt * 8) % this.trainLength;
      for (let c = 0; c < this.train.children.length; c++) {
        let d = (this.trainDistance + c * 14) % this.trainLength;
        for (let i = 1; i < this.trainPoints.length; i++) {
          const a = this.trainPoints[i - 1],
            b = this.trainPoints[i],
            len = distance(a, b);
          if (d <= len) {
            const t = d / len,
              x = a.x + (b.x - a.x) * t,
              z = a.z + (b.z - a.z) * t;
            this.train.children[c].position.set(
              x,
              this.world.height(x, z) + 0.25 + this.trainAltitude,
              z,
            );
            this.train.children[c].rotation.y = Math.atan2(
              a.x - b.x,
              -b.z + a.z,
            );
            break;
          }
          d -= len;
        }
      }
    }
  }
}

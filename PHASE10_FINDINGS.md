# Phase 10 implementation findings

Inspected commit: `66a1347c609ef70d2a231f8146c715a8bacbe72a`. Phase 9 code is present; baseline checks are recorded separately before integration of these changes.

| ID | Evidence / reproduction | Correction / regression |
|---|---|---|
| P10-01 | GameView derives attachment from phase names and omits `opening`; a seated passenger temporarily receives boarding controls at intermediate stops | Use the journey's authoritative attached flag; browser stop-opening regression |
| P10-02 | Forward/Reverse HUD buttons capture the pointer, while steering listens only to canvas movement | Track captured pedal movement through the shared input layer; pointer lifecycle and reverse-steering tests |
| P10-03 | Vehicle update treats `device === keyboard` as mouse driving whenever the movement preference is mouse | Select driving input by the active device, preserving all modes; browser mouse-to-keyboard transition |
| P10-04 | Pedestrian progress advances before testing one destination point; clear endpoints can conceal an intervening building; animation always uses walking speed | Validate whole spawn paths, sweep movement, wait for approaching vehicles and animate actual movement; blocked-middle, thin-wall and crossing regressions |
| P10-05 | Traffic wraps `segment` from the last point to the first with no connection; its movement ignores building/water/body collisions and changes instantly between cruise and zero | Bounded lane movement, connected continuation, braking/headway/yield states and swept vehicle footprints |
| P10-06 | Building windows use bounding-box `maxZ`, regardless of the actual rotated/concave footprint | Place bounded facade detail on sourced edges and align roofs with eligible footprints; geometry regressions |
| P10-07 | The minimap label uses the origin region during corridor journeys; on-foot restores lose the arrival's locality name | Use current locality and persist a validated checkpoint name; destination/reload checks |
| P10-08 | Geometry baking merges every same-material mesh in one indivisible operation; Phase 9 reported a 15.2 ms work slice despite a soft 4 ms budget | Bound merge batches, retain shared resources and cancellation cleanup; geometry/budget tests and real-frame profiling |
| P10-09 | Bus red-signal detection starts within 16 m, while its braking distance at route speed can exceed that range | Predict a stop line from available braking distance and leading vehicles; deterministic approach tests |
| P10-10 | The explicit Board bus button invokes generic interaction and can select a nearer pedestrian | Give boarding its own bus target; a ready passenger door also takes priority for untargeted keyboard/controller interaction |
| P10-11 | A repeated source road coordinate produces a zero-length furniture tangent, creating NaN lamp geometry near Guruvayur | Retain the source data and skip furniture on the degenerate edge; finite-geometry regression and error-strict Full Journey rerun |
| P10-12 | The coach's continuous opaque side trim occupies the window-camera sightline | Move the trim above the aperture; side-window ray tests for all five passenger-bus models and interdistrict camera captures |
| P10-13 | A straight-ahead braking strip can mistake a vehicle beside a curved route for an obstruction | Test predicted bus footprints along the actual upcoming track; adjacent-vehicle and braking regressions |
| P10-14 | OSRM's six-decimal duplicates differ by centimetres from their original OSM vertices, leaving traffic stranded at false endpoints | Allow at most 16 cm only for explicitly derived, same-name, same-layer duplicates; independent nearby ways remain disconnected |
| P10-15 | Stop is conditional on a destination and can disappear as held movement releases, interrupting a mouse user's click | Keep Stop available throughout on-foot Mouse movement mode; idle-control and complete character regressions |

Enhancements also target regional scenery, recognizable Level C landmark silhouettes, bus facilities, route previews, adaptive resolution and clearer loading feedback. Neither unsupported continuous routes nor Level A reconstructions are to be invented.

Integration testing also established a simulation limit: full city traffic negotiation through narrow bends is not reliable enough for passenger journeys. During an active Full Journey, background traffic respects a conservative priority envelope around its checked track, including rotation clearance at bends. The envelope is released when the passenger exits. This rule does not add a road, bypass a collision, move the bus off its track or substitute Fast Journey. Traffic can stop at blocked/disconnected roads elsewhere; autonomous rerouting and a full right-of-way solver remain limitations.

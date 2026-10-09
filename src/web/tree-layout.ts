// o9vr: the crafting tree's PURE graph layout (no DOM, no game state) — Civ-style tier
// columns, left → right. Input: item nodes (one per craftable output, with its tier, a
// "lane" that groups kinds — tools / weapons / armour / food / … — and a stable catalog
// order) and item → item edges (an ingredient that is itself on the tree, or the
// tool/station a recipe needs). Output: pixel boxes for every node, a fog node per tier,
// tier bands, and ORTHOGONAL connector routes.
//
// It is a small Sugiyama layout:
//   1. layers — a node sits in its tier's columns, right of everything (same/lower tier) that feeds it;
//      a crowded tier spreads over extra sub-columns so it grows wide, not tall;
//   2. a long edge becomes a chain of dummy cells — one TRUNK per source, shared by all its targets;
//   3. order within a column by barycenter sweeps (cuts crossings);
//   4. rows: each node is pulled to the median row of its neighbours so most edges run straight;
//   5. loose (unconnected) nodes fill the free rows of their tier, grouped by lane;
//   6. routes: horizontal out of a node → vertical in the gutter → horizontal into the next
//      column; sources feeding exactly the same set share one gutter track.
// Everything is deterministic (stable sorts over the given order), so the tree never jumps.

export type GNode = { id: string; tier: number; lane: number; ord: number };
export type GEdge = { s: string; t: string; kind: "in" | "tool" };
export type Pt = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };
export type PlacedNode = Box & { id: string; col: number; row: number; tier: number };
export type FogNode = Box & { tier: number; n: number; col: number; row: number };
export type TierBand = { tier: number; col0: number; cols: number; x: number; w: number; known: number; hidden: number };
/** One drawn piece of connector between adjacent columns. `edges` = the "s>t" edges
 *  that run along it (a shared trunk carries several), for path highlighting. */
export type Route = { key: string; kind: "in" | "tool"; pts: Pt[]; edges: string[] };
export type GraphLayout = {
  nodes: Record<string, PlacedNode>;
  fogs: FogNode[];
  tiers: TierBand[];
  routes: Route[];
  edges: GEdge[]; // the edges that are drawn (a feeder from a HIGHER tier can't sit left of its user — it isn't drawn)
  W: number;
  H: number;
};

export const TREE_GEOM = { nodeW: 138, nodeH: 44, colW: 196, rowH: 54, top: 44, left: 14, rowsTarget: 8 } as const;
export type Geom = { nodeW: number; nodeH: number; colW: number; rowH: number; top: number; left: number; rowsTarget: number };

const push = <K, V>(m: Map<K, V[]>, k: K, v: V): void => { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); };

export function layoutGraph(nodesIn: readonly GNode[], edgesIn: readonly GEdge[], hidden: Readonly<Record<number, number>> = {}, g: Geom = TREE_GEOM): GraphLayout {
  const byId = new Map(nodesIn.map((n) => [n.id, n]));
  // de-dup edges (one per s>t; an ingredient beats a tool use), drop self/unknown ends
  const edgeMap = new Map<string, GEdge>();
  for (const e of edgesIn) {
    if (e.s === e.t || !byId.has(e.s) || !byId.has(e.t)) continue;
    const k = `${e.s}>${e.t}`;
    const prev = edgeMap.get(k);
    if (!prev || (prev.kind === "tool" && e.kind === "in")) edgeMap.set(k, e);
  }
  const E = [...edgeMap.values()];
  const preds = new Map<string, GEdge[]>();
  for (const e of E) push(preds, e.t, e);

  // 1. layers ---------------------------------------------------------------
  const tiers = [...new Set([...nodesIn.map((n) => n.tier), ...Object.keys(hidden).filter((t) => (hidden[Number(t)] ?? 0) > 0).map(Number)])].sort((a, b) => a - b);
  const L = new Map<string, number>(), tierStart = new Map<number, number>(), tierWidth = new Map<number, number>();
  let start = 0;
  for (const t of tiers) {
    tierStart.set(t, start);
    const inTier = nodesIn.filter((n) => n.tier === t);
    const lay = (id: string, stack: Set<string>): number => {
      const have = L.get(id);
      if (have !== undefined) return have;
      stack.add(id);
      let l = start;
      for (const e of preds.get(id) ?? []) {
        const p = byId.get(e.s)!;
        if (p.tier > t || stack.has(e.s)) continue; // a higher-tier feeder (or a cycle) can't sit left: not drawn
        l = Math.max(l, (p.tier < t ? L.get(e.s)! : lay(e.s, stack)) + 1);
      }
      stack.delete(id);
      L.set(id, l);
      return l;
    };
    for (const n of inTier) lay(n.id, new Set());
    const deep = Math.max(start, ...inTier.map((n) => L.get(n.id)!)) - start + 1;
    const width = Math.max(1, deep, Math.ceil(inTier.length / g.rowsTarget));
    tierWidth.set(t, width);
    start += width;
  }
  const nCols = start;
  const edges = E.filter((e) => L.get(e.t)! > L.get(e.s)!);

  // 2. trunks: one dummy chain per source across the columns it has to cross ---------
  type LNode = { id: string; layer: number; dummy: boolean; lane: number; ord: number };
  const nodes = new Map<string, LNode>();
  for (const n of nodesIn) nodes.set(n.id, { id: n.id, layer: L.get(n.id)!, dummy: false, lane: n.lane, ord: n.ord });
  type Seg = { u: string; v: string; kind: "in" | "tool"; edges: string[] };
  const segs = new Map<string, Seg>();
  const addSeg = (u: string, v: string, kind: "in" | "tool", edge: string) => {
    const k = `${u}>${v}`;
    const s = segs.get(k);
    if (s) { s.edges.push(edge); if (kind === "in") s.kind = "in"; } else segs.set(k, { u, v, kind, edges: [edge] });
  };
  const bySrc = new Map<string, GEdge[]>();
  for (const e of edges) push(bySrc, e.s, e);
  for (const [s, es] of bySrc) {
    const ls = L.get(s)!, src = nodes.get(s)!;
    const far = Math.max(...es.map((e) => L.get(e.t)!));
    const d = (k: number) => (k === ls ? s : `~${s}~${k}`);
    for (let k = ls + 1; k < far; k++) nodes.set(d(k), { id: d(k), layer: k, dummy: true, lane: src.lane, ord: src.ord });
    for (const e of es) {
      const ek = `${e.s}>${e.t}`, lt = L.get(e.t)!;
      for (let k = ls; k < lt - 1; k++) addSeg(d(k), d(k + 1), e.kind, ek);
      addSeg(d(lt - 1), e.t, e.kind, ek);
    }
  }
  const up = new Map<string, string[]>(), down = new Map<string, string[]>();
  for (const sg of segs.values()) { push(down, sg.u, sg.v); push(up, sg.v, sg.u); }
  const connected = (id: string) => up.has(id) || down.has(id);

  // 3. order within each column (barycenter sweeps) -------------------------------
  const cols: string[][] = Array.from({ length: nCols }, () => []);
  for (const n of nodes.values()) if (connected(n.id)) cols[n.layer]!.push(n.id);
  const nd = (id: string) => nodes.get(id)!;
  for (const c of cols) c.sort((a, b) => nd(a).lane - nd(b).lane || nd(a).ord - nd(b).ord);
  const idx = new Map<string, number>();
  cols.forEach((c) => c.forEach((id, i) => idx.set(id, i)));
  const bary = (id: string, nb: Map<string, string[]>) => {
    const ns = nb.get(id);
    return ns?.length ? ns.reduce((a, x) => a + idx.get(x)!, 0) / ns.length : idx.get(id)!;
  };
  const sweepOrder = (dn: boolean) => (dn ? cols.map((_, i) => i) : cols.map((_, i) => nCols - 1 - i));
  for (let sweep = 0; sweep < 12; sweep++) {
    const dn = sweep % 2 === 0;
    for (const c of sweepOrder(dn)) {
      const col = cols[c]!;
      const b = new Map(col.map((id) => [id, bary(id, dn ? up : down)]));
      col.sort((x, y) => b.get(x)! - b.get(y)!);
      col.forEach((id, i) => idx.set(id, i));
    }
  }

  // 4. rows: pull each node toward the median row of its neighbours -----------------
  const row = new Map<string, number>();
  cols.forEach((c) => c.forEach((id, i) => row.set(id, i)));
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
  };
  // The priority method: within a column, trunks (dummies) place first, then nodes by how
  // many neighbours pull on them; each goes to its wanted row as far as the already-placed
  // (higher-priority) nodes and the column order allow.
  for (let pass = 0; pass < 12; pass++) {
    const dn = pass % 2 === 0;
    for (const c of sweepOrder(dn)) {
      const col = cols[c]!;
      if (!col.length) continue;
      const nbOf = (id: string) => (dn ? up : down).get(id) ?? (dn ? down : up).get(id);
      const want = col.map((id) => { const nb = nbOf(id); return nb ? Math.round(median(nb.map((x) => row.get(x)!))) : row.get(id)!; });
      const prio = col.map((id) => (nd(id).dummy ? 1e6 : 0) + (nbOf(id)?.length ?? 0));
      const order = col.map((_, i) => i).sort((a, b) => prio[b]! - prio[a]! || a - b);
      const y: (number | undefined)[] = col.map(() => undefined);
      for (const i of order) {
        let lo = i, hi = Infinity; // row ≥ i keeps room for the nodes above it
        for (let j = i - 1; j >= 0; j--) if (y[j] !== undefined) { lo = Math.max(lo, y[j]! + (i - j)); break; }
        for (let j = i + 1; j < col.length; j++) if (y[j] !== undefined) { hi = y[j]! - (j - i); break; }
        y[i] = Math.min(hi, Math.max(lo, want[i]!));
      }
      col.forEach((id, i) => row.set(id, y[i]!));
    }
  }
  // squeeze out rows nothing connected uses (keeps every straight edge straight)
  const remap = new Map([...new Set(row.values())].sort((a, b) => a - b).map((r, i) => [r, i]));
  for (const [k, v] of row) row.set(k, remap.get(v)!);

  // 5. loose nodes fill the free rows of their tier, a column at a time, grouped by lane
  const used = cols.map((c) => new Set(c.map((id) => row.get(id)!)));
  const loose = [...nodes.values()].filter((n) => !n.dummy && !connected(n.id)).sort((a, b) => a.lane - b.lane || a.ord - b.ord);
  for (const n of loose) {
    const t = byId.get(n.id)!.tier, c0 = tierStart.get(t)!, w = tierWidth.get(t)!;
    let best = c0;
    for (let c = c0; c < c0 + w; c++) {
      if (used[c]!.size < g.rowsTarget) { best = c; break; }
      if (used[c]!.size < used[best]!.size) best = c;
    }
    n.layer = best;
    let r = 0;
    while (used[best]!.has(r)) r++;
    used[best]!.add(r);
    row.set(n.id, r);
    cols[best]!.push(n.id);
  }
  const maxRow = Math.max(-1, ...[...nodes.values()].map((n) => row.get(n.id)!));
  const fogRow = maxRow + 1;

  // geometry -----------------------------------------------------------------
  const X = (c: number) => g.left + c * g.colW, Y = (r: number) => g.top + r * g.rowH;
  const placed: Record<string, PlacedNode> = {};
  for (const n of nodesIn) {
    const ln = nodes.get(n.id)!;
    placed[n.id] = { id: n.id, tier: n.tier, col: ln.layer, row: row.get(n.id)!, x: X(ln.layer), y: Y(row.get(n.id)!), w: g.nodeW, h: g.nodeH };
  }
  const fogs: FogNode[] = tiers.filter((t) => (hidden[t] ?? 0) > 0).map((t) => ({ tier: t, n: hidden[t]!, col: tierStart.get(t)!, row: fogRow, x: X(tierStart.get(t)!), y: Y(fogRow), w: g.nodeW, h: g.nodeH }));
  const gut = g.colW - g.nodeW;
  const bands: TierBand[] = tiers.map((t) => ({
    tier: t, col0: tierStart.get(t)!, cols: tierWidth.get(t)!,
    x: X(tierStart.get(t)!) - gut / 2, w: tierWidth.get(t)! * g.colW,
    known: nodesIn.filter((n) => n.tier === t).length, hidden: hidden[t] ?? 0,
  }));

  // 6. routes: gutter tracks — sources feeding exactly the same set share one -----
  const segList = [...segs.values()];
  const layerOf = (id: string) => nodes.get(id)!.layer;
  const byGut = new Map<number, string[]>();
  for (const sg of segList) if (row.get(sg.u) !== row.get(sg.v)) { const l = layerOf(sg.u); const a = byGut.get(l); if (!a) byGut.set(l, [sg.u]); else if (!a.includes(sg.u)) a.push(sg.u); }
  const track = new Map<string, number>();
  for (const [l, us] of byGut) {
    const sig = (u: string) => (down.get(u) ?? []).slice().sort().join(",");
    const groups = new Map<string, string[]>();
    for (const u of us) push(groups, sig(u), u);
    const arr = [...groups.values()].sort((a, b) => Math.min(...a.map((u) => row.get(u)!)) - Math.min(...b.map((u) => row.get(u)!)) || (a[0]! < b[0]! ? -1 : 1));
    const gx0 = X(l) + g.nodeW;
    arr.forEach((grp, i) => grp.forEach((u) => track.set(`${u}@${l}`, Math.round(gx0 + (gut * (i + 1)) / (arr.length + 1)))));
  }
  const routes: Route[] = segList.map((sg) => {
    const l = layerOf(sg.u);
    const y1 = Y(row.get(sg.u)!) + g.nodeH / 2, y2 = Y(row.get(sg.v)!) + g.nodeH / 2;
    const x1 = X(l) + g.nodeW;
    const x2 = nodes.get(sg.v)!.dummy ? X(l + 1) + g.nodeW + 2 : X(l + 1); // a trunk runs on through its empty cell
    const pts: Pt[] = y1 === y2 ? [{ x: x1, y: y1 }, { x: x2, y: y2 }] : (() => {
      const tx = track.get(`${sg.u}@${l}`)!;
      return [{ x: x1, y: y1 }, { x: tx, y: y1 }, { x: tx, y: y2 }, { x: x2, y: y2 }];
    })();
    return { key: `${sg.u}>${sg.v}`, kind: sg.kind, pts, edges: sg.edges };
  });

  return { nodes: placed, fogs, tiers: bands, routes, edges, W: X(nCols) + 10, H: Y(fogRow + 1) + 20 };
}

/** An SVG path `d` for a route's polyline. */
export const routeD = (r: Route): string => r.pts.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");

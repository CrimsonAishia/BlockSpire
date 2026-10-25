// Slay-the-Spire style branching map per act.
import type { Rng } from '../core/rng.ts';
import type { ActMap, MapNode, NodeType } from '../core/types.ts';
import { difficultyPolicy } from '../data/difficulty.ts';

export const MAP_ROWS = 13; // rows 0..12, boss at row 13
export const MAP_COLS = 7;

/** `omen` ≥ 1 (不祥之兆 I): elites are more common and can show up from row 3. */
export function generateMap(rng: Rng, act: number, bossId: string, omen = 0): ActMap {
  const grid: (MapNode | null)[][] = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLS).fill(null));
  const edges = new Set<string>();
  const ensure = (r: number, c: number) => {
    if (!grid[r][c]) grid[r][c] = { id: `${r}_${c}`, row: r, col: c, type: 'battle', next: [], x: c + rng.range(-0.18, 0.18) };
    return grid[r][c]!;
  };
  const crosses = (r: number, c: number, nc: number) => {
    // An edge (r,c)->(r+1,nc) crosses (r,c+d)->(r+1,nc-d) style edges.
    if (nc === c) return false;
    const a = `${r}_${nc}>${r + 1}_${c}`;
    return edges.has(a);
  };
  let firstStart = -1;
  for (let p = 0; p < 6; p++) {
    let c = rng.int(0, MAP_COLS - 1);
    if (p === 1) while (c === firstStart) c = rng.int(0, MAP_COLS - 1);
    if (p === 0) firstStart = c;
    for (let r = 0; r < MAP_ROWS; r++) {
      const node = ensure(r, c);
      if (r === MAP_ROWS - 1) break;
      let nc = c;
      for (let tries = 0; tries < 6; tries++) {
        nc = Math.max(0, Math.min(MAP_COLS - 1, c + rng.int(-1, 1)));
        if (!crosses(r, c, nc)) break;
        nc = c;
      }
      const key = `${r}_${c}>${r + 1}_${nc}`;
      if (!edges.has(key)) {
        edges.add(key);
        node.next.push(`${r + 1}_${nc}`);
      }
      c = nc;
    }
  }
  const nodes: Record<string, MapNode> = {};
  for (const row of grid) for (const n of row) if (n) nodes[n.id] = n;

  // Parents for constraint checks.
  const parents: Record<string, string[]> = {};
  for (const n of Object.values(nodes)) for (const nx of n.next) (parents[nx] ??= []).push(n.id);

  const ordered = Object.values(nodes).sort((a, b) => a.row - b.row || a.col - b.col);
  const policy = difficultyPolicy(omen);
  const gateRows = new Set<number>();
  if (policy.requiredEliteGates === 1) {
    gateRows.add(rng.int(7, 10));
  } else if (policy.requiredEliteGates >= 2) {
    if (act === 1) {
      // Act 1 developmental pacing: Gate 1 is fixed at row 5 (right before row 6 treasure),
      // avoiding unfair checkmates on rows 3-4 and giving players floors 0-4 to establish their core.
      rng.int(3, 5); // consume RNG call to preserve stream determinism
      gateRows.add(5);
      gateRows.add(rng.int(8, 10));
    } else {
      gateRows.add(rng.int(3, 5));
      gateRows.add(rng.int(8, 10));
    }
  }

  for (const n of ordered) {
    if (gateRows.has(n.row)) {
      n.type = 'elite';
    } else if (n.row === 0) {
      n.type = 'battle';
    } else if (n.row === 6) {
      n.type = 'treasure';
    } else if (n.row === MAP_ROWS - 1) {
      n.type = 'rest';
    } else {
      const pTypes = (parents[n.id] ?? []).map((id) => nodes[id].type);
      const siblings = (parents[n.id] ?? []).flatMap((id) => nodes[id].next).filter((id) => id !== n.id && nodes[id].row === n.row);
      const sibTypes = siblings.map((id) => nodes[id].type);
      const opts: NodeType[] = [];
      const w: number[] = [];
      const add = (t: NodeType, weight: number) => {
        if (weight <= 0) return;
        let wt = weight;
        if (sibTypes.includes(t) && t !== 'battle') wt *= 0.3;
        opts.push(t);
        w.push(wt);
      };
      add('battle', 45);
      add('event', 22);
      const isAdjToGate = gateRows.has(n.row - 1) || gateRows.has(n.row + 1);
      const prevRowHasElite = ordered.some((m) => m.row === n.row - 1 && m.type === 'elite');
      if (!isAdjToGate && !prevRowHasElite && n.row >= (policy.omen >= 1 ? 3 : 4) && !pTypes.includes('elite')) {
        add('elite', policy.eliteWeight);
      }
      if (n.row >= 4 && n.row !== MAP_ROWS - 2 && !pTypes.includes('rest')) add('rest', 11);
      if (n.row >= 2 && !pTypes.includes('shop')) add('shop', 9);
      n.type = rng.weighted(opts, w);
    }
  }
  // A rift into the Sift opens somewhere in the middle of the Nether and the End.
  if (act === 2 || act === 3) {
    const cands = ordered.filter((n) => n.row >= 3 && n.row <= 10 && n.row !== 6 && (n.type === 'battle' || n.type === 'event'));
    if (cands.length && rng.chance(0.8)) rng.pick(cands).type = 'rift';
  }
  const boss: MapNode = { id: 'boss', row: MAP_ROWS, col: 3, type: 'boss', next: [], x: 3, ref: bossId };
  nodes.boss = boss;
  for (const n of Object.values(nodes)) if (n.row === MAP_ROWS - 1) n.next = ['boss'];
  return { act, nodes, rows: MAP_ROWS, bossId };
}

export function startNodes(map: ActMap): MapNode[] {
  return Object.values(map.nodes).filter((n) => n.row === 0);
}

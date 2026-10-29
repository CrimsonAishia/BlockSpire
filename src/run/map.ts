// Slay-the-Spire style branching map per act.
import type { Rng } from '../core/rng.ts';
import type { ActMap, MapNode, NodeType } from '../core/types.ts';
import { difficultyPolicy } from '../data/difficulty.ts';

export const MAP_ROWS = 13; // rows 0..12, boss at row 13
export const MAP_COLS = 7;

/** `omen` ≥ 1 (不祥之兆 I): elites are more common and can show up from row 3. */
export function generateMap(rng: Rng, act: number, bossId: string, omen = 0, placedTacticsCount = 0): ActMap {
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
  // 必经精英闸门梯度配置：
  // - Act 1 (发展期)：0 场必经精英，必须留出非精英路线供玩家发育并绕行；
  // - Act 2 (过渡期)：必须经过 1 场精英战（即使是不祥 V 也由 2 场下调为 1 场平滑过渡）；
  // - Act 3+ (后续终局)：恢复完整必经精英闸门配置（不祥 III–IV 为 1 场，不祥 V 为 2 场）。
  const effectiveGates = act === 1 ? 0 : act === 2 ? Math.min(1, policy.requiredEliteGates) : policy.requiredEliteGates;

  if (effectiveGates === 1) {
    gateRows.add(rng.int(7, 10));
  } else if (effectiveGates >= 2) {
    gateRows.add(rng.int(3, 5));
    gateRows.add(rng.int(8, 10));
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
      // 第一幕前 3 层 (Row 0~3) 属于队伍奠基期，不生成精英，从第 4 层起才允许分支精英
      const minEliteRow = act === 1 ? 4 : (policy.omen >= 1 ? 3 : 4);
      if (!isAdjToGate && !prevRowHasElite && n.row >= minEliteRow && !pTypes.includes('elite')) {
        // 第一幕同层已有精英时不再生成额外精英，确保分支多样性且有路可绕
        const rowHasElite = ordered.some((m) => m.row === n.row && m.type === 'elite');
        if (act !== 1 || !rowHasElite) {
          add('elite', policy.eliteWeight);
        }
      }
      if (n.row >= 4 && n.row !== MAP_ROWS - 2 && !pTypes.includes('rest')) add('rest', 11);
      // 商店：Row 2 起允许生成，在第一幕前期控制商店权重，避免过早占用战斗格子
      if (n.row >= 2 && !pTypes.includes('shop')) {
        add('shop', act === 1 && n.row <= 3 ? 5 : 9);
      }
      n.type = rng.weighted(opts, w);
    }
  }

  // 第一幕发展期不变量保证：确保一定存在至少一条完全没有精英（minElites === 0）的可行路线
  if (act === 1) {
    ensureAct1Bypassable(nodes, omen >= 3);
  }
  // A rift into the Sift opens somewhere in the middle of the Nether and the End.
  if (act === 2 || act === 3) {
    const cands = ordered.filter((n) => n.row >= 3 && n.row <= 10 && n.row !== 6 && (n.type === 'battle' || n.type === 'event'));
    if (cands.length && rng.chance(0.8)) rng.pick(cands).type = 'rift';
  }
  // 战技殿堂 (Tactics Sanctuary): Act 2-6, independent RNG stream
  const hallChance = [0, 0, 0.5, 0.5, 0.25, 0.25, 0.25, 0][act] ?? 0;
  if (placedTacticsCount < 3 && hallChance > 0) {
    const hallRng = rng.fork(8821);
    if (hallRng.chance(hallChance)) {
      const candidates = ordered.filter(
        (n) => n.row >= 7 && n.row <= 10 && (n.type === 'battle' || n.type === 'event') && ordered.some((other) => other.row === n.row && other.id !== n.id),
      );
      if (candidates.length) {
        hallRng.pick(candidates).type = 'tactics';
      }
    }
  }
  const boss: MapNode = { id: 'boss', row: MAP_ROWS, col: 3, type: 'boss', next: [], x: 3, ref: bossId };
  nodes.boss = boss;
  for (const n of Object.values(nodes)) if (n.row === MAP_ROWS - 1) n.next = ['boss'];
  return { act, nodes, rows: MAP_ROWS, bossId };
}

export function startNodes(map: ActMap): MapNode[] {
  return Object.values(map.nodes).filter((n) => n.row === 0);
}

/** 保证第 1 幕始终至少存在一条完全绕开精英（minElites === 0）的路线 */
function ensureAct1Bypassable(nodes: Record<string, MapNode>, earlyShop = false) {
  const memo: Record<string, { cost: number; path: string[] }> = {};
  function dp(id: string): { cost: number; path: string[] } {
    if (memo[id]) return memo[id];
    const n = nodes[id];
    if (!n) return { cost: 0, path: [] };
    const cost = n.type === 'elite' ? 1 : 0;
    if (!n.next || n.next.length === 0) return { cost, path: [id] };
    let best = { cost: Infinity, path: [] as string[] };
    for (const nxt of n.next) {
      const res = dp(nxt);
      if (res.cost < best.cost) {
        best = res;
      }
    }
    const totalCost = cost + (best.cost === Infinity ? 0 : best.cost);
    const fullPath = [id, ...best.path];
    return (memo[id] = { cost: totalCost, path: fullPath });
  }

  const starts = Object.values(nodes).filter((n) => n.row === 0);
  let bestOverall = { cost: Infinity, path: [] as string[] };
  for (const s of starts) {
    const res = dp(s.id);
    if (res.cost < bestOverall.cost) {
      bestOverall = res;
    }
  }

  if (bestOverall.cost > 0) {
    for (const id of bestOverall.path) {
      const n = nodes[id];
      if (n && n.type === 'elite') {
        n.type = 'battle';
      }
    }
  }
  // High-Omen grants need an optional early outlet on a route that stays free of elites.
  const path = bestOverall.path.map((id) => nodes[id]);
  if (earlyShop && !path.some((n) => n.type === 'shop' && n.row >= 2 && n.row <= 4)) {
    const shop = path.find((n) => n.row === 3);
    if (shop) shop.type = 'shop';
  }
}

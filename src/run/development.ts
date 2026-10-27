import { MOB_COST } from '../classic/costs.ts';
import { RARITIES } from '../core/types.ts';
import { ENCOUNTERS, tierForRow, type EncCard, type EncounterDef } from '../data/encounters.ts';
import { act1FormationPolicy } from '../data/difficulty.ts';
import { mobDef, unitCount } from '../data/mobs.ts';

export function formationThreat(cards: EncCard[]): number {
  return cards.reduce((sum, [mob, star, , count]) => {
    const measured = MOB_COST[mob]?.[Math.max(0, Math.min(2, star - 1))];
    const fallback = [2, 4, 7, 11, 16][RARITIES.indexOf(mobDef(mob).rarity)] ?? 4;
    const normalCount = unitCount(mobDef(mob), star);
    return sum + (measured ?? fallback) * ((count ?? normalCount) / normalCount);
  }, 0);
}

/** Supports cannot borrow later encounters, event enemies or boss guards. */
export function act1SupportPool(row: number, kind: EncounterDef['kind']): string[] {
  return [...new Set(ENCOUNTERS.filter((e) => e.act === 1 && (
    (e.kind === 'battle' && (e.tier ?? 0) <= tierForRow(row))
    || ((kind === 'elite' || kind === 'boss') && e.kind === 'elite')
  )).flatMap((e) => e.cards.map((c) => c[0])))]
    .filter((id) => {
      const m = mobDef(id);
      return !m.boss && !m.structure && !m.hidden;
    }).sort();
}

/** Applies the same runway to templates, supports, event fights and boss guards. */
export function normalizeAct1Formation(source: EncCard[], row: number, kind: EncounterDef['kind'], omen: number): EncCard[] {
  const policy = act1FormationPolicy(row, kind, omen);
  const bosses = kind === 'boss' ? source.filter((c) => mobDef(c[0]).boss).slice(0, 1).map((c) => c.slice() as EncCard) : [];
  const cards: EncCard[] = [];
  const pool = act1SupportPool(row, kind);
  const rarityOf = (id: string) => RARITIES.indexOf(mobDef(id).rarity);
  const replacement = (card: EncCard, maxRarity: number, maxThreat = Infinity): string | undefined => {
    const original = mobDef(card[0]);
    return pool.filter((id) => rarityOf(id) <= maxRarity && formationThreat([[id, 1]]) < maxThreat)
      .sort((a, b) => {
        const score = (id: string) => {
          const m = mobDef(id);
          return (m.role === original.role ? 4 : 0) + m.families.filter((f) => original.families.includes(f)).length * 3;
        };
        return score(b) - score(a)
          || Math.abs(formationThreat([[a, 1]]) - formationThreat([card])) - Math.abs(formationThreat([[b, 1]]) - formationThreat([card]))
          || a.localeCompare(b);
      })[0];
  };

  const extraCard = (kind === 'battle' || kind === 'event') && Math.min(source.length, policy.maxCards) > 3;
  const star2Cap = Math.max(0, policy.maxStar2 - (extraCard ? 1 : 0));
  for (const sourceCard of source) {
    const original = mobDef(sourceCard[0]);
    if (original.boss && kind === 'boss') continue;
    if (cards.length + bosses.length >= policy.maxCards) break;
    const card = sourceCard.slice() as EncCard;
    const highCount = cards.filter((c) => rarityOf(c[0]) >= 2).length;
    const maxRarity = highCount >= 1 ? Math.min(1, policy.maxRarity) : policy.maxRarity;
    if (original.boss || original.structure || original.hidden || rarityOf(card[0]) > maxRarity) {
      const id = replacement(card, maxRarity);
      if (!id) continue;
      card[0] = id;
      card[4] = undefined;
      card[5] = undefined;
    }
    const star2Count = cards.filter((c) => c[1] === 2).length;
    card[1] = card[1] >= 2 && rarityOf(card[0]) < 3 && star2Count < star2Cap ? 2 : 1;
    if (card[0] !== sourceCard[0] || card[1] !== sourceCard[1]) {
      const ratio = Math.min(1, (sourceCard[3] ?? unitCount(original, sourceCard[1])) / unitCount(original, sourceCard[1]));
      const count = Math.max(1, Math.round(unitCount(mobDef(card[0]), card[1]) * ratio));
      card[3] = count === unitCount(mobDef(card[0]), card[1]) ? undefined : count;
    }
    cards.push(card);
  }

  // A fixed floor budget cannot expand just because the chosen template is expensive.
  while (formationThreat(cards) > policy.threatBudget + 1e-9 && cards.length) {
    const promoted = cards.map((c, i) => ({ c, i })).filter(({ c }) => c[1] > 1)
      .sort((a, b) => formationThreat([b.c]) - formationThreat([a.c]) || b.i - a.i)[0];
    if (promoted) {
      const c = promoted.c;
      const ratio = Math.min(1, (c[3] ?? unitCount(mobDef(c[0]), c[1])) / unitCount(mobDef(c[0]), c[1]));
      c[1] = 1;
      const count = Math.max(1, Math.round(unitCount(mobDef(c[0]), 1) * ratio));
      c[3] = count === unitCount(mobDef(c[0]), 1) ? undefined : count;
      continue;
    }
    const swarm = cards.map((c, i) => ({ c, i, count: c[3] ?? unitCount(mobDef(c[0]), c[1]) }))
      .filter(({ count }) => count > 1)
      .sort((a, b) => formationThreat([b.c]) / b.count - formationThreat([a.c]) / a.count || b.i - a.i)[0];
    if (swarm) {
      swarm.c[3] = swarm.count - 1;
      continue;
    }
    const strongest = cards.map((c, i) => ({ c, i })).sort((a, b) => formationThreat([b.c]) - formationThreat([a.c]) || b.i - a.i)[0];
    const id = replacement(strongest.c, Math.min(1, policy.maxRarity), formationThreat([strongest.c]) - 1e-9);
    if (id) cards[strongest.i] = [id, 1, mobDef(id).defaultRow];
    else cards.pop();
  }

  // First four floors have no enchantments; later fights get one level-I, one-star carrier.
  let enchanted = false;
  for (const c of cards) {
    if (!c[4]) continue;
    if (row < 4 || enchanted || c[1] > 1 || rarityOf(c[0]) >= 3) {
      c[4] = undefined;
      c[5] = undefined;
    } else {
      c[5] = 1;
      enchanted = true;
    }
  }
  return [...bosses, ...cards];
}

// Translates run-level state (cards, relics, potions, synergies, difficulty) into battle plans.
import type { Family, Row } from '../core/types.ts';
import { computeSynergies } from '../data/families.ts';
import { mobDef, starStatMul, unitCount } from '../data/mobs.ts';
import type { CardPlan, SidePlan } from './sim.ts';
import { IMM_BURN, IMM_HUNGER, IMM_KB, IMM_POISON, baseFx } from './unit.ts';
import type { BuildOrder } from './terrain.ts';
import { COMMANDER_MAP } from '../data/commanders.ts';
import { enchantVal } from '../data/items.ts';
import { activeCombos } from '../data/combos.ts';

export interface PlanCardInput {
  mob: string;
  star: number;
  row: Row;
  enchant?: string;
  enchantLv?: number;
  bonus?: number;
  count?: number;
  uid?: string;
  anchor?: [number, number];
}

export interface SideContext {
  relics: string[];
  potions: string[];
  commander?: string;
  /** Deployment builds (Steve). */
  builds?: BuildOrder[];
  act: number;
  /** Extra multipliers (enemy floor scaling / difficulty). */
  hpMul?: number;
  atkMul?: number;
  /** Elite affix on every card (不祥之兆 II+, data/items.ts AFFIXES). */
  affix?: string;
  /** Extra side flags (difficulty rules the sim checks with `has`). */
  flags?: string[];
}

export function synergyBonus(relics: string[]): Partial<Record<Family, number>> {
  const b: Partial<Record<Family, number>> = {};
  if (relics.includes('heart_of_the_sea')) b.aquatic = 1;
  if (relics.includes('music_disc')) b.nether = 1;
  return b;
}

export function sideSynergies(cards: { mob: string }[], relics: string[]) {
  const distinct = [...new Set(cards.map((c) => c.mob))];
  return computeSynergies(
    distinct.map((m) => mobDef(m).families),
    synergyBonus(relics),
  );
}

export function buildSide(cards: PlanCardInput[], ctx: SideContext): SidePlan {
  const relics = new Set(ctx.relics);
  const potions = new Set(ctx.potions);
  const { active } = sideSynergies(cards, ctx.relics);
  const syn: Partial<Record<Family, number>> = {};
  for (const [f, t] of Object.entries(active)) if (t >= 0) syn[f as Family] = t;
  const E = relics.has('lapis') ? 1.5 : 1;
  const combos = new Set(activeCombos(cards.map((c) => c.mob)));

  const plans: CardPlan[] = cards.map((c) => {
    const m = mobDef(c.mob);
    const fams = m.families;
    const has = (f: Family) => fams.includes(f);
    const ranged = m.range >= 60;
    const fx = baseFx();
    let hpMul = (1 + (c.bonus ?? 0)) * (ctx.hpMul ?? 1);
    let atkMul = (1 + (c.bonus ?? 0)) * (ctx.atkMul ?? 1);
    let atkSpd = 1;
    let moveSpd = 1;
    let rangeMul = 1;
    let armorAdd = 0;
    let immune = 0;
    let count = c.count ?? unitCount(m, c.star);

    // ── Enchantment (levels I–III; 青金石 boosts the numbers) ──
    const lv = c.enchantLv ?? 2;
    const ev = (k = 0) => (c.enchant ? enchantVal(c.enchant, lv, k) / 100 : 0) * E;
    switch (c.enchant) {
      case 'sharpness':
        if (!ranged) atkMul *= 1 + ev();
        break;
      case 'power':
        if (ranged) atkMul *= 1 + ev();
        break;
      case 'protection':
        hpMul *= 1 + ev();
        break;
      case 'knockback':
        fx.knock = (40 + 30 * (lv - 1)) * E;
        fx.stunChance = ev();
        break;
      case 'thorns':
        fx.thorns += ev();
        break;
      case 'unbreaking':
        fx.dodge = Math.min(0.4, ev());
        break;
      case 'looting':
        fx.loot = Math.round(enchantVal('looting', lv) * E);
        break;
      case 'sweeping':
        if (!ranged) fx.sweep = ev();
        break;
      case 'piercing':
        if (ranged) {
          fx.pierce = enchantVal('piercing', lv) + (E > 1 ? 1 : 0);
          atkMul *= 1 + ev(1);
        }
        break;
      case 'mending':
        fx.lifesteal += ev();
        break;
      case 'soul_speed':
        moveSpd *= 1 + ev();
        atkSpd *= 1 + ev(1);
        break;
      case 'channeling':
        fx.channel = Math.max(3, enchantVal('channeling', lv) - (E > 1 ? 1 : 0));
        break;
      case 'multishot':
        if (ranged && m.projectile) fx.multishot = ev();
        break;
      case 'smite':
        fx.vsUndead = ev();
        break;
      case 'bane':
        fx.vsArthropod = ev();
        fx.baneSlow = enchantVal('bane', lv, 1);
        break;
      case 'breach':
        fx.breach = Math.min(0.9, ev());
        break;
      case 'density':
        fx.density = ev();
        break;
      case 'wind_burst':
        fx.windBurst = Math.max(2, enchantVal('wind_burst', lv) - (E > 1 ? 1 : 0));
        break;
      case 'punch':
        if (ranged) {
          fx.knock = (40 + 30 * (lv - 1)) * E;
          fx.stunChance = ev();
        }
        break;
    }

    // ── Relics ──
    if (relics.has('iron_sword') && !ranged) atkMul *= 1.12;
    if (relics.has('bow') && ranged) atkMul *= 1.12;
    if (relics.has('iron_chestplate') && c.row === 'front') hpMul *= 1.18;
    if (relics.has('shield')) fx.projTaken *= 0.8;
    if (relics.has('spider_eye')) fx.poisonMul *= 1.6;
    if (relics.has('blaze_rod')) fx.burnMul *= 1.6;
    if (relics.has('bone') && has('undead') && count >= 2) count += 1;
    if (relics.has('hay_bale') && has('beast') && !m.boss) count += 1;
    if (relics.has('netherite_plate') && m.role === 'tank') hpMul *= 1.2;
    if (combos.has('village_guard') && (m.id === 'snow_golem' || m.id === 'copper_golem')) hpMul *= 1.25;
    if (relics.has('saddle') && has('beast')) {
      moveSpd *= 1.25;
      fx.firstHitMul = 2;
    }
    if (relics.has('honey_bottle')) immune |= IMM_POISON | IMM_HUNGER;
    if (relics.has('diamond_sword')) fx.crit += 0.12;
    if (relics.has('spyglass') && ranged) {
      rangeMul *= 1.2;
      fx.farBonus = 0.15;
    }
    if (relics.has('ender_pearl')) fx.pearl = true;
    if (relics.has('heart_of_the_sea') && has('aquatic')) hpMul *= 1.2;
    if (relics.has('music_disc') && has('nether')) atkSpd *= 1.2;
    if (relics.has('beacon')) {
      hpMul *= 1.1;
      atkMul *= 1.1;
      atkSpd *= 1.1;
    }
    if (relics.has('nether_star')) {
      hpMul *= 1.25;
      atkMul *= 1.25;
    }

    // ── Elite affix (不祥之兆) ──
    if (!m.structure)
      switch (ctx.affix) {
        case 'regen':
          fx.regen += 0.012;
          break;
        case 'thorns':
          fx.thorns += 0.15;
          break;
        case 'swift':
          moveSpd *= 1.2;
          atkSpd *= 1.08;
          break;
        case 'sturdy':
          fx.dmgTaken *= 0.9;
          immune |= IMM_KB;
          break;
        case 'bloodlust':
          atkMul *= 1.06;
          fx.lifesteal += 0.1;
          break;
      }


    // ── Synergies ──
    const tier = (f: Family) => (has(f) && !m.boss && !m.structure ? (syn[f] ?? -1) : -1);
    const baseAtk = () => m.atk * starStatMul(m, c.star) * atkMul;
    if (tier('undead') >= 0) fx.lifesteal += tier('undead') >= 2 ? 0.2 : 0.12;
    if (tier('undead') >= 1) fx.revive = tier('undead') >= 2 ? 0.6 : 0.35;
    if (tier('arthropod') >= 0) atkSpd *= 1.2;
    if (tier('arthropod') >= 1) {
      fx.poisonHit = Math.max(fx.poisonHit, Math.max(3, baseAtk() * 0.25));
      fx.poisonDur = 3;
      fx.poisonStacks = Math.max(fx.poisonStacks, 2);
    }
    if (tier('illager') >= 0) fx.vsHighHp = tier('illager') >= 2 ? 0.35 : 0.25;
    if (tier('nether') >= 0) {
      immune |= IMM_BURN;
      fx.burnHit = Math.max(fx.burnHit, Math.max(4, baseAtk() * 0.2));
      fx.burnDur = Math.max(fx.burnDur, 2);
    }
    if (tier('nether') >= 1) fx.vsBurning = 0.25;
    if (tier('ender') >= 0) fx.projDodge = 0.3;
    if (tier('construct') >= 0) armorAdd += 0.15;
    if (tier('beast') >= 0) {
      moveSpd *= 1.15;
      atkSpd *= 1.15;
    }
    if (tier('beast') >= 1) fx.killAtk = 0.12;
    if (tier('aquatic') >= 0) fx.regen = 0.015;

    // ── Commander ──
    if (ctx.commander === 'alex' && has('beast')) {
      hpMul *= 1.15;
      atkMul *= 1.15;
    }
    if (ctx.commander === 'witch') {
      fx.poisonMul *= 1.3;
      fx.burnMul *= 1.3;
    }

    if (c.enchant === 'fire_aspect' || c.enchant === 'flame') {
      fx.burnHit = Math.max(fx.burnHit, baseAtk() * ev());
      fx.burnDur = Math.max(fx.burnDur, c.enchant === 'flame' ? 3 : 4);
    }
    if (c.enchant === 'frost') fx.freezeHit = baseAtk() * ev();

    return {
      mob: c.mob, star: c.star, row: c.row, count, hpMul, atkMul, atkSpd, moveSpd, rangeMul, armorAdd, fx, immune,
      enchant: c.enchant, uid: c.uid, anchor: c.anchor,
    };
  });

  const flags: Record<string, number> = {};
  for (const r of relics) flags[r] = 1;
  for (const p of potions) flags[p] = 1;
  for (const c of combos) flags[`combo_${c}`] = 1;
  for (const f of ctx.flags ?? []) flags[f] = 1;
  const cmd = ctx.commander ? COMMANDER_MAP[ctx.commander] : undefined;
  if (cmd) flags[`cmd_${cmd.id}`] = 1;
  // Commander skill charges (the Witch's brew is handled as free items by the run).
  let skill: SidePlan['skill'];
  if (cmd && cmd.skill.id !== 'brew') {
    let n = cmd.skill.charges;
    if (relics.has('scaffolding')) n += 2;
    if (relics.has('name_tag')) n += 1;
    skill = { id: cmd.skill.id, charges: n };
  }
  return {
    cards: plans,
    flags,
    syn,
    summonMul: relics.has('lead') ? 1.35 : 1,
    act: ctx.act,
    skill,
    builds: ctx.builds,
  };
}

/** Rough fighting strength of a side (≈ number of blue ★1 squads), for the prep screen gauge. */
export function estimatePower(side: SidePlan): number {
  let p = 0;
  for (const c of side.cards) {
    const m = mobDef(c.mob);
    if (m.structure) continue;
    const sm = starStatMul(m, c.star);
    const hp = m.hp * sm * c.hpMul * (1 + m.armor);
    const dps = ((m.atk * sm * c.atkMul) / m.cd) * c.atkSpd;
    let v = c.count * Math.sqrt(hp * Math.max(1, dps));
    if (m.range >= 60) v *= 1.35;
    if (m.ai === 'evoker' || m.ai === 'illusioner') v *= 1.4;
    if (c.fx.lifesteal) v *= 1 + c.fx.lifesteal;
    if (c.fx.crit) v *= 1 + c.fx.crit * 0.75;
    p += v;
  }
  const flags = Object.keys(side.flags).length;
  return (p / 168) * (1 + Math.min(0.3, flags * 0.025));
}

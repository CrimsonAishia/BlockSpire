// Shared game-wide types. Kept free of DOM so the battle sim and run logic can run headless.

export type Rarity = 'blue' | 'purple' | 'pink' | 'red' | 'gold';
export const RARITIES: Rarity[] = ['blue', 'purple', 'pink', 'red', 'gold'];

export type Family =
  | 'undead'
  | 'arthropod'
  | 'illager'
  | 'nether'
  | 'ender'
  | 'construct'
  | 'beast'
  | 'aquatic'
  | 'slime'
  | 'sift';

export type Row = 'front' | 'mid' | 'back';
export const ROWS: Row[] = ['front', 'mid', 'back'];

export type Role = 'tank' | 'melee' | 'ranged' | 'caster' | 'summoner' | 'bomber' | 'assassin' | 'support' | 'boss';

export type DmgKind = 'phys' | 'magic' | 'true' | 'dot';

export type ProjectileKind =
  | 'arrow'
  | 'bolt'
  | 'snowball'
  | 'potion'
  | 'fireball'
  | 'big_fireball'
  | 'trident'
  | 'shulker_bullet'
  | 'wither_skull'
  | 'blue_skull'
  | 'wind_charge'
  | 'dragon_fireball'
  | 'ice_ball'
  | 'chin_spike'
  | 'quill'
  | 'goo';

export type Immunity = 'burn' | 'poison' | 'wither' | 'knockback' | 'slow' | 'stun';

export interface MobDef {
  id: string;
  name: string;
  rarity: Rarity;
  families: Family[];
  role: Role;
  /** Base stats at ★1, before modifiers. */
  hp: number;
  atk: number;
  /** Attack interval in seconds. */
  cd: number;
  /** Attack reach measured edge-to-edge (melee ~10). */
  range: number;
  speed: number;
  armor: number;
  radius: number;
  /** Render height in world units. */
  size: number;
  flying?: boolean;
  /** Hover altitude for flyers. */
  alt?: number;
  /** Units fielded at ★1/★2/★3. */
  count: [number, number, number];
  projectile?: ProjectileKind;
  dmgKind?: DmgKind;
  immune?: Immunity[];
  /** Behaviour key in battle/abilities.ts. */
  ai: string;
  defaultRow: Row;
  mass?: number;
  skill: { name: string; desc: string };
  star3: string;
  flavor: string;
  /** Not obtainable from crates (summons, bosses). */
  hidden?: boolean;
  boss?: boolean;
  /** Does not count toward victory (e.g. end crystals). */
  structure?: boolean;
  /** Sprite asset name if different from id. */
  sprite?: string;
  /** Sprite faces left in source art. */
  faceLeft?: boolean;
}

export interface Card {
  uid: string;
  mob: string;
  star: 1 | 2 | 3;
  /** Duplicate copies merged toward next star. */
  shards: number;
  enchant?: string;
  /** Enchantment level 1–3 (older saves have none: treated as II). */
  enchantLv?: number;
  row: Row;
  /** Permanent stat bonus from events (e.g. Hero of the Village), as fraction. */
  bonus?: number;
}

/** rift: a tear into the Sift (acts 2–3): a Sift fight that pays out a Sift crate. */
export type NodeType = 'battle' | 'elite' | 'shop' | 'event' | 'rest' | 'treasure' | 'boss' | 'rift';

export interface MapNode {
  id: string;
  row: number;
  col: number;
  type: NodeType;
  next: string[];
  /** Pre-rolled encounter id for battles/elites/bosses, or event id. */
  ref?: string;
  x: number;
}

export interface ActMap {
  act: number;
  nodes: Record<string, MapNode>;
  rows: number;
  bossId: string;
}

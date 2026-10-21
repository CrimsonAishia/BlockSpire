import { useEffect, useRef } from 'preact/hooks';
import type { MapNode, NodeType } from '../../core/types.ts';
import { availableNodes, enterNode, hasRelic, type RunState } from '../../run/run.ts';
import { ENC_MAP } from '../../data/encounters.ts';
import { mobDef } from '../../data/mobs.ts';
import { url } from '../assets.ts';
import { FamBadge, MobCard, Tip } from '../components/common.tsx';
import { act } from './RunView.tsx';
import { sfx } from '../../audio/audio.ts';
import { sideSynergies } from '../../battle/setup.ts';
import { FAMILIES } from '../../data/families.ts';
import { overlay, stageSize } from '../store.ts';
import { Hint } from '../components/hints.tsx';
import { RichText } from '../components/rich.tsx';
import type { Family } from '../../core/types.ts';

export const NODE_INFO: Record<NodeType, { name: string; desc: string; icon: string }> = {
  battle: { name: '战斗', desc: '击败一队怪物，从补给箱中挑选战利品。', icon: 'node_battle' },
  elite: { name: '精英', desc: '强大的敌人。胜利可获得精良补给箱和一件宝物。失败损失 2 颗心。', icon: 'node_elite' },
  shop: { name: '村民交易所', desc: '用绿宝石购买补给箱、战斗物品、附魔书、宝物与服务。', icon: 'node_shop' },
  event: { name: '未知事件', desc: '机遇与风险并存。', icon: 'node_event' },
  rest: { name: '营火', desc: '休息回复生命，或在锻造台升星、在附魔台附魔。', icon: 'node_rest' },
  treasure: { name: '宝箱', desc: '免费打开一个高级补给箱。', icon: 'node_treasure' },
  boss: { name: '首领', desc: '本幕的最终考验。', icon: 'node_boss' },
  rift: { name: '筛界裂隙', desc: '一道通往筛界的裂隙：和那边的生物交战，胜利后开启「裂隙」补给箱（只有筛界生物）。', icon: 'node_rift' },
};

const ROW_H = 104;
const COL_W = 128;
/** Space the side panels take (left panel, right panel, edge room for the outer nodes). */
const SIDE_L = 318;
const SIDE_R = 348;
const EDGE = 104;
const ACT_TEX = ['', 'dirt', 'netherrack', 'endstone', 'sift'];

export function MapView({ s }: { s: RunState; v?: number }) {
  const scroller = useRef<HTMLDivElement>(null);
  const nodes = Object.values(s.map.nodes);
  const avail = new Set(availableNodes(s).map((n) => n.id));
  const H = (s.map.rows + 1) * ROW_H + 180;
  // The columns sit centred between the side panels, closer together on a narrow (compact) stage.
  const W = stageSize.value.w;
  const colW = Math.min(COL_W, (W - SIDE_L - SIDE_R - EDGE) / 6);
  const mid = (SIDE_L + W - SIDE_R) / 2;
  const pos = (n: MapNode) => ({
    x: mid + (n.x - 3) * colW,
    y: H - 110 - n.row * ROW_H - (n.type === 'boss' ? 40 : 0),
  });
  const curRow = s.nodeId ? s.map.nodes[s.nodeId].row : -1;
  const elytraFree = hasRelic(s, 'elytra') && s.elytraAct !== s.act;

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = H - 110 - (curRow + 1) * ROW_H - el.clientHeight / 2;
    el.scrollTop = Math.max(0, Math.min(target, H));
  }, [s.nodeId]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;

    let isDown = false;
    let startY = 0;
    let startScrollTop = 0;
    let hasMoved = false;
    let lastY = 0;
    let lastTime = 0;
    let velocityY = 0;
    let animId = 0;

    const stopInertia = () => {
      if (animId) {
        cancelAnimationFrame(animId);
        animId = 0;
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      stopInertia();
      isDown = true;
      hasMoved = false;
      startY = e.clientY;
      startScrollTop = el.scrollTop;
      lastY = e.clientY;
      lastTime = performance.now();
      velocityY = 0;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDown) return;
      const dy = e.clientY - startY;
      if (!hasMoved && Math.abs(dy) > 4) {
        hasMoved = true;
        el.classList.add('dragging');
      }
      if (hasMoved) {
        el.scrollTop = startScrollTop - dy;
        const now = performance.now();
        const dt = now - lastTime;
        if (dt > 0) {
          velocityY = (e.clientY - lastY) / dt;
        }
        lastY = e.clientY;
        lastTime = now;
      }
    };

    const onPointerUp = () => {
      if (!isDown) return;
      isDown = false;
      el.classList.remove('dragging');

      if (hasMoved) {
        const captureClick = (e: MouseEvent) => {
          e.stopPropagation();
          e.preventDefault();
        };
        window.addEventListener('click', captureClick, { capture: true, once: true });
        setTimeout(() => {
          window.removeEventListener('click', captureClick, { capture: true });
        }, 50);

        const now = performance.now();
        if (now - lastTime < 80 && Math.abs(velocityY) > 0.15) {
          let v = velocityY;
          const inertiaStep = () => {
            v *= 0.92;
            if (Math.abs(v) > 0.04) {
              el.scrollTop -= v * 16;
              animId = requestAnimationFrame(inertiaStep);
            } else {
              animId = 0;
            }
          };
          animId = requestAnimationFrame(inertiaStep);
        }
      }
    };

    const onDragStart = (e: DragEvent) => {
      e.preventDefault();
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('dragstart', onDragStart);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    return () => {
      stopInertia();
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('dragstart', onDragStart);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  const boss = ENC_MAP[s.map.bossId];
  const bossMob = mobDef(boss.cards[0][0]);
  const syn = sideSynergies(s.team, s.relics);

  return (
    <div class="screen map-screen" style={{ backgroundImage: `url(${url.tex(ACT_TEX[s.act])})` }}>
      <div class="map-shade" />
      <div class="map-scroll" ref={scroller}>
        <div class="map-canvas" style={{ height: H }}>
          <svg class="map-svg" width={W} height={H}>
            {nodes.flatMap((n) =>
              n.next.map((id) => {
                const a = pos(n);
                const b = pos(s.map.nodes[id]);
                const walked = s.visited.includes(n.id) && s.visited.includes(id);
                const live = n.id === s.nodeId && avail.has(id);
                return (
                  <line
                    key={`${n.id}-${id}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    class={`map-edge ${walked ? 'walked' : ''} ${live ? 'live' : ''}`}
                  />
                );
              }),
            )}
          </svg>
          {nodes.map((n) => {
            const p = pos(n);
            const info = NODE_INFO[n.type];
            const isAvail = avail.has(n.id);
            const visited = s.visited.includes(n.id);
            const current = s.nodeId === n.id;
            const isBoss = n.type === 'boss';
            return (
              <Tip
                key={n.id}
                class={`map-node t-${n.type} ${isAvail ? 'avail' : ''} ${visited ? 'visited' : ''} ${current ? 'current' : ''} ${isBoss ? 'boss' : ''}`}
                style={{ left: p.x, top: p.y }}
                content={() => (
                  <div>
                    <div class="tt-title">{isBoss ? `首领：${boss.name}` : info.name}</div>
                    <div class="tt-line">{isBoss ? boss.desc : info.desc}</div>
                    {isAvail && !s.map.nodes[s.nodeId ?? '']?.next.includes(n.id) && s.nodeId && <div class="tt-sec tt-aqua">鞘翅：飞往此处</div>}
                  </div>
                )}
              >
                <button
                  disabled={!isAvail}
                  onClick={() => {
                    sfx('door');
                    act((r) => enterNode(r, n.id));
                  }}
                >
                  {isBoss ? <img class="boss-img" src={url.mob(bossMob.id)} /> : <img src={url.icon(info.icon)} />}
                </button>
              </Tip>
            );
          })}
        </div>
      </div>

      <div class="map-side left">
        <div class="panel">
          <div class="panel-title">第{['', '一', '二', '三', '四'][s.act]}幕 · {['', '主世界', '下界', '末地', '筛界'][s.act]}</div>
          <div class="boss-preview">
            <img src={url.mob(bossMob.id)} />
            <div>
              <div class="faint">本幕首领</div>
              <div class="gold-t" style={{ fontSize: 20 }}>{boss.name}</div>
            </div>
          </div>
          <div class="faint" style={{ fontSize: 13, marginTop: 6 }}>{bossMob.skill.desc}</div>
          <div class="divider" />
          <div class="legend">
            {(['battle', 'elite', 'event', 'shop', 'rest', 'treasure', ...(Object.values(s.map.nodes).some((n) => n.type === 'rift') ? ['rift'] : [])] as NodeType[]).map((t) => (
              <div key={t} class="row gap8">
                <img src={url.icon(NODE_INFO[t].icon)} width={28} height={28} class="pixelated" />
                <span>{NODE_INFO[t].name}</span>
              </div>
            ))}
          </div>
          {elytraFree && <div class="elytra-hint">✦ 鞘翅可用：本幕可飞往下一层任意节点</div>}
        </div>
      </div>

      <div class="map-side right">
        <div class="panel">
          <div class="row between">
            <div class="panel-title" style={{ marginBottom: 6 }}>
              出战阵容 <span class="faint" style={{ fontSize: 16 }}>{s.team.length}/{s.slots}</span>
            </div>
          </div>
          <div class="mini-team">
            {s.team.map((c) => (
              <MobCard key={c.uid} mob={c.mob} card={c} size="sm" />
            ))}
            {Array.from({ length: s.slots - s.team.length }, (_, i) => (
              <div key={i} class="empty-slot sm">空位</div>
            ))}
          </div>
          <div class="divider" />
          <div class="syn-list">
            {Object.entries(syn.counts)
              .sort((a, b) => b[1] - a[1])
              .map(([f, n]) => (
                <Tip
                  key={f}
                  content={() => (
                    <div>
                      <div class="tt-title" style={{ color: FAMILIES[f as Family].color }}>{FAMILIES[f as Family].name}</div>
                      {FAMILIES[f as Family].tiers.map((t, i) => (
                        <div key={i} class={syn.active[f as Family] >= i ? 'tt-yellow' : 'tt-gray'}>
                          ({t.n}) <RichText text={t.desc} tips={false} />
                        </div>
                      ))}
                    </div>
                  )}
                >
                  <div class="syn-row">
                    <FamBadge f={f as Family} active={syn.active[f as Family] >= 0} />
                    <span class={syn.active[f as Family] >= 0 ? 'gold-t' : 'faint'}>
                      {n}/{FAMILIES[f as Family].tiers.find((t) => t.n > n)?.n ?? FAMILIES[f as Family].tiers[FAMILIES[f as Family].tiers.length - 1].n}
                    </span>
                  </div>
                </Tip>
              ))}
          </div>
          {s.bench.length > 0 && (
            <div class="faint" style={{ fontSize: 13, marginTop: 8 }}>
              背包中还有 {s.bench.length} 张卡牌
            </div>
          )}
          <button class="mc-btn small wide" style={{ marginTop: 10 }} onClick={() => (sfx('page'), (overlay.value = 'team'))}>
            管理队伍
          </button>
        </div>
      </div>
      {!s.nodeId && <div class="map-hint blink">选择一个起点出发</div>}
      <Hint id="map" pos="bottom">
        <b>地图</b>：从下往上爬，每次只能走到相连的下一层节点。⚔ 战斗赢补给箱，☠ 精英更难但奖励宝物，营火可回血/升星/附魔。
        <br />
        左上角 ❤ 是你的生命：输掉战斗会扣心，归零则本局结束。走到顶端击败首领进入下一幕。
      </Hint>
    </div>
  );
}

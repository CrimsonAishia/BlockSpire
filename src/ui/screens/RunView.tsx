import { useEffect } from 'preact/hooks';
import { overlay, getRun, commit, runVersion, go, setRun, hideTips } from '../store.ts';
import { settle, type RunState } from '../../run/run.ts';
import { RunHud } from './RunHud.tsx';
import { MapView } from './MapView.tsx';
import { BattleStage } from './BattleStage.tsx';
import { RunCrateOpen, StarterView, CrateChoice, CardDecide, StarterStrategyView, StarterPickView } from './RunCrates.tsx';
import { BattleResultView } from './BattleResultView.tsx';
import { RelicChoice, BossReward, PotionChoice } from './RelicChoice.tsx';
import { ShopView } from './ShopView.tsx';
import { EventView } from './EventView.tsx';
import { RestView, PickCardView, EnchantChoiceView, MessageView } from './MiscViews.tsx';
import { TacticsHallView } from './TacticsHallView.tsx';
import { TacticsDraftModal } from './TacticsDraftModal.tsx';
import { ActIntro } from './ActIntro.tsx';
import { RunEnd } from './RunEnd.tsx';
import { TeamPanel } from './TeamPanel.tsx';
import { Btn, Modal } from '../components/common.tsx';
import { playMusic } from '../../audio/audio.ts';
import * as RunApi from '../../run/run.ts';

if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__run = { getRun, commit, act, R: RunApi };

/** Apply a run action, settle node completion and re-render. */
export function act(fn: (s: RunState) => void) {
  const s = getRun();
  if (!s) return;
  hideTips();
  fn(s);
  settle(s);
  commit();
}

export function RunView() {
  // Run state is mutated in place, so child screens get a version prop to defeat the
  // signals auto-memo (components with hook state skip renders when props are identical).
  const v = runVersion.value;
  const s = getRun();
  const p = s?.queue[0];

  useEffect(() => {
    if (!s) return;
    if (!p) playMusic(`map${s.act}` as 'map1');
    else if (p.type === 'shop') playMusic('shop');
    else if (p.type === 'victory') playMusic('victory');
    else if (p.type !== 'battle' && p.type !== 'result') playMusic(`map${s.act}` as 'map1');
  }, [p?.type, s?.act]);

  if (!s) {
    go('title');
    return null;
  }

  let body;
  let hud = true;
  if (!p) body = <MapView s={s} v={v} />;
  else
    switch (p.type) {
      case 'starter_strategy':
        body = <StarterStrategyView s={s} p={p} v={v} />;
        hud = false;
        break;
      case 'starter_pick':
        body = <StarterPickView s={s} p={p} v={v} />;
        hud = false;
        break;
      case 'starter':
        body = <StarterView s={s} p={p} v={v} />;
        hud = false;
        break;
      case 'open':
        body = <RunCrateOpen s={s} p={p} v={v} />;
        hud = false;
        break;
      case 'battle':
        body = <BattleStage s={s} p={p} v={v} />;
        hud = false;
        break;
      case 'result':
        body = <BattleResultView s={s} p={p} v={v} />;
        break;
      case 'crates':
        body = <CrateChoice s={s} p={p} v={v} />;
        break;
      case 'card_decide':
        body = <CardDecide s={s} p={p} v={v} />;
        break;
      case 'relic_choice':
        body = <RelicChoice s={s} p={p} v={v} />;
        break;
      case 'potion_choice':
        body = <PotionChoice s={s} p={p} v={v} />;
        break;
      case 'boss_reward':
        body = <BossReward s={s} p={p} v={v} />;
        break;
      case 'shop':
        body = <ShopView s={s} p={p} v={v} />;
        break;
      case 'event':
        body = <EventView s={s} p={p} v={v} />;
        break;
      case 'rest':
        body = <RestView s={s} p={p} v={v} />;
        break;
      case 'pick_card':
        body = <PickCardView s={s} p={p} v={v} />;
        break;
      case 'enchant_choice':
        body = <EnchantChoiceView s={s} p={p} v={v} />;
        break;
      case 'tactics_hall':
        body = <TacticsHallView s={s} p={p} v={v} />;
        break;
      case 'tactics_draft':
        body = <TacticsDraftModal s={s} p={p} v={v} />;
        break;
      case 'act_intro':
        body = <ActIntro s={s} p={p} v={v} />;
        hud = false;
        break;
      case 'message':
        body = <MessageView s={s} p={p} v={v} />;
        break;
      case 'victory':
      case 'defeat':
        body = <RunEnd s={s} won={p.type === 'victory'} />;
        hud = false;
        break;
    }

  return (
    <div class="screen run-screen">
      {body}
      {hud && <RunHud s={s} />}
      {overlay.value === 'team' && <TeamPanel s={s} onClose={() => (overlay.value = null)} />}
      {overlay.value === 'abandon' && (
        <Modal onClose={() => (overlay.value = null)} width={520}>
          <div class="panel-title">放弃本局？</div>
          <p class="subtle">本局进度将会结算为失败，无法恢复。</p>
          <div class="row gap12" style={{ marginTop: 20, justifyContent: 'flex-end' }}>
            <Btn onClick={() => (overlay.value = null)}>再想想</Btn>
            <Btn
              variant="red"
              onClick={() => {
                overlay.value = null;
                act((r) => {
                  r.abandoned = true;
                  r.queue = [{ type: 'defeat' }];
                });
              }}
            >
              放弃本局
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function quitToTitle() {
  setRun(getRun());
  go('title');
}

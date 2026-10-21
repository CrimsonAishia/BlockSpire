import { useState } from 'preact/hooks';
import { runSummary, type RunState } from '../../run/run.ts';
import { submitRun, type SubmitResult } from '../../net/leaderboard.ts';
import { Btn } from '../components/common.tsx';
import { earnAchievement, profile } from '../store.ts';
import { sfx } from '../../audio/audio.ts';
import { selfProfile } from '../../net/bakaboxBridge.ts';
import { url } from '../assets.ts';

const BOARD_NAME = { daily: '今日挑战', week: '本周', all: '总榜' } as const;
const COMMANDER_SET = new Set(['steve', 'alex', 'villager', 'witch']);

function getAvatarUrl(avatar?: string) {
  if (!avatar) return url.cmd('steve');
  if (avatar.startsWith('//')) return 'https:' + avatar;
  if (
    avatar.startsWith('http://') ||
    avatar.startsWith('https://') ||
    avatar.startsWith('data:') ||
    avatar.startsWith('blob:') ||
    avatar.startsWith('/') ||
    avatar.startsWith('./') ||
    avatar.includes('assets/')
  ) {
    return avatar;
  }
  if (COMMANDER_SET.has(avatar)) return url.cmd(avatar);
  return url.mob(avatar);
}

/** End screen: send the run to the leaderboard if the player wants to. */
export function SubmitPanel({ s, won }: { s: RunState; won: boolean }) {
  const name = selfProfile.value?.username || profile.value.nickname || '冒险家';
  const userAvatar = selfProfile.value?.avatar || s.commander || 'steve';
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [res, setRes] = useState<SubmitResult | null>(null);

  const send = () => {
    setBusy(true);
    setMsg(null);
    submitRun(runSummary(s, won), name, userAvatar)
      .then((r) => {
        s.submitted = true;
        setRes(r);
        sfx('levelup');
        const d = r.ranks.daily;
        if (d && d.updated && d.rank <= 10 && d.total >= 20) earnAchievement('daily_top10');
      })
      .catch((e: Error) => setMsg(e.message))
      .finally(() => setBusy(false));
  };

  if (res)
    return (
      <div class="end-submit">
        <div class="es-head">已上传到排行榜</div>
        <div class="row gap16" style={{ flexWrap: 'wrap' }}>
          {(['daily', 'week', 'all'] as const).map((b) => {
            const r = res.ranks[b];
            if (!r) return null;
            return (
              <span key={b}>
                {BOARD_NAME[b]} <b class="gold-t">第 {r.rank} 名</b>
                <span class="faint"> / {r.total}</span>
                {!r.updated && <span class="faint">（保留最好成绩 {r.best}）</span>}
              </span>
            );
          })}
        </div>
      </div>
    );

  return (
    <div class="end-submit">
      <div class="es-head">
        {s.daily ? '提交每日挑战成绩（取今天最好的一次）' : '上传到排行榜'}
        <span class="faint" style={{ fontSize: 14 }}>
          {' '}
          · 已绑定当前登录身份，点击即可一键上传
        </span>
      </div>
      <div class="row between" style={{ alignItems: 'center', marginTop: 4 }}>
        <div class="row gap8" style={{ alignItems: 'center' }}>
          <img
            src={getAvatarUrl(userAvatar)}
            class="submit-user-avatar"
            alt=""
            onError={(ev) => {
              const el = ev.currentTarget as HTMLImageElement;
              el.onerror = null;
              el.src = url.cmd('steve');
            }}
          />
          <span style={{ fontSize: 17, color: 'var(--ink)' }}>{name}</span>
          <span class="my-tag-pill">我</span>
        </div>
        <Btn variant="gold" size="big" onClick={send} disabled={busy}>
          {busy ? '上传中……' : '上传成绩'}
        </Btn>
      </div>
      {msg && <div class="red-t" style={{ fontSize: 14 }}>{msg}</div>}
    </div>
  );
}

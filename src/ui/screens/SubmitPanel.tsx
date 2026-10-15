import { useState } from 'preact/hooks';
import { runSummary, type RunState } from '../../run/run.ts';
import { nameError, submitRun, type SubmitResult } from '../../net/leaderboard.ts';
import { Btn } from '../components/common.tsx';
import { earnAchievement, profile, updateProfile } from '../store.ts';
import { sfx } from '../../audio/audio.ts';

const BOARD_NAME = { daily: '今日挑战', week: '本周', all: '总榜' } as const;

/** End screen: send the run to the leaderboard if the player wants to. */
export function SubmitPanel({ s, won }: { s: RunState; won: boolean }) {
  const [name, setName] = useState(profile.value.nickname ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [res, setRes] = useState<SubmitResult | null>(null);
  const send = () => {
    const err = nameError(name);
    if (err) return setMsg(err);
    const n = name.trim();
    updateProfile((p) => {
      p.nickname = n;
    });
    setBusy(true);
    setMsg(null);
    submitRun(runSummary(s, won), n)
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
          · 自愿参与，只公开昵称、统领、难度、进度与阵容
        </span>
      </div>
      <div class="row gap8">
        <input
          class="mc-input"
          maxLength={24}
          placeholder="你的昵称（1–12 个字）"
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === 'Enter' && !busy && send()}
        />
        <Btn variant="gold" onClick={send} disabled={busy}>
          {busy ? '上传中……' : '上传成绩'}
        </Btn>
      </div>
      {msg && <div class="red-t" style={{ fontSize: 14 }}>{msg}</div>}
    </div>
  );
}

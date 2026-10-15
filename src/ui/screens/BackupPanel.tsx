import { useRef, useState } from 'preact/hooks';
import { COMMANDER_MAP } from '../../data/items.ts';
import { ACHIEVEMENTS } from '../../meta/profile.ts';
import { PLAYABLE_MOBS } from '../../data/mobs.ts';
import {
  applyBackup, backupCode, downloadBackup, makeBackup, parseBackup, restoreUndo, summarize, undoBackup, type Backup,
} from '../../meta/backup.ts';
import { Btn } from '../components/common.tsx';
import { freezeStorage, getRun, pushToast } from '../store.ts';
import { saveRun } from '../../meta/profile.ts';
import { sfx } from '../../audio/audio.ts';

const when = (t: number) => (t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '未知时间');

/** Saves the run in progress first, so a backup always has the latest state. */
function fresh(): Backup {
  saveRun(getRun());
  return makeBackup();
}

/** Settings row: export as a file or a code, import, undo the last import. */
export function BackupRow({ onImport, onShowCode }: { onImport: () => void; onShowCode: (code: string) => void }) {
  const undo = undoBackup();
  const [sure, setSure] = useState(false);
  const copy = async () => {
    const code = await backupCode(fresh());
    try {
      await navigator.clipboard.writeText(code);
      sfx('levelup');
      pushToast(`存档码已复制（${code.length} 个字符）。它包含你的排行榜身份，只发给自己，别公开分享`, 'good');
    } catch {
      onShowCode(code);
    }
  };
  return (
    <>
      <div class="set-row">
        <span>
          存档备份<span class="faint" style={{ fontSize: 13 }}> · 换设备、清理浏览器前先导出</span>
        </span>
        <div class="row gap4">
          <button class="toggle" onClick={() => (sfx('click'), downloadBackup(fresh()), pushToast('存档文件已开始下载', 'good'))}>
            导出文件
          </button>
          <button class="toggle" onClick={() => (sfx('click'), void copy())}>
            复制存档码
          </button>
          <button class="toggle" onClick={() => (sfx('click'), onImport())}>
            导入…
          </button>
        </div>
      </div>
      {undo && (
        <div class="set-row">
          <span class="faint" style={{ fontSize: 14 }}>上次导入或重置之前的存档（{when(undo.exportedAt)}）还保留着</span>
          <button
            class={`toggle ${sure ? 'on' : ''}`}
            title="和当前存档互换：当前存档会被保留，可以再换回来"
            onClick={() => {
              sfx('click');
              if (!sure) return setSure(true);
              freezeStorage();
              restoreUndo();
            }}
          >
            {sure ? '确认撤销？' : '撤销'}
          </button>
        </div>
      )}
    </>
  );
}

/** Import: paste a code or pick a file, check what is in it, then replace this device's data. */
export function ImportView({ onBack }: { onBack: () => void }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [found, setFound] = useState<Backup | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const check = async (t: string) => {
    setErr(null);
    setFound(null);
    try {
      setFound(await parseBackup(t));
      sfx('page');
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const pick = async (f: File | undefined) => {
    if (!f) return;
    const t = await f.text();
    setText(t.length > 2000 ? `（已读取文件：${f.name}）` : t);
    void check(t);
  };
  const s = found && summarize(found);
  return (
    <div class="backup-view">
      <div class="panel-title">导入存档</div>
      <textarea
        class="mc-input backup-text"
        placeholder="在这里粘贴存档码（BSPIRE 开头），或者点下面的按钮选择存档文件"
        value={text}
        onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
      />
      <div class="row gap8">
        <Btn size="small" onClick={() => file.current?.click()}>
          选择存档文件
        </Btn>
        <Btn size="small" variant="green" onClick={() => void check(text)} disabled={!text.trim() || text.startsWith('（已读取文件')}>
          读取存档码
        </Btn>
        <input ref={file} type="file" accept=".json,.txt,application/json,text/plain" style={{ display: 'none' }} onChange={(e) => void pick((e.target as HTMLInputElement).files?.[0])} />
      </div>
      {err && <div class="red-t">{err}</div>}
      {s && (
        <div class="backup-summary">
          <div class="gold-t">找到存档 · 导出于 {when(s.exportedAt)}</div>
          <div>
            爬塔 {s.runs} 局（通关 {s.wins}）· 成就 {s.achievements}/{ACHIEVEMENTS.length} · 图鉴 {s.discovered}/{PLAYABLE_MOBS.length}
            {s.nickname && ` · 昵称 ${s.nickname}`}
          </div>
          <div class="subtle">
            {s.run
              ? `包含进行中的爬塔：${s.run.daily ? '每日挑战 · ' : ''}${COMMANDER_MAP[s.run.commander]?.name ?? '统领'} · 第${['', '一', '二', '三', '四'][s.run.act] ?? s.run.act}幕 · ❤${s.run.hearts}`
              : '没有进行中的爬塔'}
          </div>
          <div class="red-t" style={{ fontSize: 14 }}>导入会替换这台设备上的全部存档。当前存档会自动保留一份，导入后可以在设置里撤销。</div>
        </div>
      )}
      <div class="row between" style={{ marginTop: 6 }}>
        <Btn onClick={onBack}>返回</Btn>
        <Btn
          variant="gold"
          disabled={!found}
          onClick={() => {
            if (!found) return;
            freezeStorage();
            applyBackup(found);
          }}
        >
          确认导入
        </Btn>
      </div>
    </div>
  );
}

/** Shown when the clipboard is not available: the code to copy by hand. */
export function CodeView({ code, onBack }: { code: string; onBack: () => void }) {
  return (
    <div class="backup-view">
      <div class="panel-title">存档码</div>
      <div class="subtle">
        浏览器不允许自动复制，请全选下面的内容手动复制（共 {code.length} 个字符）。存档码包含你的排行榜身份，只发给自己，别公开分享。
      </div>
      <textarea class="mc-input backup-text" readOnly value={code} onFocus={(e) => (e.target as HTMLTextAreaElement).select()} />
      <div class="row between">
        <Btn onClick={onBack}>返回</Btn>
      </div>
    </div>
  );
}

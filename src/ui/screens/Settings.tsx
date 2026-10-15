import { useState } from 'preact/hooks';
import { Btn, GitHubLink, Modal, Tip } from '../components/common.tsx';
import { overlay, settings, updateSettings, setRun } from '../store.ts';
import { wipeAll } from '../../meta/profile.ts';
import { sfx } from '../../audio/audio.ts';
import { resetHints } from '../components/hints.tsx';

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div class="set-row">
      <span>{label}</span>
      <input type="range" min={0} max={100} value={Math.round(value * 100)} onInput={(e) => onChange(Number((e.target as HTMLInputElement).value) / 100)} class="mc-range" />
      <span class="set-val">{Math.round(value * 100)}%</span>
    </div>
  );
}

function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div class="set-row">
      <span>
        {label}
        {hint && <span class="faint" style={{ fontSize: 13 }}> · {hint}</span>}
      </span>
      <button class={`toggle ${value ? 'on' : ''}`} onClick={() => (sfx('click'), onChange(!value))}>
        {value ? '开' : '关'}
      </button>
    </div>
  );
}

export function SettingsModal() {
  const s = settings.value;
  const [wipe, setWipe] = useState(false);
  return (
    <Modal onClose={() => (overlay.value = null)} width={640}>
      <div class="panel-title">设置</div>
      <Slider label="主音量" value={s.master} onChange={(v) => updateSettings({ master: v })} />
      <Slider label="音乐" value={s.music} onChange={(v) => updateSettings({ music: v })} />
      <Slider label="音效" value={s.sfx} onChange={(v) => updateSettings({ sfx: v })} />
      <div class="divider" />
      <div class="set-row">
        <span>默认战斗速度</span>
        <div class="row gap4">
          {[1, 2, 4].map((v) => (
            <button key={v} class={`toggle ${s.speed === v ? 'on' : ''}`} onClick={() => updateSettings({ speed: v })}>
              {v}×
            </button>
          ))}
        </div>
      </div>
      <div class="set-row">
        <span>粒子特效</span>
        <div class="row gap4">
          {(['high', 'medium', 'low'] as const).map((v) => (
            <button key={v} class={`toggle ${s.particles === v ? 'on' : ''}`} onClick={() => updateSettings({ particles: v })}>
              {{ high: '高', medium: '中', low: '低' }[v]}
            </button>
          ))}
        </div>
      </div>
      <div class="set-row">
        <Tip
          content={() => (
            <div>
              <div class="tt-title">动画帧数</div>
              <div class="tt-line">高：每种生物 7 帧（站立、两步迈步、攻击、受击、背面站立与行走）。</div>
              <div class="tt-line">中：3 帧（站立、迈步、攻击）。</div>
              <div class="tt-line">低：只用卡牌立绘，靠变形做动作，下载和显存占用最少。</div>
              <div class="tt-sec tt-gray">帧数不影响每帧的渲染开销，只影响图片下载量和显存；老旧设备或手机上卡顿时可以调低。下一场战斗生效。</div>
            </div>
          )}
        >
          <span>
            动画帧数<span class="faint" style={{ fontSize: 13 }}> · 下一场战斗生效</span>
          </span>
        </Tip>
        <div class="row gap4">
          {(['high', 'medium', 'low'] as const).map((v) => (
            <button key={v} class={`toggle ${(s.frames ?? 'high') === v ? 'on' : ''}`} onClick={() => (sfx('click'), updateSettings({ frames: v }))}>
              {{ high: '高', medium: '中', low: '低' }[v]}
            </button>
          ))}
        </div>
      </div>
      <Toggle label="屏幕震动" value={s.shake} onChange={(v) => updateSettings({ shake: v })} />
      <Toggle label="伤害数字" value={s.numbers} onChange={(v) => updateSettings({ numbers: v })} />
      <div class="set-row">
        <span>
          开箱动画<span class="faint" style={{ fontSize: 13 }}> · 滚动中也可以点击跳过</span>
        </span>
        <div class="row gap4">
          {(['full', 'fast', 'skip'] as const).map((v) => (
            <button key={v} class={`toggle ${s.spin === v ? 'on' : ''}`} onClick={() => (sfx('click'), updateSettings({ spin: v, fastSpin: v !== 'full' }))}>
              {{ full: '完整', fast: '快速', skip: '跳过' }[v]}
            </button>
          ))}
        </div>
      </div>
      <Toggle label="显示帧率" value={s.fps} onChange={(v) => updateSettings({ fps: v })} />
      <div class="set-row">
        <span>新手提示</span>
        <div class="row gap4">
          <button class={`toggle ${s.hints ? 'on' : ''}`} onClick={() => (sfx('click'), updateSettings({ hints: !s.hints }))}>
            {s.hints ? '开' : '关'}
          </button>
          <button class="toggle" onClick={() => (sfx('click'), resetHints(), updateSettings({ hints: true }))}>
            重新显示全部
          </button>
        </div>
      </div>
      <div class="set-row">
        <span>
          开源项目<span class="faint" style={{ fontSize: 13 }}> · 欢迎 Star、反馈问题和贡献代码</span>
        </span>
        <GitHubLink />
      </div>
      <div class="divider" />
      <div class="row between">
        {wipe ? (
          <div class="row gap8">
            <span class="red-t">将删除所有存档、成就与图鉴！</span>
            <Btn
              size="small"
              variant="red"
              onClick={() => {
                wipeAll();
                setRun(null);
                location.reload();
              }}
            >
              确认删除
            </Btn>
            <Btn size="small" onClick={() => setWipe(false)}>
              取消
            </Btn>
          </div>
        ) : (
          <Btn size="small" variant="red" onClick={() => setWipe(true)}>
            重置全部数据
          </Btn>
        )}
        <Btn variant="green" onClick={() => (overlay.value = null)}>
          完成
        </Btn>
      </div>
      <div class="faint" style={{ fontSize: 12, marginTop: 10 }}>
        快捷键：T 打开队伍 · 空格 开箱/继续 · Esc 关闭面板
      </div>
    </Modal>
  );
}

// One-time contextual hints for new players. Each hint shows once per profile until dismissed.
import type { ComponentChildren } from 'preact';
import { profile, settings, updateProfile } from '../store.ts';
import { sfx } from '../../audio/audio.ts';

export function Hint({ id, children, pos = 'bottom' }: { id: string; children: ComponentChildren; pos?: 'bottom' | 'top' | 'center' | 'left' | 'right' }) {
  if (!settings.value.hints) return null;
  if (profile.value.flags[`hint_${id}`]) return null;
  return (
    <div class={`hint hint-${pos}`}>
      <div class="hint-icon">?</div>
      <div class="hint-body">{children}</div>
      <button
        class="mc-btn tiny green"
        onClick={() => {
          sfx('click');
          updateProfile((p) => {
            p.flags = { ...p.flags, [`hint_${id}`]: true };
          });
        }}
      >
        知道了
      </button>
    </div>
  );
}

export function resetHints() {
  updateProfile((p) => {
    p.flags = Object.fromEntries(Object.entries(p.flags).filter(([k]) => !k.startsWith('hint_')));
  });
}

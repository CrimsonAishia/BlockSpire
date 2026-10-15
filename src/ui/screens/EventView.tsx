import type { Pending, RunState } from '../../run/run.ts';
import { eventChoose, leaveNode } from '../../run/run.ts';
import { EVENT_MAP } from '../../run/events.ts';
import { url } from '../assets.ts';
import { Btn } from '../components/common.tsx';
import { act } from './RunView.tsx';
import { sfx } from '../../audio/audio.ts';

export function EventView({ s, p }: { s: RunState; p: Extract<Pending, { type: 'event' }>; v?: number }) {
  const ev = EVENT_MAP[p.id];
  const choices = ev.choices(s, p.data);
  return (
    <div class="screen event-screen">
      <div class="event-art" style={{ backgroundImage: `url(${url.event(ev.art ?? p.id)})` }} />
      <div class="event-panel panel">
        <div class="event-name title-shadow">{ev.name}</div>
        <div class="event-text">{ev.text}</div>
        <div class="divider" />
        {p.result === undefined ? (
          <div class="event-choices">
            {choices.map((c, i) => (
              <button
                key={i}
                class={`event-choice ${c.disabled ? 'off' : ''}`}
                disabled={!!c.disabled}
                onClick={() => {
                  sfx('click');
                  act((r) => eventChoose(r, i));
                }}
              >
                <div class="ec-label">【{c.label}】</div>
                <div class="ec-desc">{c.desc}</div>
                {c.disabled && <div class="ec-why">{c.disabled}</div>}
              </button>
            ))}
          </div>
        ) : (
          <div class="event-result">
            {p.result && <div class={`er-text ${p.resultTone}`}>{p.result}</div>}
            <Btn variant="green" size="big" onClick={() => act((r) => leaveNode(r))}>
              继续
            </Btn>
          </div>
        )}
      </div>
    </div>
  );
}

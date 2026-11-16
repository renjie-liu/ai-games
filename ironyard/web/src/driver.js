// Human input stays on the page; only a small command crosses to the simulation worker.
const KEY = { KeyW: 'forward', ArrowUp: 'forward', KeyS: 'reverse', ArrowDown: 'reverse', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'fire', KeyX: 'brake', ShiftLeft: 'boost', ShiftRight: 'boost', KeyE: 'item' };
export function drivingCommand(actions) {
  return { throttle: Number(actions.has('forward')) - Number(actions.has('reverse')), steer: Number(actions.has('left')) - Number(actions.has('right')), brake: actions.has('brake') ? 1 : 0, fire: actions.has('fire'), boost: actions.has('boost') ? 1 : 0, useItem: actions.has('item') };
}
export class DriverInput {
  constructor(panel, active, pause) {
    this.held = new Map(); this.active = active;
    const editable = n => n?.matches('input, textarea, select, [contenteditable="true"]');
    window.addEventListener('keydown', e => {
      if (!active() || editable(e.target) || e.ctrlKey || e.metaKey || e.altKey || !KEY[e.code]) return;
      e.preventDefault(); this.held.set(e.code, KEY[e.code]); this.paint(panel);
    });
    window.addEventListener('keyup', e => { if (this.held.delete(e.code)) { e.preventDefault(); this.paint(panel); } });
    for (const b of panel.querySelectorAll('[data-drive]')) {
      b.addEventListener('pointerdown', e => {
        if (!active()) return;
        e.preventDefault(); b.setPointerCapture(e.pointerId); this.held.set(e.pointerId, b.dataset.drive); this.paint(panel);
      });
      const release = e => { this.held.delete(e.pointerId); this.paint(panel); };
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(event, release);
    }
    this.panel = panel;
    window.addEventListener('blur', () => { this.clear(); pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.clear(); pause(); } });
    document.addEventListener('focusin', e => { if (editable(e.target)) this.clear(); });
  }
  paint(panel) { for (const b of panel.querySelectorAll('[data-drive]')) b.setAttribute('aria-pressed', String([...this.held.values()].includes(b.dataset.drive))); }
  clear() { this.held.clear(); this.paint(this.panel); }
  command() { return drivingCommand(new Set(this.held.values())); }
}

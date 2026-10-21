/* ============================================================
   键盘音效（Web Audio 合成，无外部音频文件）
   ------------------------------------------------------------
   key   普通按键
   space 空格
   del   退格 / 删除
   error 打错
   ok    答对
   ============================================================ */
(function (window) {
  'use strict';

  const SW = window.SW;
  const SFX = window.SFX = { enabled: true, ctx: null };

  const PRESETS = {
    key:   { type: 'triangle', f0: 1240, f1: 820, dur: 0.045, gain: 0.05 },
    space: { type: 'triangle', f0: 540,  f1: 400, dur: 0.06,  gain: 0.065 },
    del:   { type: 'sine',     f0: 400,  f1: 200, dur: 0.075, gain: 0.07 },
    error: { type: 'sawtooth', f0: 250,  f1: 120, dur: 0.14,  gain: 0.055 },
    ok:    { type: 'sine',     f0: 680,  f1: 980, dur: 0.11,  gain: 0.055 }
  };

  function ctx() {
    if (!SFX.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { SFX.ctx = new AC(); } catch (e) { return null; }
    }
    if (SFX.ctx.state === 'suspended') {
      try { SFX.ctx.resume(); } catch (e) {}
    }
    return SFX.ctx;
  }

  SFX.applyUi = function () {
    const btn = document.getElementById('btnSound');
    if (!btn) return;
    btn.classList.toggle('muted', !SFX.enabled);
    btn.setAttribute('aria-pressed', String(SFX.enabled));
    btn.title = SFX.enabled ? '键盘音效：开' : '键盘音效：关';
  };

  SFX.init = function () {
    const saved = SW.store.get('sound', true);
    SFX.enabled = saved !== false;
    SFX.applyUi();
  };

  SFX.setEnabled = function (on) {
    SFX.enabled = !!on;
    SW.store.set('sound', SFX.enabled);
    SFX.applyUi();
    if (SFX.enabled) SFX.play('ok');
  };

  SFX.toggle = function () {
    SFX.setEnabled(!SFX.enabled);
  };

  SFX.play = function (kind) {
    if (!SFX.enabled) return;
    const c = ctx();
    if (!c) return;

    const p = PRESETS[kind] || PRESETS.key;
    const t = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();

    osc.type = p.type;
    osc.frequency.setValueAtTime(p.f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, p.f1), t + p.dur);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(p.gain, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + p.dur);

    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t);
    osc.stop(t + p.dur + 0.03);
  };
})(window);

/* ============================================================
   键盘音效
   ------------------------------------------------------------
   key   正确输入 —— 采样音效 sounds/keystroke.mp3
         （自动裁掉头部静音和尾部余振，只保留中间发声段，
         连续快速打字时不会叠出杂音；每次随机微调播放速率）
   space 空格 —— 直接复用输入音效，不单独设置
   del   退格 / 删除 —— 采样音效 sounds/del.mp3
   error 输入错误 —— 采样音效 sounds/error.mp3
   ok    答对 / 成组 —— 两声上行提示（合成）
   采样加载失败（file:// 等）自动回退合成音效。
   ============================================================ */
(function (window) {
  'use strict';

  const SW = window.SW;
  const SFX = window.SFX = { enabled: true, ctx: null, buffers: {} };

  let noiseBuf = null;

  const SAMPLES = {
    key:   { src: 'sounds/keystroke.mp3', gain: 0.9, jitter: 0.16,
             trim: { threshold: 0.06, headPad: 0.002, tailPad: 0.006 } },
    error: { src: 'sounds/error.mp3', gain: 0.9, jitter: 0 },
    del:   { src: 'sounds/del.mp3', gain: 0.9, jitter: 0.1 }
  };
  let samplesLoading = false;

  function ctx() {
    if (!SFX.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { SFX.ctx = new AC(); } catch (e) { return null; }
      loadSamples(SFX.ctx);
    }
    if (SFX.ctx.state === 'suspended') {
      try { SFX.ctx.resume(); } catch (e) {}
    }
    return SFX.ctx;
  }

  /* ---------------- 采样音效 ---------------- */

  function loadSamples(c) {
    if (samplesLoading) return;
    samplesLoading = true;
    Object.keys(SAMPLES).forEach(function (name) {
      fetch(SAMPLES[name].src)
        .then(function (r) { return r.arrayBuffer(); })
        .then(function (b) { return c.decodeAudioData(b); })
        .then(function (buf) {
          const p = SAMPLES[name];
          if (p.trim) buf = trimBuffer(c, buf, p.trim);
          SFX.buffers[name] = buf;
        })
        .catch(function () { /* file:// 等场景加载失败：继续用合成音 */ });
    });
  }

  /* 裁剪采样：按能量找出中间发声段，去掉头尾静音/余振，
     并在两端加 3ms 淡入淡出防止爆音——连续打字时不会叠出杂音 */
  function trimBuffer(c, buf, cfg) {
    const n = buf.length;
    const data = [];
    for (let ch = 0; ch < buf.numberOfChannels; ch++) data.push(buf.getChannelData(ch));

    // 峰值 → 阈值
    let peak = 0;
    for (let i = 0; i < n; i++) {
      const v = Math.abs(data[0][i]);
      if (v > peak) peak = v;
    }
    const th = peak * (cfg.threshold || 0.06);

    // 按 64 采样块找首个 / 末个有声块
    const BLK = 64;
    const blocks = Math.ceil(n / BLK);
    let first = -1, last = -1;
    for (let b = 0; b < blocks; b++) {
      let m = 0;
      const end = Math.min(n, (b + 1) * BLK);
      for (let i = b * BLK; i < end; i++) {
        const v = Math.abs(data[0][i]);
        if (v > m) m = v;
      }
      if (m > th) { if (first < 0) first = b; last = b; }
    }
    if (first < 0) return buf;   // 整段都近静音：不裁剪

    const sr = buf.sampleRate;
    let s = Math.max(0, first * BLK - Math.floor((cfg.headPad || 0.002) * sr));
    let e = Math.min(n, (last + 1) * BLK + Math.floor((cfg.tailPad || 0.006) * sr));

    const out = c.createBuffer(buf.numberOfChannels, e - s, sr);
    const fade = Math.max(2, Math.floor(0.003 * sr));
    const len = e - s;
    for (let ch = 0; ch < data.length; ch++) {
      const d = out.getChannelData(ch);
      const src = data[ch];
      for (let i = s; i < e; i++) {
        const k = i - s;
        let v = src[i];
        if (k < fade) v *= k / fade;
        else if (k > len - fade) v *= (len - k) / fade;
        d[k] = v;
      }
    }
    return out;
  }

  function playSample(c, name) {
    const p = SAMPLES[name];
    const buf = SFX.buffers[name];
    if (!buf) return false;

    const src = c.createBufferSource();
    src.buffer = buf;
    if (p.jitter) {
      // 每次按键随机微调播放速率，音色不重复
      src.playbackRate.value = 1 - p.jitter / 2 + Math.random() * p.jitter;
    }
    const g = c.createGain();
    g.gain.value = p.gain;
    src.connect(g);
    g.connect(c.destination);
    src.start();
    return true;
  }

  /* ---------------- 基础件 ---------------- */

  function getNoise(c) {
    if (!noiseBuf) {
      const len = Math.floor(c.sampleRate * 0.12);
      noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  /* 麻将牌敲击：带通白噪声（脆）+ 三角波短共鸣（木质厚底） */
  function clack(c, o) {
    const t = c.currentTime;
    const out = c.createGain();
    out.gain.value = o.gain;
    out.connect(c.destination);

    // 噪声主体：牌面碰撞的"嗒"
    const src = c.createBufferSource();
    src.buffer = getNoise(c);
    src.playbackRate.value = 0.9 + Math.random() * 0.2;

    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = o.freq * (0.92 + Math.random() * 0.16);
    bp.Q.value = o.q || 1;

    const g = c.createGain();
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + o.dur);

    src.connect(bp);
    bp.connect(g);
    g.connect(out);
    src.start(t);
    src.stop(t + o.dur + 0.02);

    // 木质共鸣：给一声"厚"的底
    const body = c.createOscillator();
    body.type = 'triangle';
    const bf = o.body * (0.9 + Math.random() * 0.2);
    body.frequency.setValueAtTime(bf, t);
    body.frequency.exponentialRampToValueAtTime(bf * 0.6, t + o.dur);
    const bg = c.createGain();
    bg.gain.setValueAtTime(0.32, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + o.dur * 0.9);
    body.connect(bg);
    bg.connect(out);
    body.start(t);
    body.stop(t + o.dur + 0.02);
  }

  /* 短音 */
  function blip(c, o, at) {
    const t = c.currentTime + (at || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, o.f1), t + o.dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t);
    osc.stop(t + o.dur + 0.03);
  }

  const SOUNDS = {
    // 正确输入：优先采样音效，回退为合成的麻将牌脆响
    key:   { kind: 'clack', freq: 2400, q: 1.1, dur: 0.05, body: 520, gain: 0.55, sample: 'key' },
    // 空格：直接复用输入音效，不单独设置
    space: { kind: 'clack', freq: 1300, q: 1.0, dur: 0.06, body: 320, gain: 0.5, sample: 'key' },
    // 退格 / 删除：采样音效，回退为软敲击
    del:   { kind: 'clack', freq: 900,  q: 0.9, dur: 0.07, body: 260, gain: 0.45, sample: 'del' },
    // 输入错误：优先采样音效，回退为明亮的两声下行提示
    error: { kind: 'multi', sample: 'error', list: [
      { type: 'square', f0: 900, f1: 700, dur: 0.07, gain: 0.045, at: 0 },
      { type: 'square', f0: 620, f1: 480, dur: 0.09, gain: 0.05,  at: 0.085 }
    ] },
    // 答对 / 成组：两声上行
    ok:    { kind: 'multi', list: [
      { type: 'sine', f0: 523, f1: 523, dur: 0.09, gain: 0.05, at: 0 },
      { type: 'sine', f0: 784, f1: 784, dur: 0.12, gain: 0.05, at: 0.1 }
    ] }
  };

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

    const p = SOUNDS[kind];
    if (!p) return;

    // 有对应采样且已解码：播放真实音效文件
    if (p.sample && playSample(c, p.sample)) return;

    if (p.kind === 'clack') {
      clack(c, p);
    } else if (p.kind === 'multi') {
      p.list.forEach(function (b) { blip(c, b, b.at); });
    }
  };
})(window);

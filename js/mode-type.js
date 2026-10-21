/* ============================================================
   模式三：单词打字
   ------------------------------------------------------------
   全部单词按空格隔开铺在屏幕上，逐字输入。
   打错标红、记错误次数；全部打完给出用时与错误统计。
   ============================================================ */
(function (window, document) {
  'use strict';

  const WA = window.WA;
  const SW = window.SW;
  const esc = SW.escapeHtml;
  const $ = function (id) { return document.getElementById(id); };

  const el = {};
  let bound = false;

  const T = {
    book: null,
    limit: 20,
    order: 'seq',
    caseMode: 'loose',
    words: [],
    wi: 0,
    ci: 0,
    typed: 0,
    correct: 0,
    errors: 0,
    totalChars: 0,
    started: false,
    done: false,
    playing: false,
    t0: 0,
    timer: 0,
    curEl: null,
    font: 22
  };

  const FONT_STEPS = [16, 18, 20, 22, 24, 28, 32, 38, 44, 52];

  function collect() {
    el.setup = $('typeSetup');
    el.play = $('typePlay');
    el.result = $('typeResult');
    el.sub = $('typeSub');
    el.limit = $('typeLimit');
    el.order = $('typeOrder');
    el.caseBox = $('typeCase');
    el.start = $('typeStart');
    el.time = $('typeTime');
    el.err = $('typeErr');
    el.progress = $('typeProgress');
    el.acc = $('typeAcc');
    el.stage = $('typeStage');
    el.text = $('typeText');
    el.hintLine = $('typeHintLine');
    el.fontNote = $('typeFontNote');
    el.fontVal = $('typeFontVal');
    el.fontUp = $('typeFontUp');
    el.fontDown = $('typeFontDown');
  }

  function bind() {
    WA.segInit('typeLimit', function (v) { T.limit = parseInt(v, 10) || 0; });
    WA.segInit('typeOrder', function (v) { T.order = v; });
    WA.segInit('typeCase', function (v) { T.caseMode = v; });
    WA.segInit('typeFont', function (v) { setFont(parseInt(v, 10)); });
    el.start.addEventListener('click', function () { start(); });
    el.result.addEventListener('click', onResultClick);
    el.fontUp.addEventListener('click', function () { stepFont(1); el.fontUp.blur(); });
    el.fontDown.addEventListener('click', function () { stepFont(-1); el.fontDown.blur(); });
    window.addEventListener('keydown', onKey);
    setFont(SW.store.get('typeFont', 22));
  }

  /* ---------------- 字号 ---------------- */

  function setFont(px) {
    const size = Math.min(56, Math.max(14, Math.round(Number(px) || 22)));
    T.font = size;
    SW.store.set('typeFont', size);
    if (el.text) el.text.style.fontSize = size + 'px';
    if (el.fontVal) el.fontVal.textContent = size + 'px';
    if (el.fontNote) el.fontNote.textContent = size + 'px';
    const seg = $('typeFont');
    if (seg) {
      Array.prototype.forEach.call(seg.querySelectorAll('button'), function (b) {
        b.classList.toggle('on', parseInt(b.dataset.val, 10) === size);
      });
    }
  }

  function stepFont(dir) {
    const cur = T.font || 22;
    let next = cur;
    if (dir > 0) {
      for (let i = 0; i < FONT_STEPS.length; i++) {
        if (FONT_STEPS[i] > cur) { next = FONT_STEPS[i]; break; }
      }
    } else {
      for (let i = FONT_STEPS.length - 1; i >= 0; i--) {
        if (FONT_STEPS[i] < cur) { next = FONT_STEPS[i]; break; }
      }
    }
    setFont(next);
  }

  /* ---------------- 开局 ---------------- */

  function start() {
    let list = T.book.entries
      .map(function (e) { return e.word; })
      .filter(function (w) { return /^[A-Za-z][A-Za-z'\-.]{0,29}$/.test(w); });

    if (!list.length) {
      window.alert('这个题库里的单词不适合打字练习（含空格或特殊符号）。');
      return;
    }

    if (T.order === 'rand') list = SW.shuffle(list);
    if (T.limit > 0) list = list.slice(0, T.limit);

    T.words = list;
    T.wi = 0; T.ci = 0;
    T.typed = 0; T.correct = 0; T.errors = 0;
    T.totalChars = list.reduce(function (n, w) { return n + w.length; }, 0);
    T.started = false; T.done = false; T.playing = true;
    T.curEl = null;
    clearInterval(T.timer);

    el.setup.hidden = true;
    el.play.hidden = false;
    el.result.hidden = true;
    el.result.innerHTML = '';

    el.time.textContent = '0.0s';
    el.err.textContent = '0';
    el.progress.textContent = '1 / ' + T.words.length;
    el.acc.textContent = '100%';
    setHint('开始输入即计时 · 打完一个单词按空格继续 · Esc 返回');

    renderText();
    setFont(T.font);
    el.stage.scrollTop = 0;
  }

  function renderText() {
    el.text.innerHTML = T.words.map(function (w, wi) {
      const chars = w.split('').map(function (ch, ci) {
        return '<span class="tc" data-w="' + wi + '" data-c="' + ci + '">' + esc(ch) + '</span>';
      }).join('');
      return '<span class="tw" data-wi="' + wi + '">' + chars + '</span>';
    }).join('');
    T.curEl = null;
    setCursor();
  }

  function charEl(w, c) {
    return el.text.querySelector('.tc[data-w="' + w + '"][data-c="' + c + '"]');
  }

  function wordEl(w) {
    return el.text.querySelector('.tw[data-wi="' + w + '"]');
  }

  function setCursor() {
    if (T.curEl) T.curEl.classList.remove('cur');
    Array.prototype.forEach.call(el.text.querySelectorAll('.tw'), function (n) {
      n.classList.remove('active');
    });
    if (T.wi >= T.words.length) { T.curEl = null; return; }
    if (T.ci >= T.words[T.wi].length) { T.curEl = null; return; }   // 单词已打完，等待空格

    const node = charEl(T.wi, T.ci);
    if (node) {
      node.classList.add('cur');
      T.curEl = node;
      if (node.offsetTop < el.stage.scrollTop + 8 ||
          node.offsetTop > el.stage.scrollTop + el.stage.clientHeight - 70) {
        el.stage.scrollTop = Math.max(0, node.offsetTop - el.stage.clientHeight / 2);
      }
    }
    const wn = wordEl(T.wi);
    if (wn) wn.classList.add('active');
  }

  /* ---------------- 键盘 ---------------- */

  function onKey(e) {
    if (!T.playing || T.done) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.isComposing || e.keyCode === 229) return;

    if (e.key === 'Backspace') { e.preventDefault(); back(); return; }
    if (e.key === 'Tab') return;

    // 空格：单词打完必须自己按空格，才进入下一个单词
    if (e.key === ' ') {
      e.preventDefault();
      const len = T.words[T.wi] ? T.words[T.wi].length : 0;
      if (len > 0 && T.ci >= len) {
        if (!T.started) beginTimer();
        SFX.play('space');
        nextWord();
        return;
      }
      if (T.ci === 0) return;             // 词首空格忽略
      T.typed++;
      T.errors++;
      SFX.play('error');
      flashError('这里不该有空格');
      updateHud();
      return;
    }

    if (e.key.length !== 1) return;
    e.preventDefault();

    if (!T.started) beginTimer();

    const word = T.words[T.wi];

    // 当前单词已打完，还在等空格
    if (T.ci >= word.length) {
      T.typed++;
      T.errors++;
      SFX.play('error');
      flashError(T.wi === T.words.length - 1 ? '本节已打完，按空格结束' : '先按空格进入下一个单词');
      updateHud();
      return;
    }

    const target = word.charAt(T.ci);
    const ok = T.caseMode === 'loose'
      ? e.key.toLowerCase() === target.toLowerCase()
      : e.key === target;

    T.typed++;
    if (ok) {
      T.correct++;
      SFX.play('key');
      const node = charEl(T.wi, T.ci);
      if (node) node.classList.add('ok');
      advance();
    } else {
      T.errors++;
      SFX.play('error');
      flashError('应该输入「' + target + '」');
    }
    updateHud();
  }

  function setHint(text, isError) {
    el.hintLine.textContent = text;
    el.hintLine.classList.toggle('err', !!isError);
  }

  function progressHint() {
    return '第 ' + Math.min(T.wi + 1, T.words.length) + ' / ' + T.words.length + ' 个单词 · 打完按空格';
  }

  function flashError(msg) {
    if (T.curEl) {
      // 只加黄色底色标记，不晃动界面；纠正后仍保留到本轮结束
      T.curEl.classList.add('bad');
    }
    setHint(msg, true);
  }

  function advance() {
    T.ci++;
    if (T.ci >= T.words[T.wi].length) {
      const wn = wordEl(T.wi);
      if (wn) wn.classList.add('complete');
      setCursor();
      setHint((T.wi === T.words.length - 1)
        ? '按空格结束本节'
        : '按空格进入下一个单词');
      return;
    }
    setCursor();
    setHint(progressHint());
  }

  function nextWord() {
    const wn = wordEl(T.wi);
    if (wn) { wn.classList.add('done'); wn.classList.remove('complete', 'active'); }
    T.wi++;
    T.ci = 0;
    if (T.wi >= T.words.length) { finish(); return; }
    setCursor();
    setHint(progressHint());
    updateHud();
  }

  function back() {
    if (T.wi === 0 && T.ci === 0) return;
    SFX.play('del');

    const cur = wordEl(T.wi);
    if (cur) cur.classList.remove('complete');

    if (T.ci > 0) {
      T.ci--;
    } else {
      T.wi--;
      T.ci = Math.max(0, T.words[T.wi].length - 1);
      const prev = wordEl(T.wi);
      if (prev) prev.classList.remove('done', 'complete');
    }

    const node = charEl(T.wi, T.ci);
    if (node) node.classList.remove('ok');   // 只取消"已输入"，黄色错误底保留

    setCursor();
    updateHud();
    setHint(progressHint());
  }

  function beginTimer() {
    T.started = true;
    T.t0 = performance.now();
    clearInterval(T.timer);
    T.timer = setInterval(function () {
      el.time.textContent = SW.fmtSec((performance.now() - T.t0) / 1000);
    }, 100);
  }

  function updateHud() {
    el.err.textContent = String(T.errors);
    el.acc.textContent = (T.typed ? Math.round(T.correct / T.typed * 100) : 100) + '%';
    el.progress.textContent = Math.min(T.wi + 1, T.words.length) + ' / ' + T.words.length;
  }

  /* ---------------- 结算 ---------------- */

  function finish() {
    T.done = true;
    T.playing = false;
    clearInterval(T.timer);

    const secs = T.started ? (performance.now() - T.t0) / 1000 : 0;
    const acc = T.typed ? Math.round(T.correct / T.typed * 100) : 100;
    const cpm = secs > 0 ? Math.round(T.totalChars / secs * 60) : 0;

    el.play.hidden = true;
    el.result.hidden = false;
    el.result.innerHTML = '' +
      '<div class="card result">' +
        '<div class="result-head">' +
          '<div class="score"><b>' + SW.fmtSec(secs) + '</b><span>总用时</span></div>' +
          '<div class="result-kv">' +
            '<div><span>错误次数</span><b class="bad">' + T.errors + '</b></div>' +
            '<div><span>正确率</span><b>' + acc + '%</b></div>' +
            '<div><span>速度</span><b>' + cpm + ' 字/分</b></div>' +
          '</div>' +
        '</div>' +
        '<p class="result-note">共 ' + T.words.length + ' 个单词 / ' + T.totalChars + ' 个字符</p>' +
        '<div class="result-actions">' +
          '<button type="button" class="btn primary" data-act="again">再打一次</button>' +
          '<button type="button" class="btn" data-act="setup">调整设置</button>' +
          '<button type="button" class="btn ghost" data-act="home">返回词库</button>' +
        '</div>' +
      '</div>';

    el.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function onResultClick(e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'again') start();
    else if (act === 'setup') {
      el.result.hidden = true;
      el.play.hidden = true;
      el.setup.hidden = false;
    } else if (act === 'home') WA.goHome(true);
  }

  /* ---------------- 对外 ---------------- */

  WA.type = {
    open: function (book) {
      if (!bound) { collect(); bind(); bound = true; }
      T.book = book;
      T.playing = false;
      T.done = false;
      el.sub.textContent = book.title + ' · ' + book.entries.length + ' 个单词';
      el.setup.hidden = false;
      el.play.hidden = true;
      el.result.hidden = true;
      el.result.innerHTML = '';
    },
    isBusy: function () {
      return T.playing && !T.done;
    },
    close: function () {
      T.playing = false;
      clearInterval(T.timer);
    }
  };
})(window, document);

/* ============================================================
   模式一：打字背诵
   ------------------------------------------------------------
   看音标 → 拼写 → 回车判分
   拼对：显示翻译，回车进入下一个
   拼错：提示错误，按空格显示翻译，改对后回车才继续
   空格第二下：显示完整单词（实在想不起来时用），该词记为未通过
   结束：正确率 + 错误单词
   ============================================================ */
(function (window, document) {
  'use strict';

  const WA = window.WA;
  const SW = window.SW;
  const esc = SW.escapeHtml;
  const $ = function (id) { return document.getElementById(id); };

  const el = {};
  let bound = false;

  const S = {
    book: null,
    order: 'seq',
    limit: 0,
    list: [],
    recs: [],
    i: 0,
    phase: 'ask',     // ask 待拼写 | hint 已出错待改正 | ok 已答对待继续
    reveal: 0,        // 0 未提示 | 1 已看翻译 | 2 已看完整单词
    errCount: 0,
    revealCount: 0,
    firstTry: 0,
    playing: false
  };

  function collect() {
    el.setup = $('spellSetup');
    el.play = $('spellPlay');
    el.result = $('spellResult');
    el.sub = $('spellSub');
    el.counter = $('spellCounter');
    el.progress = $('spellProgress');
    el.errCount = $('spellErrCount');
    el.revealCount = $('spellRevealCount');
    el.phonetic = $('spellPhonetic');
    el.mask = $('spellMask');
    el.trans = $('spellTrans');
    el.input = $('spellInput');
    el.msg = $('spellMsg');
    el.order = $('spellOrder');
    el.limitBox = $('spellLimit');
    el.start = $('spellStart');
  }

  function bind() {
    WA.segInit('spellOrder', function (v) { S.order = v; });
    WA.segInit('spellLimit', function (v) { S.limit = parseInt(v, 10) || 0; });
    el.start.addEventListener('click', function () { start(); });
    el.input.addEventListener('keydown', onKey);
    el.result.addEventListener('click', onResultClick);
  }

  /* ---------------- 开局 ---------------- */

  function shuffle(arr) { return SW.shuffle(arr); }

  function start(customList) {
    const base = (customList && customList.length) ? customList.slice() : S.book.entries.slice();
    const cap = S.limit > 0 ? Math.min(S.limit, base.length) : base.length;
    let list;
    if (customList) {
      list = base.slice();
    } else if (S.order === 'rand') {
      list = shuffle(base).slice(0, cap);
    } else {
      list = base.slice(0, cap);
    }
    if (!list.length) return;

    S.list = list;
    S.recs = list.map(function (en) {
      return { en: en, failed: false, revealed: false, firstInput: '' };
    });
    S.i = 0;
    S.errCount = 0;
    S.revealCount = 0;
    S.firstTry = 0;
    S.playing = true;

    el.setup.hidden = true;
    el.play.hidden = false;
    el.result.hidden = true;
    el.result.innerHTML = '';

    render();
  }

  function maskOf(word) {
    const w = String(word || '');
    const chars = [];
    for (let i = 0; i < w.length && i < 40; i++) {
      chars.push(w[i] === ' ' ? ' ' : '_');
    }
    return chars.join(' ');
  }

  function render() {
    const rec = S.recs[S.i];
    S.phase = 'ask';
    S.reveal = 0;

    el.phonetic.textContent = rec.en.phonetic ? '/' + rec.en.phonetic + '/' : '（无音标）';
    el.mask.textContent = maskOf(rec.en.word);
    el.mask.className = 'quiz-mask';
    el.trans.textContent = rec.en.translation || '（无翻译）';
    el.trans.hidden = true;

    el.input.value = '';
    el.input.readOnly = false;
    el.input.disabled = false;
    el.input.className = 'quiz-input';
    el.input.style.display = '';

    el.msg.className = 'quiz-msg';
    el.msg.textContent = '按回车提交答案 · 想不起来可按空格看翻译';

    el.counter.textContent = (S.i + 1) + ' / ' + S.list.length;
    el.progress.style.width = (S.i / S.list.length * 100) + '%';
    updateHud();

    el.input.focus();
  }

  function updateHud() {
    el.errCount.textContent = '错 ' + S.errCount;
    el.revealCount.textContent = '看答案 ' + S.revealCount;
    el.revealCount.hidden = S.revealCount === 0;
  }

  /* ---------------- 键盘 ---------------- */

  function onKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (S.phase === 'ok') { next(); return; }
      check();
      return;
    }
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      if (S.phase === 'ok') return;
      if (window.SFX) window.SFX.play('space');
      if (S.reveal === 0) showTrans();
      else if (S.reveal === 1) revealWord();
      else {
        el.msg.className = 'quiz-msg warn';
        el.msg.textContent = '答案已显示 · 照着打一遍回车，或直接回车跳过';
      }
      return;
    }
    if (e.key === 'Backspace') {
      if (window.SFX) window.SFX.play('del');
      return;
    }
    if (e.key.length === 1 && window.SFX) window.SFX.play('key');
  }

  function same(a, b) {
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  }

  function check() {
    if (!S.playing) return;
    const val = el.input.value.trim();
    const rec = S.recs[S.i];

    if (!val) {
      if (S.reveal === 2) { skip(); return; }   // 已看答案：直接回车跳过
      el.msg.className = 'quiz-msg warn';
      el.msg.textContent = '先输入拼写，再按回车（想不起来可按空格看翻译）';
      return;
    }

    if (same(val, rec.en.word)) {
      S.phase = 'ok';
      if (!rec.failed) S.firstTry++;
      el.mask.textContent = rec.en.word;
      el.mask.className = 'quiz-mask ok';
      el.trans.hidden = false;
      el.input.readOnly = true;
      el.input.className = 'quiz-input ok';
      el.msg.className = 'quiz-msg ok';
      el.msg.textContent = rec.revealed
        ? '✓ 拼写正确，但本题已看答案，记为未通过 —— 按回车继续'
        : (rec.failed ? '✓ 改正正确 —— 按回车继续' : '✓ 正确 —— 按回车进入下一个');
      el.input.focus();
      if (window.SFX) window.SFX.play('ok');
    } else {
      S.errCount++;
      updateHud();
      if (!rec.failed) {
        rec.failed = true;
        rec.firstInput = val;
      }
      S.phase = 'hint';
      el.input.className = 'quiz-input bad';
      el.msg.className = 'quiz-msg bad';
      el.msg.textContent = rec.revealed
        ? '✗ 还没有打对，照着上方的答案再试（再按空格无效果）'
        : '✗ 拼写不正确，按空格查看翻译，改好后再回车';
      el.input.focus();
      if (window.SFX) window.SFX.play('error');
    }
  }

  function showTrans() {
    S.reveal = 1;
    el.trans.hidden = false;
    el.msg.className = 'quiz-msg warn';
    el.msg.textContent = '已显示翻译 · 再按一次空格可看完整单词（该词会记为未通过）';
  }

  function revealWord() {
    const rec = S.recs[S.i];
    S.reveal = 2;
    if (!rec.revealed) {
      rec.revealed = true;
      S.revealCount++;
    }
    rec.failed = true;

    el.trans.hidden = false;
    el.mask.textContent = rec.en.word;
    el.mask.className = 'quiz-mask reveal';
    el.input.className = 'quiz-input';
    el.msg.className = 'quiz-msg warn';
    el.msg.textContent = '答案已显示，本词记为未通过 · 照着打一遍回车，或直接回车跳过';
    updateHud();
    if (window.SFX) window.SFX.play('error');
    el.input.focus();
  }

  function skip() {
    if (window.SFX) window.SFX.play('del');
    next();
  }

  function next() {
    S.i++;
    if (S.i >= S.list.length) { finish(); return; }
    render();
  }

  /* ---------------- 结算 ---------------- */

  function finish() {
    S.playing = false;
    S.phase = 'done';

    const total = S.list.length;
    const acc = total ? Math.round(S.firstTry / total * 100) : 0;
    const wrong = S.recs.filter(function (r) { return r.failed; });

    el.play.hidden = true;
    el.result.hidden = false;
    el.result.innerHTML = resultHtml(total, acc, wrong);
    el.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resultHtml(total, acc, wrong) {
    const revealed = S.recs.filter(function (r) { return r.revealed; }).length;

    const wrongHtml = wrong.length
      ? '<ul class="wrong-list">' + wrong.map(function (r) {
          const en = r.en;
          return '<li class="wrong-item">' +
            '<div class="wl-main">' +
              '<b>' + esc(en.word) + '</b>' +
              (en.phonetic ? '<span class="wl-phon">/' + esc(en.phonetic) + '/</span>' : '') +
              '<span class="wl-trans">' + esc(en.translation || '—') + '</span>' +
              (r.revealed ? '<span class="wl-tag">看答案</span>' : '') +
            '</div>' +
            (r.firstInput ? '<div class="wl-try">你的输入：' + esc(r.firstInput) + '</div>' : '') +
          '</li>';
        }).join('') + '</ul>'
      : '<p class="perfect">🎉 全部一次拼对，没有错误单词。</p>';

    return '' +
      '<div class="card result">' +
        '<div class="result-head">' +
          '<div class="score"><b>' + acc + '%</b><span>正确率</span></div>' +
          '<div class="result-kv">' +
            '<div><span>总词数</span><b>' + total + '</b></div>' +
            '<div><span>一次通过</span><b>' + (total - wrong.length) + '</b></div>' +
            (revealed ? '<div><span>看答案</span><b class="bad">' + revealed + '</b></div>' : '') +
            '<div><span>错误次数</span><b class="bad">' + S.errCount + '</b></div>' +
          '</div>' +
        '</div>' +
        '<h3 class="result-title">错误单词（' + wrong.length + '）</h3>' +
        wrongHtml +
        '<div class="result-actions">' +
          '<button type="button" class="btn primary" data-act="again">再练一遍</button>' +
          '<button type="button" class="btn" data-act="wrong"' + (wrong.length ? '' : ' disabled') + '>只练错词</button>' +
          '<button type="button" class="btn ghost" data-act="home">返回词库</button>' +
        '</div>' +
      '</div>';
  }

  function onResultClick(e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn || btn.disabled) return;
    const act = btn.dataset.act;
    if (act === 'again') {
      start();
    } else if (act === 'wrong') {
      const list = S.recs.filter(function (r) { return r.failed; }).map(function (r) { return r.en; });
      if (list.length) start(list);
    } else if (act === 'home') {
      WA.goHome(true);
    }
  }

  /* ---------------- 对外 ---------------- */

  WA.spell = {
    open: function (book) {
      if (!bound) { collect(); bind(); bound = true; }
      S.book = book;
      S.playing = false;
      el.sub.textContent = book.title + ' · ' + book.entries.length + ' 个单词';
      el.setup.hidden = false;
      el.play.hidden = true;
      el.result.hidden = true;
      el.result.innerHTML = '';
    },
    isBusy: function () {
      return S.playing;
    },
    current: function () {
      return S.playing && S.i < S.list.length ? S.recs[S.i].en : null;
    },
    close: function () {
      S.playing = false;
    }
  };
})(window, document);

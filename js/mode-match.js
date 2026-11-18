/* ============================================================
   模式二：对象连接
   ------------------------------------------------------------
   三块一组：单词 + 音标 + 翻译。
   依次点三个方块，选满三块即自动成组（同色 + 编号）；
   点已成组的方块可把这一组拆开重选；
   全部组好后点「确定」逐词判定对错。
   ============================================================ */
(function (window, document) {
  'use strict';

  const WA = window.WA;
  const SW = window.SW;
  const SFX = window.SFX;
  const esc = SW.escapeHtml;
  const $ = function (id) { return document.getElementById(id); };

  const TYPES = ['word', 'phon', 'trans'];
  const LABEL = { word: '单词', phon: '音标', trans: '翻译' };
  const NEED = 3;

  const el = {};
  let bound = false;

  const M = {
    book: null,
    size: 5,
    entries: [],
    blocks: [],
    assign: [],
    pending: [],
    history: [],
    marked: {},
    nextGroup: 1,
    checked: false,
    playing: false
  };

  const HUES = [212, 152, 28, 282, 342, 190, 96, 262];
  function hueOf(g) { return HUES[(Math.max(1, g) - 1) % HUES.length]; }

  function collect() {
    el.setup = $('matchSetup');
    el.play = $('matchPlay');
    el.result = $('matchResult');
    el.sub = $('matchSub');
    el.size = $('matchSize');
    el.start = $('matchStart');
    el.tray = $('matchTray');
    el.board = $('matchBoard');
    el.tip = $('matchTip');
    el.undo = $('matchUndo');
    el.reset = $('matchReset');
    el.check = $('matchCheck');
  }

  function bind() {
    WA.segInit('matchSize', function (v) { M.size = parseInt(v, 10) || 5; });
    el.start.addEventListener('click', function () { start(); });
    el.board.addEventListener('click', onBoardClick);
    el.tray.addEventListener('click', onTrayClick);
    el.undo.addEventListener('click', undo);
    el.reset.addEventListener('click', reset);
    el.check.addEventListener('click', check);
    el.result.addEventListener('click', onResultClick);
  }

  /* ---------------- 生成棋盘 ---------------- */

  function pool() {
    return M.book.entries.filter(function (e) { return e.phonetic; });
  }

  function start(preset) {
    const p = pool();
    if (p.length < 3) {
      window.alert('这个题库缺少音标，无法进行对象连接。\n请给每行补上音标，例如：apple /ˈæpl/ 苹果');
      return;
    }
    const n = Math.min(M.size, p.length);
    M.entries = (preset && preset.length) ? preset.slice() : SW.sample(p, n);
    buildBoard();
  }

  function buildBoard() {
    M.blocks = [];
    M.entries.forEach(function (en, ei) {
      M.blocks.push({ e: ei, t: 'word', text: en.word });
      M.blocks.push({ e: ei, t: 'phon', text: en.phonetic ? '/' + en.phonetic + '/' : '（无音标）' });
      M.blocks.push({ e: ei, t: 'trans', text: en.translation || '（无翻译）' });
    });
    M.blocks = SW.shuffle(M.blocks);
    M.assign = M.blocks.map(function () { return null; });
    M.pending = [];
    M.history = [];
    M.marked = {};
    M.nextGroup = 1;
    M.checked = false;
    M.playing = true;

    el.setup.hidden = true;
    el.play.hidden = false;
    el.result.hidden = true;
    el.result.innerHTML = '';

    render();
  }

  /* ---------------- 组号 / 渲染 ---------------- */

  function groupIds() {
    const ids = [];
    M.assign.forEach(function (g) { if (g && ids.indexOf(g) < 0) ids.push(g); });
    return ids.sort(function (a, b) { return a - b; });
  }

  function groupOrder() {
    const map = {};
    groupIds().forEach(function (g, i) { map[g] = i + 1; });
    return map;
  }

  function render() {
    const order = groupOrder();

    el.board.innerHTML = M.blocks.map(function (b, i) {
      const g = M.assign[i];
      const mark = M.marked[i];
      const cls = ['mblock'];
      if (g) cls.push('grouped');
      if (M.pending.indexOf(i) >= 0) cls.push('sel');
      if (mark) cls.push(mark);
      const style = g ? ' style="--g:' + hueOf(g) + '"' : '';
      const badge = g ? '<span class="mbadge">' + order[g] + '</span>' : '';
      return '<button type="button" class="' + cls.join(' ') + '" data-i="' + i + '" data-e="' + b.e + '" data-t="' + b.t + '"' +
        ' data-g="' + (g || '') + '"' + style + '>' +
        badge + '<span class="mtext">' + esc(b.text) + '</span></button>';
    }).join('');

    renderTray();
    setTip(defaultTip());
  }

  function renderTray() {
    const picked = {};
    M.pending.forEach(function (i) { picked[M.blocks[i].t] = i; });

    const slots = TYPES.map(function (t) {
      const i = picked[t];
      if (i == null) {
        return '<button type="button" class="slot empty" data-slot="' + t + '">' +
          '<span class="slot-tag">' + LABEL[t] + '</span>' +
          '<span class="slot-val">待选择</span></button>';
      }
      return '<button type="button" class="slot filled" data-slot="' + t + '" data-i="' + i + '">' +
        '<span class="slot-tag">' + LABEL[t] + '</span>' +
        '<span class="slot-val">' + esc(M.blocks[i].text) + '</span>' +
        '<span class="slot-x">×</span></button>';
    }).join('');

    const left = NEED - M.pending.length;
    el.tray.innerHTML =
      '<div class="tray-head">' +
        '<span>本组 <b>' + M.pending.length + '</b> / ' + NEED + ' 块' +
          '<em>' + (M.pending.length
            ? '再选 ' + left + ' 块自动成组'
            : '单词 + 音标 + 翻译 = 一组') + '</em></span>' +
        '<span>已组好 <b>' + groupIds().length + '</b> / ' + M.entries.length + ' 组</span>' +
      '</div>' +
      '<div class="tray-slots">' + slots + '</div>';
  }

  function defaultTip() {
    if (M.checked) return '本轮已判定，看下方结果';
    if (M.pending.length) {
      return '已选 ' + M.pending.length + ' / ' + NEED + ' 块，还差 ' + (NEED - M.pending.length) + ' 块（点槽位可取消）';
    }
    return '点三个方块组成一组：单词 + 音标 + 翻译';
  }

  function setTip(t) {
    el.tip.textContent = t;
  }

  /* ---------------- 选块 ---------------- */

  function onBoardClick(e) {
    const btn = e.target.closest('.mblock');
    if (!btn || M.checked) return;
    const i = parseInt(btn.dataset.i, 10);
    if (isNaN(i)) return;

    // 已成组：整组拆开
    if (M.assign[i]) { dissolve(M.assign[i]); return; }

    // 再点一次取消
    const at = M.pending.indexOf(i);
    if (at >= 0) {
      M.pending.splice(at, 1);
      SFX.play('del');
      render();
      return;
    }

    // 同类型已选：换成新点的这块
    const type = M.blocks[i].t;
    const same = M.pending.findIndex(function (j) { return M.blocks[j].t === type; });
    if (same >= 0) {
      M.pending[same] = i;
      SFX.play('space');
      render();
      setTip('本组已换成「' + M.blocks[i].text + '」，还差 ' + (NEED - M.pending.length) + ' 块');
      return;
    }

    M.pending.push(i);
    SFX.play('key');

    if (M.pending.length >= NEED) { commit(); return; }
    render();
  }

  function onTrayClick(e) {
    if (M.checked) return;
    const slot = e.target.closest('.slot.filled');
    if (!slot) return;
    const i = M.pending.indexOf(parseInt(slot.dataset.i, 10));
    if (i < 0) return;
    M.pending.splice(i, 1);
    SFX.play('del');
    render();
  }

  /* ---------------- 成组 / 拆开 ---------------- */

  function snapshot() {
    M.history.push({ assign: M.assign.slice(), pending: M.pending.slice() });
  }

  function commit() {
    snapshot();
    const g = M.nextGroup++;
    const picked = M.pending.slice();
    picked.forEach(function (i) { M.assign[i] = g; });
    M.pending = [];
    SFX.play('ok');
    render();
    setTip('第 ' + groupOrder()[g] + ' 组已组成 · 点其中任一方块可拆开重选');
  }

  function dissolve(g) {
    const order = groupOrder();
    const no = order[g];
    snapshot();
    for (let i = 0; i < M.assign.length; i++) if (M.assign[i] === g) M.assign[i] = null;
    SFX.play('del');
    render();
    setTip('第 ' + no + ' 组已拆开，重新选三块');
  }

  function undo() {
    if (M.checked) return;
    if (!M.history.length) { setTip('还没有可撤销的操作'); return; }
    const prev = M.history.pop();
    M.assign = prev.assign;
    M.pending = prev.pending;
    SFX.play('del');
    render();
  }

  function reset() {
    if (M.checked) return;
    if (!M.history.length && !M.pending.length) return;
    M.assign = M.blocks.map(function () { return null; });
    M.pending = [];
    M.history = [];
    M.nextGroup = 1;
    render();
    setTip('已清空所有编组');
  }

  /* ---------------- 判定 ---------------- */

  function check() {
    const used = M.assign.filter(Boolean).length;
    if (!used) {
      setTip('还没有组好的方块，先选三块试试');
      return;
    }

    M.checked = true;
    M.pending = [];
    M.marked = {};

    const results = M.entries.map(function (en, ei) {
      const idx = TYPES.map(function (t) {
        return M.blocks.findIndex(function (b) { return b.e === ei && b.t === t; });
      });
      const groups = idx.map(function (i) { return M.assign[i] || null; });
      const same = !!groups[0] && groups.every(function (g) { return g === groups[0]; });
      const ok = same && countGroup(groups[0]) === NEED;
      idx.forEach(function (i) {
        if (ok) M.marked[i] = 'ok';
        else if (M.assign[i]) M.marked[i] = 'bad';
      });
      return { en: en, idx: idx, groups: groups, ok: ok };
    });

    const right = results.filter(function (r) { return r.ok; }).length;
    const unbound = M.assign.filter(function (g) { return !g; }).length;

    render();
    showResult(results, right, unbound);
  }

  function countGroup(g) {
    let n = 0;
    for (let i = 0; i < M.assign.length; i++) if (M.assign[i] === g) n++;
    return n;
  }

  function showResult(results, right, unbound) {
    const total = results.length;
    const acc = total ? Math.round(right / total * 100) : 0;
    const order = groupOrder();

    const rows = results.map(function (r) {
      const en = r.en;
      const chips = r.idx.map(function (bi, k) {
        const g = M.assign[bi];
        if (!g) {
          return '<span class="gchip none">' + LABEL[TYPES[k]] + ' 未绑定</span>';
        }
        return '<span class="gchip" style="--g:' + hueOf(g) + '"><i></i>' + LABEL[TYPES[k]] + ' 第' + order[g] + '组</span>';
      }).join('');

      return '<li class="check-item ' + (r.ok ? 'ok' : 'bad') + '">' +
        '<span class="ci-mark">' + (r.ok ? '✓' : '✗') + '</span>' +
        '<div class="ci-body">' +
          '<div class="ci-word">' +
            '<b>' + esc(en.word) + '</b>' +
            (en.phonetic ? '<span class="wl-phon">/' + esc(en.phonetic) + '/</span>' : '') +
            '<span class="wl-trans">' + esc(en.translation || '—') + '</span>' +
          '</div>' +
          (r.ok ? '' : '<div class="ci-groups">' + chips + '</div>') +
        '</div>' +
      '</li>';
    }).join('');

    el.result.hidden = false;
    // 清掉棋盘按钮的焦点，避免结算后按 Enter 误触发棋盘
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    el.result.innerHTML = '' +
      '<div class="card result">' +
        '<div class="result-head">' +
          '<div class="score"><b>' + acc + '%</b><span>完全正确</span></div>' +
          '<div class="result-kv">' +
            '<div><span>单词数</span><b>' + total + '</b></div>' +
            '<div><span>正确组</span><b>' + right + '</b></div>' +
            '<div><span>未绑定</span><b class="' + (unbound ? 'bad' : '') + '">' + unbound + '</b></div>' +
          '</div>' +
        '</div>' +
        '<h3 class="result-title">逐词结果</h3>' +
        '<ul class="check-list">' + rows + '</ul>' +
        '<div class="result-actions">' +
          '<button type="button" class="btn primary" data-act="next" data-keys="1,n">换一批 <kbd class="btn-key">1</kbd></button>' +
          '<button type="button" class="btn" data-act="retry" data-keys="2,r">重做本轮 <kbd class="btn-key">2</kbd></button>' +
          '<button type="button" class="btn ghost" data-act="home" data-keys="3,q">返回词库 <kbd class="btn-key">3</kbd></button>' +
        '</div>' +
        '<p class="result-keys">不用鼠标直接按键盘：' +
          '<kbd>Enter</kbd> 或 <kbd>N</kbd> 换一批 · ' +
          '<kbd>R</kbd> 重做本轮 · ' +
          '<kbd>Esc</kbd> 返回词库（也可以用 <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>）' +
        '</p>' +
      '</div>';

    el.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function onResultClick(e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'next') start();
    else if (act === 'retry') start(M.entries);
    else if (act === 'home') WA.goHome(true);
  }

  /* ---------------- 对外 ---------------- */

  WA.match = {
    open: function (book) {
      if (!bound) { collect(); bind(); bound = true; }
      M.book = book;
      M.playing = false;
      M.checked = false;
      M.pending = [];
      el.sub.textContent = book.title + ' · ' + book.entries.length + ' 个单词';
      el.setup.hidden = false;
      el.play.hidden = true;
      el.result.hidden = true;
      el.result.innerHTML = '';
    },
    isBusy: function () {
      return M.playing && !M.checked;
    },
    close: function () {
      M.playing = false;
    }
  };
})(window, document);

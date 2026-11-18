/* ============================================================
   主应用：视图切换、词库发现与列表、模式调度
   ============================================================ */
(function (window, document) {
  'use strict';

  const WA = window.WA = window.WA || {};
  const SW = window.SW;
  const WP = window.WP;
  const esc = SW.escapeHtml;
  const $ = function (id) { return document.getElementById(id); };

  const MODE_LABEL = { spell: '打字背诵', match: '对象连接', type: '单词打字' };
  const VIEWS = ['books', 'spell', 'match', 'type'];

  const state = WA.state = {
    books: [],
    current: null,
    mode: null,
    query: '',
    source: ''
  };

  const el = {};

  function collect() {
    el.main = $('main');
    el.btnBack = $('btnBack');
    el.btnImport = $('btnImport');
    el.btnRescan = $('btnRescan');
    el.btnTheme = $('btnTheme');
    el.btnSound = $('btnSound');
    el.folderInput = $('folderInput');
    el.viewBooks = $('view-books');
    el.viewSpell = $('view-spell');
    el.viewMatch = $('view-match');
    el.viewType = $('view-type');
    el.booksMeta = $('booksMeta');
    el.bookList = $('bookList');
    el.booksEmpty = $('booksEmpty');
    el.emptyTitle = $('emptyTitle');
    el.emptyText = $('emptyText');
    el.emptyPick = $('emptyPick');
    el.searchInput = $('searchInput');
    el.searchRow = $('searchRow');
    el.statusDot = $('statusDot');
    el.statusText = $('statusText');
    el.statusRight = $('statusRight');
    el.brandSub = $('brandSub');
  }

  /* ---------------- 状态栏 ---------------- */

  WA.setStatus = function (kind, text, right) {
    el.statusDot.className = 'dot' + (kind ? ' ' + kind : '');
    el.statusText.textContent = text || '';
    el.statusRight.textContent = right || '';
  };

  /* ---------------- 视图 ---------------- */

  WA.showView = function (name) {
    VIEWS.forEach(function (n) {
      const node = el['view' + n.charAt(0).toUpperCase() + n.slice(1)];
      if (node) node.hidden = (n !== name);
    });
    el.btnBack.hidden = (name === 'books');
    el.searchRow.hidden = (name !== 'books');
    if (name === 'books') {
      state.mode = null;
      state.current = null;
      el.brandSub.textContent = '自动扫描 words 文件夹';
    } else {
      state.mode = name;
    }
    el.main.scrollTop = 0;
  };

  WA.goHome = function (force) {
    const impl = state.mode && WA[state.mode];
    if (!force && impl && impl.isBusy && impl.isBusy()) {
      if (!window.confirm('本轮练习还没结束，返回会丢失进度。确定返回词库吗？')) return;
    }
    if (impl && impl.close) impl.close();
    WA.showView('books');
    renderBooks();
  };

  /* ---------------- 分段控件 ---------------- */

  WA.segInit = function (id, onChange) {
    const box = $(id);
    if (!box) return;
    box.addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-val]');
      if (!btn) return;
      box.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b === btn); });
      onChange(btn.dataset.val);
    });
  };

  /* ---------------- 词库列表 ---------------- */

  function sortedBooks(list) {
    return list.slice().sort(function (a, b) {
      return a.title.localeCompare(b.title, 'zh-Hans-CN');
    });
  }

  function renderBooks() {
    const q = state.query.trim().toLowerCase();
    const all = state.books;
    const list = all.filter(function (b) { return !q || b.title.toLowerCase().indexOf(q) >= 0; });

    el.bookList.innerHTML = list.map(function (b) {
      const preview = b.entries.slice(0, 5).map(function (e) { return e.word; }).join(' · ');
      return '' +
        '<article class="book" data-key="' + esc(b.key) + '">' +
          '<div class="book-top">' +
            '<h3 class="book-title">' + esc(b.title) + '</h3>' +
            '<span class="book-count">' + b.entries.length + ' 词</span>' +
          '</div>' +
          '<p class="book-file">' + esc(b.file) + '</p>' +
          '<p class="book-preview">' + esc(preview) + (b.entries.length > 5 ? ' …' : '') + '</p>' +
          '<div class="book-actions">' +
            '<button type="button" class="btn" data-mode="spell">打字背诵</button>' +
            '<button type="button" class="btn" data-mode="match">对象连接</button>' +
            '<button type="button" class="btn" data-mode="type">单词打字</button>' +
          '</div>' +
        '</article>';
    }).join('');

    if (!all.length) {
      el.booksEmpty.hidden = false;
      el.bookList.hidden = true;
    } else if (!list.length) {
      el.booksEmpty.hidden = false;
      el.bookList.hidden = true;
      el.emptyTitle.textContent = '没有匹配的词库';
      el.emptyText.textContent = '换个关键词试试，或者清空搜索框。';
      el.emptyPick.hidden = true;
    } else {
      el.booksEmpty.hidden = true;
      el.bookList.hidden = false;
      el.emptyPick.hidden = false;
    }

    if (all.length) {
      const total = all.reduce(function (n, b) { return n + b.entries.length; }, 0);
      el.booksMeta.textContent = '共 ' + all.length + ' 个词库 · ' + total + ' 个单词' +
        (state.source ? ' · 来源：' + state.source : '');
    }
  }

  function showEmptyDiagnostic(err) {
    el.bookList.innerHTML = '';
    el.bookList.hidden = true;
    el.booksEmpty.hidden = false;
    el.emptyPick.hidden = false;

    let title = '没有找到词库';
    let text = '';

    if (err && err.fileProtocol) {
      title = '直接双击打开时无法自动扫描';
      text = '浏览器不允许 file:// 页面读取本地文件夹内容。点下面的按钮选择 words 文件夹即可；' +
             '或者用项目里的 <code>start.bat</code> / <code>python tools/local_server.py</code> 启动后再打开。';
    } else if (err && err.status === 403) {
      title = '服务器禁止目录浏览（403）';
      text = 'IIS / nginx 未开启目录浏览。可以：① 开启目录浏览；② 运行 <code>python tools/make_manifest.py</code> 生成 manifest.json 后刷新。';
    } else if (err && err.status === 404) {
      title = '没有找到 words 目录（404）';
      text = '请在 <code>index.html</code> 的同级目录新建 <code>words</code> 文件夹，把 <code>.txt</code> 词库放进去，然后点右上角刷新。';
    } else if (err && err.noDir) {
      title = 'words 目录打不开';
      text = '目录存在但读不到列表。确认服务器开启了目录浏览，或生成 <code>manifest.json</code>；也可以直接点下面的按钮导入本地文件夹。';
    } else {
      title = '没有读到词库';
      text = '把 <code>.txt</code> 词库放进 <code>words</code> 文件夹，或用下面的按钮手动选择文件夹。';
    }

    el.emptyTitle.textContent = title;
    el.emptyText.innerHTML = text;
    el.booksMeta.textContent = '没有可用的词库';
  }

  /* ---------------- 加载词库 ---------------- */

  function makeBook(fileName, text) {
    const parsed = WP.parse(text);
    return {
      key: fileName,
      file: fileName,
      title: WP.titleOf(fileName),
      entries: parsed.entries,
      skipped: parsed.skipped
    };
  }

  async function loadBookFromUrl(f) {
    const res = await fetch(f.url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = await res.arrayBuffer();
    const book = makeBook(f.name, WP.decode(buf));
    if (!book.entries.length) throw new Error('空词库');
    return book;
  }

  async function scan() {
    WA.setStatus('', '正在扫描 words 文件夹…');
    el.booksMeta.textContent = '正在扫描 words 文件夹…';
    el.bookList.innerHTML = '';
    el.booksEmpty.hidden = true;

    let files = [];
    let source = '';
    try {
      const res = await SW.loadAll({ dirs: ['words'], exts: ['txt'], manifestUrl: 'manifest.json' });
      files = res.files;
      source = res.source === 'manifest' ? 'manifest.json' : '目录扫描';
    } catch (err) {
      state.books = [];
      state.source = '';
      showEmptyDiagnostic(err);
      WA.setStatus('error', err.fileProtocol ? 'file:// 环境，需手动选择文件夹' : '没有读取到 words 目录');
      return;
    }

    const books = [];
    let failed = 0;
    for (const f of files) {
      try {
        books.push(await loadBookFromUrl(f));
      } catch (e) { failed++; }
    }

    state.books = sortedBooks(books);
    state.source = source;

    if (!state.books.length) {
      showEmptyDiagnostic(failed ? new Error('empty') : { noDir: true });
      WA.setStatus('error', 'words 目录里没有可用的 txt 词库');
      return;
    }

    renderBooks();
    WA.setStatus('ready', '已加载 ' + state.books.length + ' 个词库', source + (failed ? ' · 跳过 ' + failed + ' 个' : ''));
  }

  async function loadFromFileList(fileList) {
    const files = Array.prototype.slice.call(fileList || []).filter(function (f) {
      return /\.txt$/i.test(f.name);
    });
    if (!files.length) {
      window.alert('选中的文件夹里没有 .txt 词库文件。');
      return;
    }

    WA.setStatus('', '正在读取本地词库…');
    const books = [];
    for (const f of files) {
      try {
        const buf = await f.arrayBuffer();
        const book = makeBook(f.name, WP.decode(buf));
        if (book.entries.length) books.push(book);
      } catch (e) { /* 跳过读不了的文件 */ }
    }

    if (!books.length) {
      window.alert('这些 txt 里没有解析到单词，检查每行是否为「单词 音标 翻译」。');
      return;
    }

    state.books = sortedBooks(books);
    state.source = '本地文件夹';
    renderBooks();
    WA.setStatus('ready', '已导入 ' + state.books.length + ' 个词库（本次会话有效）');
  }

  async function pickFolder() {
    if (window.showDirectoryPicker && location.protocol !== 'file:') {
      try {
        const dir = await window.showDirectoryPicker();
        const files = [];
        for await (const entry of dir.values()) {
          if (entry.kind === 'file' && /\.txt$/i.test(entry.name)) {
            files.push(await entry.getFile());
          }
        }
        if (!files.length) {
          window.alert('这个文件夹里没有 .txt 词库文件。');
          return;
        }
        await loadFromFileList(files);
        return;
      } catch (e) {
        if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) {
          if (e.name === 'AbortError') return;
        }
        /* 其它错误继续走 input 兜底 */
      }
    }
    el.folderInput.click();
  }
  WA.pickFolder = pickFolder;

  /* ---------------- 进入模式 ---------------- */

  function openMode(book, mode) {
    if (!book || !book.entries.length) {
      window.alert('这个词库没有解析到单词，检查 txt 每行格式是否为「单词 音标 翻译」。');
      return;
    }
    const impl = WA[mode];
    if (!impl || !impl.open) return;

    state.current = book;
    WA.showView(mode);
    impl.open(book);
    el.brandSub.textContent = MODE_LABEL[mode] + ' · ' + book.title;
  }

  /* ---------------- 结算页键盘快捷键 ----------------
     三个模式的结算页按钮统一带 data-keys（逗号分隔，小写），
     戴上 <kbd> 角标；在这里集中拦截，完全不用鼠标。
       Enter     → 第一个主按钮（若焦点已在结算按钮上则交给原生点击）
       1/2/3    → 对应第 1/2/3 个按钮（各模式另有字母别名）
       Escape   → 返回词库（下方全局处理）
     -------------------------------------------------- */

  function visibleResultButtons() {
    const view = document.querySelector('.view:not([hidden])');
    if (!view) return [];
    const wrap = view.querySelector('#spellResult, #matchResult, #typeResult');
    if (!wrap || wrap.hidden) return [];
    return Array.prototype.slice.call(
      wrap.querySelectorAll('.result-actions button[data-keys]:not(:disabled)')
    );
  }

  function handleResultKeys(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.keyCode === 229) return;
    const btns = visibleResultButtons();
    if (!btns.length) return;

    const key = (e.key || '').toLowerCase();
    let hit = null;

    if (e.key === 'Enter') {
      // 焦点在结算按钮上时让浏览器原生激活该按钮，避免一次按键触发两个动作
      const ae = document.activeElement;
      if (ae && ae.tagName === 'BUTTON' && ae.closest('.result-actions')) return;
      hit = btns.filter(function (b) { return b.classList.contains('primary'); })[0] || btns[0];
    } else {
      btns.forEach(function (b) {
        const keys = b.dataset.keys.split(',').map(function (s) { return s.trim().toLowerCase(); });
        if (keys.indexOf(key) >= 0) hit = b;
      });
    }
    if (!hit) return;

    // 捕获阶段拦截：既避免同一事件里「先出结算页、再被当成快捷键」的重复触发，
    // 也防止按键继续冒泡到打字模式，把 r/s/1 等快捷键误当成字母输入
    e.preventDefault();
    e.stopPropagation();
    hit.click();
    hit.classList.add('key-hit');
    setTimeout(function () { hit.classList.remove('key-hit'); }, 180);
  }

  /* ---------------- 事件绑定 ---------------- */

  function bind() {
    el.btnTheme.addEventListener('click', function () {
      SW.theme.toggle();
    });

    el.btnSound.addEventListener('click', function () {
      if (window.SFX) window.SFX.toggle();
    });

    el.btnRescan.addEventListener('click', function () {
      scan();
    });

    el.btnBack.addEventListener('click', function () { WA.goHome(false); });

    el.btnImport.addEventListener('click', pickFolder);
    el.emptyPick.addEventListener('click', pickFolder);

    el.folderInput.addEventListener('change', function () {
      loadFromFileList(el.folderInput.files);
      el.folderInput.value = '';
    });

    el.searchInput.addEventListener('input', function () {
      state.query = el.searchInput.value;
      renderBooks();
    });

    el.bookList.addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-mode]');
      if (!btn) return;
      const card = btn.closest('.book');
      if (!card) return;
      const book = state.books.find(function (b) { return b.key === card.dataset.key; });
      openMode(book, btn.dataset.mode);
    });

    // 捕获阶段：结算页是否存在以「按键发生的那一刻」为准
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (state.mode) WA.goHome(false);
        return;
      }
      handleResultKeys(e);
    }, true);
  }

  /* ---------------- 启动 ---------------- */

  function init() {
    collect();
    SW.theme.init('dark');
    if (window.SFX) window.SFX.init();
    bind();
    WA.showView('books');
    WA.setStatus('', '正在扫描…');
    scan();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window, document);

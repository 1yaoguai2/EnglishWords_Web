/* ============================================================
   基础设施：主题、本地存储、目录发现、通用工具
   （沿用 static-web-app 技能骨架，前缀改为 word）
   ============================================================ */
(function (window, document) {
  'use strict';

  const SW = window.SW || {};

  SW.PREFIX = 'word';
  SW.THEME_KEY = 'theme';

  /* ---------------- 字符串工具 ---------------- */

  SW.extOf = function (name) {
    const i = String(name || '').lastIndexOf('.');
    return i >= 0 ? String(name).slice(i + 1).toLowerCase() : '';
  };

  SW.baseName = function (name) {
    const s = String(name || '').split('/').pop();
    const i = s.lastIndexOf('.');
    return i > 0 ? s.slice(0, i) : s;
  };

  SW.escapeHtml = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  SW.shuffle = function (arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };

  SW.sample = function (arr, n) {
    return SW.shuffle(arr).slice(0, Math.max(0, n));
  };

  SW.fmtSec = function (sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    if (sec < 60) return sec.toFixed(1) + 's';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' + s : s);
  };

  /* ---------------- 本地存储 ---------------- */

  SW.store = {
    key: function (k) { return (SW.PREFIX || 'app') + ':' + k; },
    get: function (k, fallback) {
      try {
        const raw = localStorage.getItem(SW.store.key(k));
        if (raw == null) return fallback;
        return JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (k, value) {
      try { localStorage.setItem(SW.store.key(k), JSON.stringify(value)); } catch (e) { /* 隐私模式 */ }
    }
  };

  /* ---------------- 双主题 ---------------- */

  SW.theme = {
    current: 'dark',

    init: function (defaultTheme) {
      const saved = SW.store.get(SW.THEME_KEY, null);
      let t = saved;
      if (t !== 'dark' && t !== 'light') {
        t = (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches)
          ? 'light' : (defaultTheme || 'dark');
      }
      SW.theme.current = t;
      SW.theme.apply();
      return t;
    },

    apply: function () {
      document.documentElement.setAttribute('data-theme', SW.theme.current);
    },

    toggle: function () {
      SW.theme.current = SW.theme.current === 'dark' ? 'light' : 'dark';
      SW.theme.apply();
      SW.store.set(SW.THEME_KEY, SW.theme.current);
      return SW.theme.current;
    }
  };

  /* ---------------- 服务器目录列表解析 ---------------- */

  /**
   * 读取一个可浏览目录，返回 { files: [{url,name}], dirs: [url], url }
   * 只依赖 a[href]，兼容 IIS / nginx autoindex / Apache / Python http.server
   */
  SW.listWebDirectory = async function (dirUrl) {
    const res = await fetch(dirUrl, { cache: 'no-store' });
    if (!res.ok) {
      const err = new Error('HTTP ' + res.status);
      err.status = res.status;
      throw err;
    }

    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const base = res.url || dirUrl;

    const files = [];
    const dirs = [];
    let isListing = false;

    if (/index of|directory listing|目录列表|目录浏览/i.test(doc.title || '')) isListing = true;

    doc.querySelectorAll('a[href]').forEach(function (a) {
      const raw = (a.getAttribute('href') || '').trim();
      if (!raw) return;
      if (raw === '../' || raw === '..') { isListing = true; return; }
      if (raw.charAt(0) === '?' || raw.charAt(0) === '#') return;

      let abs;
      try {
        abs = new URL(raw, base.charAt(base.length - 1) === '/' ? base : base + '/').href;
      } catch (e) { return; }

      if (abs === base || abs.indexOf(base) !== 0) return;

      const relPath = abs.slice(base.length);
      if (!relPath) return;

      if (raw.charAt(raw.length - 1) === '/' || relPath.charAt(relPath.length - 1) === '/') {
        dirs.push(abs);
      } else {
        let name = relPath.split('/').pop();
        try { name = decodeURIComponent(name); } catch (e) { /* 保留原样 */ }
        if (name) files.push({ url: abs, name: name });
      }
    });

    if (!isListing && !files.length && !dirs.length) {
      const err = new Error('该地址不是目录列表');
      err.notListing = true;
      throw err;
    }

    return { files: files, dirs: dirs, url: base };
  };

  /* ---------------- 目录递归扫描 ---------------- */

  SW.scanDirs = async function (opt) {
    const root = opt.root || (location.origin + '/');
    const dirs = opt.dirs || ['words'];
    const exts = (opt.exts || []).map(function (e) { return String(e).toLowerCase(); });
    const maxDepth = typeof opt.depth === 'number' ? opt.depth : 2;

    const out = [];

    async function crawl(entry, dirName, depth) {
      if (!entry) return;
      entry.files.forEach(function (f) {
        const ext = SW.extOf(f.name);
        if (exts.length && exts.indexOf(ext) < 0) return;
        out.push({ url: f.url, name: f.name, dir: dirName, ext: ext });
      });
      if (depth >= maxDepth) return;
      for (const subUrl of entry.dirs) {
        try {
          const sub = await SW.listWebDirectory(subUrl);
          await crawl(sub, dirName, depth + 1);
        } catch (e) { /* 单个子目录失败不影响整体 */ }
      }
    }

    let ok = 0;
    for (const d of dirs) {
      const dirUrl = new URL(d.replace(/^\/+|\/+$/g, '') + '/', root).href;
      try {
        const entry = await SW.listWebDirectory(dirUrl);
        await crawl(entry, d, 0);
        ok++;
      } catch (e) { /* 该目录不可读，继续下一个 */ }
    }

    if (!ok) {
      const err = new Error('没有可读取的目录');
      err.noDir = true;
      throw err;
    }
    return out;
  };

  /* ---------------- manifest ---------------- */

  SW.loadManifest = async function (url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      const err = new Error('HTTP ' + res.status);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    const items = (data.items || []).filter(function (it) { return it && it.path; });
    return { generated: data.generated || null, items: items };
  };

  SW.encodePath = function (p) {
    return String(p || '').split('/').map(encodeURIComponent).join('/');
  };

  /* ---------------- 三级加载：manifest → 目录扫描 ---------------- */

  SW.loadAll = async function (opt) {
    const root = opt.root || (location.origin + '/');
    const manifestUrl = opt.manifestUrl || 'manifest.json';
    const dirs = opt.dirs || ['words'];
    const exts = opt.exts || [];

    if (location.protocol === 'file:') {
      const err = new Error('file:// 环境无法自动扫描');
      err.fileProtocol = true;
      throw err;
    }

    try {
      const m = await SW.loadManifest(manifestUrl);
      if (m.items.length) {
        return {
          source: 'manifest',
          files: m.items.map(function (it) {
            return {
              url: new URL(SW.encodePath(it.path), root).href,
              name: it.name || it.path.split('/').pop(),
              ext: it.ext || SW.extOf(it.name || it.path)
            };
          })
        };
      }
    } catch (e) { /* 清单不存在属正常，继续降级 */ }

    const list = await SW.scanDirs({ root: root, dirs: dirs, exts: exts });
    return {
      source: 'dirs',
      files: list.map(function (f) {
        return { url: f.url, name: f.name, ext: f.ext, dir: f.dir };
      })
    };
  };

  window.SW = SW;
})(window, document);

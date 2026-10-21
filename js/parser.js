/* ============================================================
   词库文本解析
   ------------------------------------------------------------
   一行一个单词，格式：单词 音标 翻译（空格 / Tab 分隔）
   兼容：
     apple /ˈæpl/ 苹果
     apple [ˈæpl] n. 苹果
     apple	ˈæpl	苹果
     apple aepl 苹果            （无括号音标，按位置推断）
     apple 苹果                 （无音标）
     # 注释 / 空行会被跳过
   ============================================================ */
(function (window) {
  'use strict';

  const WP = window.WP = window.WP || {};

  const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;
  const IPA_MARK = /[ˈˌːəɪʊæɑɔɒʌɜθðʃʒŋɹɾɐɚɛ]/;

  /* ---------------- 解码：UTF-8 / GBK / UTF-16 ---------------- */

  WP.decode = function (buffer) {
    const bytes = new Uint8Array(buffer);
    if (bytes.length === 0) return '';

    if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
      try { return new TextDecoder('utf-16le').decode(bytes.subarray(2)); } catch (e) {}
    }
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
      try { return new TextDecoder('utf-16be').decode(bytes.subarray(2)); } catch (e) {}
    }
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      return new TextDecoder('utf-8').decode(bytes.subarray(3));
    }

    // UTF-8 严格解码失败说明是 GBK 等本地编码（Windows 记事本常见）
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (e) {}
    try { return new TextDecoder('gbk').decode(bytes); } catch (e) {}
    return new TextDecoder('utf-8').decode(bytes);
  };

  /* ---------------- 字段切分 ---------------- */

  function cleanPhonetic(tok) {
    return String(tok || '')
      .replace(/^[\s\/\[\]【】()（）]+/, '')
      .replace(/[\s\/\[\]【】()（）]+$/, '')
      .trim();
  }

  function looksPhonetic(tok) {
    if (!tok || CJK.test(tok)) return false;
    if (IPA_MARK.test(tok)) return true;
    // 无常见 IPA 符号但含非 ASCII 的变音符号
    return /[^\x00-\x7f]/.test(tok.replace(/[（）【】]/g, '')) && tok.length <= 40;
  }

  function splitFields(line) {
    if (line.indexOf('\t') >= 0) {
      return line.split(/\t+/).map(function (s) { return s.trim(); }).filter(Boolean);
    }
    // 括号包裹的音标（内容不含中文时才认）
    const m = line.match(/^(\S+)\s*([\/\[【(（]([^\/\]】)）]{1,40})[\/\]】)）])\s*(.*)$/);
    if (m && !CJK.test(m[3])) return [m[1], m[3], m[4]];

    return line.split(/\s+/).filter(Boolean);
  }

  WP.parseLine = function (raw) {
    let line = String(raw || '').replace(/^\uFEFF/, '').replace(/\u00a0/g, ' ').trim();
    if (!line) return null;
    if (/^(#|\/\/|;|；)/.test(line)) return null;

    // 去掉行首序号：1. apple / 2、apple / 03 apple
    line = line.replace(/^\d{1,3}\s*[.、)）-]\s+/, '');

    const parts = splitFields(line);
    if (!parts.length) return null;

    const word = parts[0].trim();
    if (!word) return null;

    let phonetic = '';
    let translation = '';
    const rest = parts.slice(1);

    if (rest.length === 1) {
      translation = rest[0];
    } else if (rest.length >= 2) {
      const maybe = rest[0];
      const tail = rest.slice(1).join(' ');
      if (looksPhonetic(maybe)) {
        phonetic = cleanPhonetic(maybe);
        translation = tail;
      } else if (!CJK.test(maybe) && CJK.test(tail) && maybe.length <= 40) {
        // 无括号、无 IPA 符号，但后面紧跟中文，按位置当音标
        phonetic = cleanPhonetic(maybe);
        translation = tail;
      } else {
        translation = rest.join(' ');
      }
    }

    // 音标里若混入了翻译的开头（例如 苹果n.），尝试截断到首个中文
    if (phonetic && CJK.test(phonetic)) phonetic = phonetic.split(CJK)[0].trim();

    return {
      word: word,
      phonetic: phonetic.trim(),
      translation: translation.trim(),
      raw: raw
    };
  };

  /**
   * @param {string} text 词库文件全文
   * @returns {{entries: Array, skipped: number, lines: number}}
   */
  WP.parse = function (text) {
    const lines = String(text || '').split(/\r?\n/);
    const seen = Object.create(null);
    const entries = [];
    let skipped = 0;

    lines.forEach(function (line) {
      const item = WP.parseLine(line);
      if (!item) { if (String(line).trim()) skipped++; return; }
      const key = item.word.toLowerCase();
      if (seen[key]) return;
      seen[key] = 1;
      entries.push(item);
    });

    return { entries: entries, skipped: skipped, lines: lines.length };
  };

  /* ---------------- 文件名 → 词库名 ---------------- */

  WP.titleOf = function (fileName) {
    let s = String(fileName || '').split('/').pop().replace(/\.[^.]+$/, '');
    s = s.replace(/^\s*\d{1,3}\s*[.\-_、)]\s*/, '');
    s = s.replace(/[_]+/g, ' ').trim();
    return s || String(fileName || '未命名');
  };

  /* ---------------- 显示工具 ---------------- */

  WP.phonDisplay = function (p) {
    const t = String(p || '').trim();
    return t ? '/' + t.replace(/^[\/\[]+|[\/\]]+$/g, '') + '/' : '';
  };
})(window);

#!/usr/bin/env node
/**
 * 端到端实测：词库列表 → 打字背诵 → 对象连接 → 单词打字
 *
 * 用法：
 *   NODE_PATH=<node-workspace>/node_modules node tools/verify_app.js [url]
 * 默认 url: http://127.0.0.1:8123/
 */

const fs = require('fs');
const path = require('path');

let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch (e) {
  console.error('[x] 缺少 playwright-core，请先设置 NODE_PATH');
  process.exit(2);
}

const URL_BASE = process.argv[2] || 'http://127.0.0.1:8123/';
const results = [];
let failed = false;

function check(name, pass, detail) {
  results.push({ name, pass, detail: detail == null ? '' : String(detail).slice(0, 200) });
  if (!pass) failed = true;
  console.log((pass ? '[ok] ' : '[FAIL] ') + name + (detail != null ? '  -> ' + String(detail).slice(0, 120) : ''));
}

async function shot(page, name) {
  const p = path.resolve(__dirname, '..', 'check-' + name + '.png');
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--disable-gpu', '--no-first-run'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 940 }, colorScheme: 'dark' });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));

  await page.goto(URL_BASE, { waitUntil: 'load' });
  await page.waitForSelector('.book', { timeout: 15000 });

  // ---------- 1. 词库列表 ----------
  const bookCount = await page.locator('.book').count();
  check('词库列表加载', bookCount >= 1, bookCount + ' 个词库');
  await shot(page, 'books');

  // ---------- 2. 打字背诵 ----------
  await page.locator('.book').first().locator('button[data-mode="spell"]').click();
  await page.waitForSelector('#spellSetup:not([hidden])');
  await page.click('#spellStart');
  await page.waitForSelector('#spellPlay:not([hidden])');

  const spellMeta = await page.evaluate(() => ({
    phonetic: document.querySelector('#spellPhonetic').textContent,
    mask: document.querySelector('#spellMask').textContent
  }));
  check('背诵模式显示音标', /\/.+\/|（无音标）/.test(spellMeta.phonetic), spellMeta.phonetic);

  let idx = 0;
  let revealedWord = null;
  let skippedWord = null;
  for (;;) {
    const word = await page.evaluate(() => (window.WA && WA.spell.current()) ? WA.spell.current().word : null);
    if (!word) break;
    idx++;

    const input = page.locator('#spellInput');
    await input.focus();

    if (idx === 1) {
      // 第一轮：先输错 → 空格看翻译 → 再空格看完整单词 → 照打正确仍算失败
      await page.keyboard.type(word.slice(0, -1) + (word.endsWith('x') ? 'q' : 'x'));
      await page.keyboard.press('Enter');
      const errMsg = await page.textContent('#spellMsg');
      check('拼错出现错误提示', errMsg.includes('✗'), errMsg);

      await page.keyboard.press('Space');
      const s1 = await page.evaluate(() => ({
        trans: !document.querySelector('#spellTrans').hidden,
        mask: document.querySelector('#spellMask').textContent,
        cls: document.querySelector('#spellMask').className
      }));
      check('空格第一下显示翻译', s1.trans && /_/.test(s1.mask) && !/reveal/.test(s1.cls), '翻译已显示 / 掩码 ' + s1.mask.trim());

      await page.keyboard.press('Space');
      const s2 = await page.evaluate(() => ({
        mask: document.querySelector('#spellMask').textContent.trim(),
        cls: document.querySelector('#spellMask').className,
        hud: !document.querySelector('#spellRevealCount').hidden,
        hudText: document.querySelector('#spellRevealCount').textContent
      }));
      revealedWord = word;
      check('空格第二下显示完整单词', s2.mask === word && /reveal/.test(s2.cls), s2.mask + ' / ' + s2.cls);
      check('看答案计数出现在 HUD', s2.hud && /1/.test(s2.hudText), s2.hudText);
      await shot(page, 'spell-reveal');

      await page.keyboard.press('Control+a');
      await page.keyboard.type(word);
      await page.keyboard.press('Enter');
      const okMsg = await page.textContent('#spellMsg');
      check('看答案后打对仍判为未通过', okMsg.includes('✓') && /未通过/.test(okMsg), okMsg);
    } else if (idx === 2) {
      // 第二轮：两次空格看答案 → 空输入直接回车跳过
      await page.keyboard.press('Space');
      await page.keyboard.press('Space');
      skippedWord = word;
      await page.keyboard.press('Enter');
      const after = await page.evaluate(() => (window.WA.spell.current() || {}).word || null);
      check('看答案后可直接回车跳过', after !== word, '跳到 ' + (after || '结算'));
      continue;   // 已进入下一题
    } else {
      await page.keyboard.type(word);
      await page.keyboard.press('Enter');
    }
    await page.keyboard.press('Enter'); // 下一题
  }

  check('背诵模式跑完一轮', idx > 0, idx + ' 个单词');
  await page.waitForSelector('#spellResult:not([hidden])');
  const spellResult = await page.evaluate(() => ({
    text: document.querySelector('#spellResult').textContent,
    acc: (document.querySelector('#spellResult .score b') || {}).textContent,
    wrongCount: document.querySelectorAll('#spellResult .wrong-item').length,
    tags: document.querySelectorAll('#spellResult .wl-tag').length,
    wrongWords: Array.from(document.querySelectorAll('#spellResult .wrong-item b')).map(e => e.textContent)
  }));
  check('背诵结算显示正确率', /正确率/.test(spellResult.text) && parseInt(spellResult.acc, 10) < 100, spellResult.acc);
  check('看答案的词计入失败', spellResult.wrongCount === 2, '错误 ' + spellResult.wrongCount + ' 个');
  check('结果标出「看答案」', spellResult.tags === 2 && spellResult.wrongWords.includes(revealedWord) && spellResult.wrongWords.includes(skippedWord),
    spellResult.tags + ' 个标记：' + spellResult.wrongWords.join('、'));
  await shot(page, 'spell-result');

  await page.click('#spellResult button[data-act="home"]');

  // ---------- 3. 对象连接 ----------
  await page.locator('.book').first().locator('button[data-mode="match"]').click();
  await page.waitForSelector('#matchSetup:not([hidden])');
  await page.click('#matchStart');
  await page.waitForSelector('#matchPlay:not([hidden])');

  const blocks = await page.evaluate(() => {
    const out = {};
    document.querySelectorAll('#matchBoard .mblock').forEach(b => {
      const e = b.dataset.e;
      if (!out[e]) out[e] = {};
      out[e][b.dataset.t] = parseInt(b.dataset.i, 10);
    });
    return out;
  });
  const nEntries = Object.keys(blocks).length;
  check('连接模式生成方块', nEntries >= 3, nEntries + ' 组 / ' + nEntries * 3 + ' 块');

  const pick = i => page.click('.mblock[data-i="' + i + '"]');
  const tri = e => [blocks[String(e)].word, blocks[String(e)].phon, blocks[String(e)].trans];

  // 3.1 三块一组：选满 3 块自动成组
  for (const i of tri(0)) await pick(i);
  const s1 = await page.evaluate(() => ({
    grouped: document.querySelectorAll('#matchBoard .mblock.grouped').length,
    badge: (document.querySelector('#matchBoard .mbadge') || {}).textContent,
    sel: document.querySelectorAll('#matchBoard .mblock.sel').length,
    trayFilled: document.querySelectorAll('#matchTray .slot.filled').length,
    progress: document.querySelector('#matchTray .tray-head').textContent
  }));
  check('选满三块自动成组', s1.grouped === 3 && s1.badge === '1', '成组 ' + s1.grouped + ' 块 / 编号 ' + s1.badge);
  check('成组后槽位清空', s1.sel === 0 && s1.trayFilled === 0, '选中 ' + s1.sel + ' / 槽位 ' + s1.trayFilled);
  check('组数进度更新', /1\s*\/\s*\d+/.test(s1.progress.replace(/\s+/g, ' ')), s1.progress.replace(/\s+/g, ' ').trim());
  await shot(page, 'match-group');

  // 3.2 点已成组的方块 → 整组拆开
  await pick(blocks['0'].word);
  const s2 = await page.evaluate(() => document.querySelectorAll('#matchBoard .mblock.grouped').length);
  check('点组内方块可拆开整组', s2 === 0, '剩余成组 ' + s2 + ' 块');

  // 3.3 同类型再选 = 替换（一组里不会出现两个单词块）
  await pick(blocks['0'].word);
  await pick(blocks['1'].word);
  const s3 = await page.evaluate(() => ({
    filled: document.querySelectorAll('#matchTray .slot.filled').length,
    wordSlot: document.querySelector('#matchTray .slot[data-slot="word"] .slot-val').textContent,
    tag: document.querySelector('#matchTray .slot[data-slot="word"] .slot-tag').textContent
  }));
  check('同类型再选自动替换', s3.filled === 1, '已占 ' + s3.filled + ' 个槽位');
  check('槽位标出类型与内容', s3.tag === '单词' && s3.wordSlot.trim().length > 0, s3.tag + ' = ' + s3.wordSlot.trim());

  // 3.4 重置
  await page.click('#matchReset');
  const s4 = await page.evaluate(() => ({
    grouped: document.querySelectorAll('#matchBoard .mblock.grouped').length,
    filled: document.querySelectorAll('#matchTray .slot.filled').length
  }));
  check('重置清空编组', s4.grouped === 0 && s4.filled === 0, '成组 ' + s4.grouped + ' 块');

  // 3.5 正式编组：故意把第 0、1 两组的翻译互换（制造 2 组错误）
  async function group(a, b, c) { await pick(a); await pick(b); await pick(c); }
  await group(blocks['0'].word, blocks['0'].phon, blocks['1'].trans);
  await group(blocks['1'].word, blocks['1'].phon, blocks['0'].trans);
  for (let e = 2; e < nEntries; e++) await group(...tri(e));

  const s5 = await page.evaluate(() => ({
    grouped: document.querySelectorAll('#matchBoard .mblock.grouped').length,
    filled: document.querySelectorAll('#matchTray .slot.filled').length
  }));
  check('全部方块编组完成', s5.grouped === nEntries * 3 && s5.filled === 0, s5.grouped + ' 块已成组');

  await page.click('#matchCheck');
  await page.waitForSelector('#matchResult:not([hidden])');
  const matchResult = await page.evaluate(() => ({
    text: document.querySelector('#matchResult').textContent,
    ok: document.querySelectorAll('#matchResult .check-item.ok').length,
    bad: document.querySelectorAll('#matchResult .check-item.bad').length,
    okBlocks: document.querySelectorAll('#matchBoard .mblock.ok').length,
    badBlocks: document.querySelectorAll('#matchBoard .mblock.bad').length
  }));
  check('连接结算逐词判定', matchResult.ok + matchResult.bad === nEntries, '正确 ' + matchResult.ok + ' / 错误 ' + matchResult.bad);
  check('错误编组被标出', matchResult.bad === 2 && matchResult.badBlocks === 6, '错误 ' + matchResult.bad + ' 组 / 标红 ' + matchResult.badBlocks + ' 块');
  check('正确编组标记为对', matchResult.okBlocks === (nEntries - 2) * 3, '标绿 ' + matchResult.okBlocks + ' 块');
  await shot(page, 'match-result');

  await page.click('#matchResult button[data-act="home"]');

  // ---------- 4. 单词打字 ----------
  await page.locator('.book').first().locator('button[data-mode="type"]').click();
  await page.waitForSelector('#typeSetup:not([hidden])');
  await page.click('#typeStart');
  await page.waitForSelector('#typePlay:not([hidden])');

  const words = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#typeText .tw')).map(w => w.textContent)
  );
  check('打字模式渲染单词', words.length > 0, words.length + ' 个单词');

  const cursorState = await page.evaluate(() => ({
    cur: document.querySelectorAll('#typeText .tc.cur').length,
    active: document.querySelectorAll('#typeText .tw.active').length,
    hint: document.querySelector('#typeHintLine').textContent
  }));
  check('光标标记当前字母', cursorState.cur === 1 && cursorState.active === 1, cursorState.hint);

  // 第一个单词：故意打错一个字母，再改对
  await page.keyboard.type('x');
  const errAfterWrong = await page.textContent('#typeErr');
  check('打错字母计错误', errAfterWrong.trim() === '1', '错误计数 ' + errAfterWrong);

  const noShake = await page.evaluate(() => ({
    shakes: document.querySelectorAll('.shake').length,
    stage: document.querySelector('#typeStage').className,
    hintErr: document.querySelector('#typeHintLine').className
  }));
  check('打错不晃动界面', noShake.shakes === 0 && !/shake/.test(noShake.stage), noShake.stage);

  const soundState = await page.evaluate(() => ({
    hasSfx: !!window.SFX,
    enabled: !!(window.SFX && window.SFX.enabled),
    ctx: !!(window.SFX && window.SFX.ctx)
  }));
  check('键盘音效已启用', soundState.hasSfx && soundState.enabled, JSON.stringify(soundState));
  check('按键触发音频上下文', soundState.ctx, 'AudioContext 已创建');

  await page.keyboard.type(words[0]);
  await page.waitForTimeout(150);

  const afterWord = await page.evaluate(() => {
    const bad = document.querySelector('#typeText .tw.complete .tc.bad');
    const s = bad ? getComputedStyle(bad) : null;
    return {
      complete: document.querySelectorAll('#typeText .tw.complete').length,
      done: document.querySelectorAll('#typeText .tw.done').length,
      redChars: document.querySelectorAll('#typeText .tw.complete .tc.bad').length,
      bg: s ? s.backgroundColor : '',
      color: s ? s.color : '',
      progress: document.querySelector('#typeProgress').textContent
    };
  });
  check('打完单词后停在等待空格', afterWord.complete === 1 && afterWord.done === 0, afterWord.progress);

  const rgb = (afterWord.bg.match(/[\d.]+/g) || []).map(Number);
  check('拼错的字母用黄色背景标记（不是红字）',
    afterWord.redChars >= 1 && rgb.length >= 3 && rgb[0] > 200 && rgb[1] > 150 && rgb[2] < 140,
    afterWord.bg + ' / 文字颜色 ' + afterWord.color);

  // 打字过程中可调字号
  const sizeBefore = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#typeText')).fontSize));
  await page.click('#typeFontUp');
  const sizeAfter = await page.evaluate(() => ({
    size: parseFloat(getComputedStyle(document.querySelector('#typeText')).fontSize),
    label: document.querySelector('#typeFontVal').textContent,
    stored: localStorage.getItem('word:typeFont')
  }));
  check('打字时可调字号并记住', sizeAfter.size > sizeBefore && sizeAfter.stored === String(sizeAfter.size),
    sizeBefore + 'px → ' + sizeAfter.size + 'px（' + sizeAfter.label + '）');
  await shot(page, 'type-stage');

  // 不按空格不会进入下一个单词
  await page.keyboard.type(words[1].charAt(0));
  const stuck = await page.evaluate(() => document.querySelectorAll('#typeText .tw.done').length);
  check('未按空格不自动跳词', stuck === 0, '已完成单词 ' + stuck);

  await page.keyboard.press('Space');
  const advanced = await page.evaluate(() => ({
    done: document.querySelectorAll('#typeText .tw.done').length,
    progress: document.querySelector('#typeProgress').textContent
  }));
  check('按空格进入下一个单词', advanced.done === 1, advanced.progress);

  for (let i = 1; i < words.length; i++) {
    await page.keyboard.type(words[i]);
    await page.keyboard.press('Space');
  }

  await page.waitForSelector('#typeResult:not([hidden])', { timeout: 10000 });
  const typeResult = await page.evaluate(() => ({
    text: document.querySelector('#typeResult').textContent,
    err: document.querySelector('#typeErr').textContent,
    time: document.querySelector('#typeTime').textContent
  }));
  check('打字结算显示用时', /\d/.test(typeResult.time), typeResult.time);
  check('打字结算统计错误', typeResult.err.trim() === '2', '错误 ' + typeResult.err + ' 次');
  await shot(page, 'type-result');

  // ---------- 5. 主题切换 ----------
  await page.click('#btnTheme');
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  check('主题切换生效', theme === 'light' || theme === 'dark', theme);
  await shot(page, 'theme-toggle');

  // ---------- 6. 音效开关 ----------
  await page.click('#btnSound');
  const muted = await page.evaluate(() => ({
    cls: document.querySelector('#btnSound').className,
    stored: localStorage.getItem('word:sound')
  }));
  check('音效开关可关闭并记住', /muted/.test(muted.cls) && muted.stored === 'false', JSON.stringify(muted));
  await page.click('#btnSound');

  check('无页面级报错', consoleErrors.length === 0, consoleErrors.join(' | ') || 'clean');

  await browser.close();
  console.log('\n==== 汇总: ' + results.filter(r => r.pass).length + '/' + results.length + ' 通过 ====');
  process.exit(failed ? 1 : 0);
})().catch(err => {
  console.error('[x] 执行失败：' + err.message);
  process.exit(2);
});

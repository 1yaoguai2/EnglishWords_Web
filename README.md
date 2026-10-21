# 单词背诵（纯静态网页）

零构建、零依赖、可离线运行的单词背诵工具。页面自动扫描 `words/` 文件夹里的 `.txt` 词库，支持三种练习模式：

| 模式 | 玩法 |
| --- | --- |
| **打字背诵** | 先出音标提示，键盘拼写后回车判分；拼错按空格可看翻译，改对才进入下一个。结束给出正确率与错误单词清单 |
| **对象连接** | 打乱的「单词 / 音标 / 翻译」方块，点两个方块绑成一组（同色同编号），全部绑完点「确定」逐词判对错 |
| **单词打字** | 所有单词铺在屏幕上逐字输入，打错标红计错误；打完给出用时、错误次数、正确率与速度 |

支持白天 / 夜间双主题（右上角切换，刷新后保持）、Esc 随时返回词库。

## 快速开始

```bash
# 方式一：双击 start.bat（Windows）
# 方式二：命令行
python tools/local_server.py 8000
```

浏览器打开 `http://127.0.0.1:8000/` 即可，页面会自动读取 `words/` 里的词库。

也可以直接双击 `index.html`，浏览器不允许 `file://` 自动扫描文件夹，此时点「导入词库」选择 `words` 文件夹即可（每次打开需重新选择）。

## 添加词库

在 `words/` 里放入 `.txt` 文件即可，文件名就是词库名（自动去掉开头序号）。每行一个单词：

```
# 开头的注释行会被忽略
单词 音标 翻译
apple /ˈæpl/ 苹果
```

- 分隔符支持空格、Tab、`|`；音标可带 `/ /`、`[ ]` 括号，也可以不带
- 没有音标的行也支持（`apple 苹果`），但「对象连接」模式要求每行都有音标
- 编码支持 UTF-8 / UTF-8 BOM / GBK / UTF-16，Windows 记事本直接存的文件也能读

改完词库后点右上角「重新扫描」刷新。

## 部署

- **本地 / IIS / nginx**：原样拷贝整个目录。IIS 已附带 `web.config`（启用目录浏览 + txt/json MIME）；nginx 需 `autoindex on;` 或用 manifest
- **GitHub Pages**：Pages 不支持目录列表，推送前先运行 `python tools/make_manifest.py --count` 生成 `manifest.json`，页面会优先读取它
- 优先级：`manifest.json` → 目录浏览扫描 → 手动选择文件夹

## 目录结构

```
├── index.html            页面入口（单页，无路由）
├── css/style.css         双主题样式（颜色全走变量）
├── js/core.js            基础设施：主题 / 存储 / 目录发现
├── js/parser.js          词库解析（多编码解码 + 宽松格式解析）
├── js/app.js             词库列表 / 模式调度
├── js/mode-spell.js      打字背诵
├── js/mode-match.js      对象连接
├── js/mode-type.js       单词打字
├── words/                词库文件夹（放 .txt）
├── tools/local_server.py 本地服务器
├── tools/make_manifest.py 生成 manifest.json
├── tools/verify_app.js   端到端自动化实测（playwright + Edge）
└── web.config            IIS 配置
```

## 已知限制

- `file://` 下无法自动扫描（浏览器安全限制），需手动导入或起本地服务器
- 浏览器本地存储只保存主题；练习进度不做持久化
- 「对象连接」要求词库每行都有音标

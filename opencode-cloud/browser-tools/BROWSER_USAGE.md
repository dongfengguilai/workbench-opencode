# WorkBench 原生浏览器与网页

网页只能放在 /workspace/project/web。静态 HTML/CSS/JS 使用固定 Vite；React 在 web 中保留 package.json 与依赖锁，安装自己的 React 依赖。平台启动按钮通过原生 PTY 执行 /trusted/start-preview.sh，固定 127.0.0.1:5173；不要另启第二个实例。不得读取 /trusted 配置内容、环境变量或密钥。
依赖下载最多2并发，以留出本人HTTPS网关的4个隧道名额。安装命令使用 npm install --ignore-scripts --maxsockets=2 --fetch-retries=0；保留锁文件，重现用 npm ci --ignore-scripts --maxsockets=2 --fetch-retries=0。首次依赖解析和下载可能超过 120 秒；原生 Bash 可显式设置 timeout=600000，npm 自身仍保留 fetch 超时与零重试。命令超时不等于安装已成功，也不应自动重复：先确认进程、锁文件及依赖状态；结果未知时不得重发。已有官方缓存可使用 --prefer-offline；它只复用缓存，不取消版本锁定或 TLS 校验。明确失败后只定位原因，不反复清空/重装或切换工具重试。

浏览器直接使用原生 Bash 的 Microsoft Playwright CLI 0.1.20，没有额外浏览器工具或自动 Skill。先运行 playwright-cli --help。打开时必须显式指定可信配置（项目配置优先级高于环境变量）：

playwright-cli -s=wb open http://127.0.0.1:5173 --config /trusted/browser.json
playwright-cli -s=wb snapshot
playwright-cli -s=wb fill e1 "实际输入"
playwright-cli -s=wb click e2
playwright-cli -s=wb eval "() => { if (!document.body.textContent.includes('预期结果')) throw Error('断言失败'); return 'WB_BROWSER_ASSERTIONS_PASS' }"
playwright-cli -s=wb screenshot --filename=/workspace/project/.workbench-artifacts/当前原生会话ID/result.png
playwright-cli -s=wb close

e1/e2 只是示意，必须先读真实 snapshot 的引用。screenshot 路径从 /workspace/project 开始，先建当前 ses_... 的目录；截图要放在 .workbench-artifacts/本人真实会话ID/ 下，平台按本人会话鉴权读取。CLI 遇到 ### Error 可能仍返回退出码0，必须检查输出；断言 throw 和页面证据才用于验收。不要安装 latest、另下载浏览器、注入项目 MCP/插件或修改工具实现。浏览器自己的状态和用户预览独立，不共享登录资料。

只有网页任务需要浏览器。普通函数、脚本或服务代码任务交付文件、真实测试与下载，不要求用户打开网页。
React 预览要求 package.json、package-lock.json 和安装结果均固定官方 @vitejs/plugin-react 4.7.0；受控配置仅加载此固定插件，不加载项目 vite.config 或任意插件。兼容组件更新使用 Fast Refresh，静态页面或不兼容结构变化可能整页刷新。


## 用户访问与交付提示

`http://127.0.0.1:5173/` 是工作容器内部地址，只供本容器的 Playwright、健康检查和开发命令使用。它不是用户电脑可访问的地址，不要把它作为用户交付链接，不要建议开放端口、改绑 0.0.0.0 或发布 Docker 端口。
网页任务交付时说明：点击 WorkBench 顶部“预览”查看效果；预览栏“新标签 ↗”可另页查看，“预览地址与访问说明”可复制用户地址。实际入口与授权由 WorkBench 提供，不要自行拼接身份域名或一次性票据。未真实验证网页时如实标明，不能因为写好了文件就声称用户已能访问。普通代码任务只交付文件、真实测试、Diff 和下载，不要求打开浏览器。
下载源码后在用户自己的电脑按包内 run.md 启动，此时终端显示的 localhost 是那台电脑自己的地址，与云端工作容器地址不同。

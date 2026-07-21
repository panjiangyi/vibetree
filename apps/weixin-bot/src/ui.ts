/*
 * ui.ts — a single self-contained chat page served at GET / (no build step,
 * no external assets, so it works offline behind the same origin as the API).
 * It talks to this service's own REST API; the API key is entered once and kept
 * in localStorage, sent as X-API-Key (and as ?api_key= on <img>/<video> URLs
 * that can't carry headers).
 */
export const CHAT_HTML = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>微信 · weixin-bot-service</title>
<style>
  :root {
    --bg: #f2f3f5; --panel: #fff; --border: #e3e5e8; --text: #1a1a1a;
    --muted: #8a8f99; --in: #fff; --out: #95ec69; --accent: #07c160;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#141517; --panel:#1e2023; --border:#2b2e33; --text:#e8e8e8;
      --muted:#888; --in:#26282c; --out:#3a5a40; --accent:#07c160; }
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body { background: var(--bg); color: var(--text);
    font: 15px/1.5 -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    display: flex; flex-direction: column; }
  header { background: var(--panel); border-bottom: 1px solid var(--border);
    padding: 10px 16px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  header .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--muted); flex: none; }
  header .dot.on { background: var(--accent); }
  header .dot.warn { background: #f0a020; }
  header h1 { font-size: 15px; margin: 0; font-weight: 600; }
  header .meta { color: var(--muted); font-size: 12px; }
  header .spacer { flex: 1; }
  select, input, textarea, button { font: inherit; color: var(--text); }
  select, .keyrow input { background: var(--bg); border: 1px solid var(--border);
    border-radius: 6px; padding: 5px 8px; }
  #banner { display: none; padding: 8px 16px; background: #f8d7da; color: #842029; font-size: 13px; }
  #banner.show { display: block; }
  main { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
  .row { display: flex; gap: 8px; max-width: 78%; }
  .row.in { align-self: flex-start; }
  .row.out { align-self: flex-end; flex-direction: row-reverse; }
  .bubble { padding: 8px 11px; border-radius: 8px; background: var(--in);
    border: 1px solid var(--border); white-space: pre-wrap; word-break: break-word; }
  .row.out .bubble { background: var(--out); border-color: transparent; color: #0a2e0a; }
  .bubble .t { font-size: 11px; color: var(--muted); margin-top: 4px; }
  .row.out .bubble .t { color: #2c5c2c; }
  .bubble img, .bubble video { max-width: 220px; max-height: 260px; border-radius: 6px; display: block; }
  .bubble a { color: var(--accent); }
  .sys { align-self: center; color: var(--muted); font-size: 12px; }
  footer { background: var(--panel); border-top: 1px solid var(--border); padding: 10px 12px;
    display: flex; gap: 8px; align-items: flex-end; }
  #text { flex: 1; resize: none; min-height: 40px; max-height: 140px; padding: 9px 11px;
    border: 1px solid var(--border); border-radius: 8px; background: var(--bg); }
  footer button, .iconbtn { background: var(--accent); color: #fff; border: none;
    border-radius: 8px; padding: 0 16px; height: 40px; cursor: pointer; font-weight: 600; }
  .iconbtn { background: var(--bg); color: var(--text); border: 1px solid var(--border); padding: 0 12px; }
  button:disabled { opacity: .5; cursor: default; }
  /* key gate */
  #gate { position: fixed; inset: 0; background: var(--bg); display: flex;
    align-items: center; justify-content: center; z-index: 10; }
  #gate .card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px;
    padding: 24px; width: min(340px, 90vw); }
  #gate h2 { margin: 0 0 6px; font-size: 17px; }
  #gate p { margin: 0 0 14px; color: var(--muted); font-size: 13px; }
  #gate input { width: 100%; padding: 9px; margin-bottom: 10px; border: 1px solid var(--border);
    border-radius: 8px; background: var(--bg); }
  #gate button { width: 100%; }
  #gate .err { color: #d33; font-size: 13px; min-height: 18px; }
  /* QR login overlay */
  #qrgate { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex;
    align-items: center; justify-content: center; z-index: 11; }
  #qrgate .card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px;
    padding: 22px; width: min(360px, 92vw); text-align: center; }
  #qrgate h2 { margin: 0 0 8px; font-size: 17px; }
  #qrgate .warn { color: var(--muted); font-size: 12.5px; margin: 0 0 14px; text-align: left; }
  #qrbox { background: #fff; border-radius: 8px; padding: 12px; display: inline-block;
    min-width: 240px; min-height: 240px; color: #666; font-size: 13px; }
  #qrbox svg { width: 240px; height: 240px; display: block; }
  .qrstatus { margin: 12px 0; font-size: 13px; min-height: 20px; }
  .verifyrow { display: flex; gap: 8px; margin-bottom: 12px; }
  .verifyrow input { flex: 1; padding: 8px; border: 1px solid var(--border);
    border-radius: 8px; background: var(--bg); }
  .verifyrow button { background: var(--accent); color: #fff; border: none;
    border-radius: 8px; padding: 0 14px; cursor: pointer; }
  #qrgate .ghost { background: transparent; color: var(--muted); border: 1px solid var(--border);
    border-radius: 8px; padding: 8px 16px; cursor: pointer; width: 100%; }
  /* welcome (shown when no accounts) */
  #welcome { position: fixed; inset: 0; background: var(--bg); display: flex;
    align-items: center; justify-content: center; z-index: 9; }
  #welcome .card { background: var(--panel); border: 1px solid var(--border); border-radius: 14px;
    padding: 32px; width: min(400px, 92vw); text-align: center; }
  #welcome .hero { font-size: 52px; line-height: 1; margin-bottom: 8px; }
  #welcome h2 { margin: 0 0 8px; font-size: 19px; }
  #welcome p { color: var(--muted); font-size: 14px; margin: 0 0 20px; }
  #welcome button { background: var(--accent); color: #fff; border: none; border-radius: 10px;
    padding: 12px 20px; font-size: 15px; font-weight: 600; cursor: pointer; }
</style>
</head>
<body>
  <div id="gate">
    <div class="card">
      <h2>weixin-bot-service</h2>
      <p>输入 API Key（.env 里的 API_KEY）以连接。</p>
      <input id="keyInput" type="password" placeholder="API Key" autocomplete="off" />
      <button id="keyBtn">连接</button>
      <div class="err" id="keyErr"></div>
    </div>
  </div>

  <header>
    <span class="dot" id="dot"></span>
    <select id="account" title="微信账号"></select>
    <select id="peer" title="收发对象"></select>
    <span class="spacer"></span>
    <button class="iconbtn" id="acctRename" title="重命名当前账号">✎</button>
    <button class="iconbtn" id="acctLogout" title="登出当前账号（保留历史）">⏻</button>
    <button class="iconbtn" id="acctDelete" title="删除当前账号（清除历史，不可恢复）">🗑</button>
    <button class="iconbtn" id="loginBtn" title="扫码添加微信账号">📷</button>
    <button class="iconbtn" id="logout" title="清除 API Key">⎋</button>
  </header>

  <div id="qrgate" style="display:none">
    <div class="card">
      <h2>扫码添加微信账号</h2>
      <p class="warn">用微信扫码<b>添加一个账号</b>，扫完<b>立即上线，无需重启</b>。扫已登录过的号则是原地刷新它的会话。</p>
      <div id="qrbox">正在获取二维码…</div>
      <div class="qrstatus" id="qrstatus"></div>
      <div class="verifyrow" id="verifyRow" style="display:none">
        <input id="verifyInput" inputmode="numeric" placeholder="微信显示的配对码" autocomplete="off" />
        <button id="verifyBtn">提交</button>
      </div>
      <div class="verifyrow" id="nameRow" style="display:none">
        <input id="nameInput" placeholder="给这个账号起个名字" autocomplete="off" />
        <button id="nameBtn">保存</button>
      </div>
      <button class="ghost" id="qrClose">关闭</button>
    </div>
  </div>

  <div id="welcome" style="display:none">
    <div class="card">
      <div class="hero">👋</div>
      <h2>欢迎使用 weixin-bot-service</h2>
      <p>还没有连接任何微信账号。点下面的按钮，用微信扫码添加第一个账号。</p>
      <button id="welcomeAdd">📷 扫码添加微信账号</button>
    </div>
  </div>

  <div id="banner"></div>
  <main id="log"></main>

  <footer>
    <input type="file" id="file" style="display:none" />
    <button class="iconbtn" id="attach" title="发送图片/文件">＋</button>
    <textarea id="text" placeholder="输入消息，Enter 发送，Shift+Enter 换行"></textarea>
    <button id="send">发送</button>
  </footer>

<script>
(function () {
  var KEY = localStorage.getItem("wbs_key") || "";
  var cursor = 0;
  var peers = {};          // user_id -> label (for the current account)
  var selected = "";       // selected peer (WeChat user)
  var defaultPeer = "";
  var acct = "";           // selected account id
  var accounts = {};       // account id -> summary
  var timer = null;
  var qrTimer = null;
  var qrVerify = "";
  var pendingNewAcct = "";  // account just added, awaiting a name

  var $ = function (id) { return document.getElementById(id); };
  function h(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]; }); }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ "X-API-Key": KEY }, opts.headers || {});
    return fetch(path, opts);
  }
  function mediaUrl(u) { return u + (u.indexOf("?") < 0 ? "?" : "&") + "api_key=" + encodeURIComponent(KEY); }

  function banner(msg) {
    var b = $("banner");
    if (!msg) { b.className = ""; b.textContent = ""; return; }
    b.textContent = msg; b.className = "show";
  }

  function fmtTime(ms) {
    var d = new Date(ms);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function addBubble(side, text, media, ts) {
    var log = $("log");
    var row = document.createElement("div");
    row.className = "row " + side;
    var inner = "";
    if (media) {
      var mu = mediaUrl(media.url);
      if (media.type === "image") inner += '<img src="' + h(mu) + '" loading="lazy" />';
      else if (media.type === "video") inner += '<video src="' + h(mu) + '" controls></video>';
      else inner += '<a href="' + h(mu) + '" target="_blank">📎 ' + h(media.filename || "文件") +
        ' (' + Math.round((media.size || 0)/1024) + ' KB)</a>';
    }
    if (text) inner += h(text);
    inner += '<div class="t">' + fmtTime(ts) + '</div>';
    row.innerHTML = '<div class="bubble">' + inner + '</div>';
    log.appendChild(row);
    var near = log.scrollHeight - log.scrollTop - log.clientHeight < 160;
    if (near || side === "out") log.scrollTop = log.scrollHeight;
  }

  function sysLine(msg) {
    var log = $("log");
    var d = document.createElement("div");
    d.className = "sys"; d.textContent = msg;
    log.appendChild(d); log.scrollTop = log.scrollHeight;
  }

  function ensurePeer(id) {
    if (!id || peers[id]) return;
    peers[id] = id === defaultPeer ? id + "（你）" : id;
    var opt = document.createElement("option");
    opt.value = id; opt.textContent = peers[id];
    $("peer").appendChild(opt);
  }

  // All messaging calls are scoped to the selected account.
  function apath() { return acct ? "/accounts/" + encodeURIComponent(acct) : ""; }

  function acctName(a) { return (a && a.label) || ((a && a.id || "").split("@")[0]); }

  function showWelcome(show) { $("welcome").style.display = show ? "flex" : "none"; }

  // Load the account list, populate the account dropdown (showing labels), update
  // the status dot, and toggle the welcome screen when there are no accounts.
  function loadAccounts() {
    return api("/accounts").then(function (r) {
      if (r.status === 401) throw new Error("401");
      return r.json();
    }).then(function (d) {
      var list = d.accounts || [];
      var sel = $("account");
      list.forEach(function (a) {
        accounts[a.id] = a;
        var opt = sel.querySelector('option[value="' + a.id + '"]');
        if (!opt) { opt = document.createElement("option"); opt.value = a.id; sel.appendChild(opt); }
        opt.textContent = acctName(a);  // reflect label changes
      });
      showWelcome(list.length === 0);
      if (!acct && list.length) { acct = list[0].id; sel.value = acct; }
      var cur = accounts[acct];
      var st = cur && cur.poller && cur.poller.state;
      var dot = $("dot");
      dot.className = "dot" + (st === "RUNNING" ? " on" : st === "PAUSED_14" ? " warn" : "");
      if (cur && cur.ilink_user_id) { defaultPeer = cur.ilink_user_id; ensurePeer(defaultPeer); }
      if (!list.length) banner("");
      else if (st === "PAUSED_14") banner("该账号会话已暂停（token 失效）。点 📷 重新扫码登录。");
      else banner("");
    });
  }

  function loadPeers() {
    if (!acct) return Promise.resolve();
    return api(apath() + "/conversations").then(function (r) { return r.json(); }).then(function (d) {
      (d.conversations || []).forEach(function (cv) { ensurePeer(cv.user); });
      if (!selected) {
        selected = defaultPeer || (d.conversations[0] && d.conversations[0].user) || "";
        if (selected) $("peer").value = selected;
      }
    });
  }

  // Per-user isolation is server-side: /messages?user=<peer> returns only that
  // conversation for this account, so we render whatever comes back, by direction.
  function poll() {
    if (!acct || !selected) return Promise.resolve();
    return api(apath() + "/messages?user=" + encodeURIComponent(selected) + "&since=" + cursor + "&limit=200")
      .then(function (r) { if (r.status === 401) throw new Error("401"); return r.json(); })
      .then(function (d) {
        (d.messages || []).forEach(function (m) {
          cursor = Math.max(cursor, m.seq);
          addBubble(m.direction === "out" ? "out" : "in", m.text, m.media, m.received_at || m.timestamp);
        });
        if (typeof d.next_cursor === "number") cursor = Math.max(cursor, d.next_cursor);
      }).catch(function (e) { if (e.message === "401") gate("API Key 无效或已更改"); });
  }

  // Switch to a different account: clear peers + thread and reload.
  function switchAccount(id) {
    acct = id;
    peers = {}; selected = ""; defaultPeer = "";
    var sel = $("peer"); sel.innerHTML = "";
    var cur = accounts[acct];
    if (cur && cur.ilink_user_id) { defaultPeer = cur.ilink_user_id; ensurePeer(defaultPeer); }
    return loadPeers().then(reloadThread);
  }

  // Remove an account from the UI after logout/delete, then fall back to another.
  function removeAcctFromUI(id) {
    var sel = $("account");
    var opt = sel.querySelector('option[value="' + id + '"]');
    if (opt) sel.removeChild(opt);
    delete accounts[id];
    acct = "";
    return loadAccounts().then(function () {
      if (acct) { sel.value = acct; return switchAccount(acct); }
      peers = {}; selected = ""; defaultPeer = "";
      $("peer").innerHTML = ""; $("log").innerHTML = "";
    });
  }

  function logoutAccount() {
    if (!acct) return;
    if (!confirm("登出账号 " + acct.split("@")[0] + "？会话历史会保留，之后可重新扫码登录。")) return;
    api(apath() + "/logout", { method: "POST" })
      .then(function (r) { return r.json(); })
      .then(function () { removeAcctFromUI(acct); })
      .catch(function (e) { sysLine("登出失败：" + e.message); });
  }

  function deleteAccount() {
    if (!acct) return;
    if (!confirm("删除账号 " + acct.split("@")[0] + "？将清除该账号的全部消息历史，且不可恢复。")) return;
    api("/accounts/" + encodeURIComponent(acct), { method: "DELETE" })
      .then(function (r) { return r.json(); })
      .then(function () { removeAcctFromUI(acct); })
      .catch(function (e) { sysLine("删除失败：" + e.message); });
  }

  function reloadThread() {
    $("log").innerHTML = "";
    cursor = 0;
    if (selected) sysLine("— 与 " + (peers[selected] || selected) + " 的会话 —");
    return poll();
  }

  function sendText() {
    var t = $("text").value.trim();
    if (!t || !selected || !acct) return;
    $("send").disabled = true;
    api(apath() + "/send", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: selected, text: t })
    }).then(function (r) { return r.json().then(function (b) { return { ok: r.ok, b: b }; }); })
      .then(function (res) {
        if (res.ok && res.b.ok) { $("text").value = ""; poll(); }
        else sysLine("发送失败：" + (res.b.meaning || res.b.error || res.b.detail || "unknown") +
          (res.b.error === "no_context_token" ? "（对方需先给 bot 发一条消息）" : ""));
      })
      .catch(function (e) { sysLine("发送失败：" + e.message); })
      .finally(function () { $("send").disabled = false; $("text").focus(); });
  }

  function sendFile(file) {
    if (!file || !selected || !acct) return;
    sysLine("上传中：" + file.name + " …");
    var fd = new FormData();
    fd.append("to", selected); fd.append("file", file);
    api(apath() + "/send/media", { method: "POST", body: fd })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, b: b }; }); })
      .then(function (res) {
        if (res.ok && res.b.ok) poll();
        else sysLine("媒体发送失败：" + (res.b.error || res.b.detail || "unknown"));
      })
      .catch(function (e) { sysLine("媒体发送失败：" + e.message); });
  }

  // ---- gate ----
  function gate(err) {
    $("gate").style.display = "flex";
    if (err) $("keyErr").textContent = err;
    if (timer) { clearInterval(timer); timer = null; }
  }
  function start() {
    $("gate").style.display = "none";
    loadAccounts().then(loadPeers).then(reloadThread).then(function () {
      if (!timer) timer = setInterval(function () { poll(); loadAccounts(); loadPeers(); }, 2000);
    }).catch(function (e) {
      localStorage.removeItem("wbs_key"); KEY = "";
      gate(e.message === "401" ? "API Key 无效" : "连接失败：" + e.message);
    });
  }

  // ---- QR login ----
  function qrStatus(msg) { $("qrstatus").textContent = msg || ""; }
  function stopQrPoll() { if (qrTimer) { clearInterval(qrTimer); qrTimer = null; } }

  function openQr() {
    $("qrgate").style.display = "flex";
    $("qrbox").textContent = "正在获取二维码…";
    $("verifyRow").style.display = "none";
    qrVerify = "";
    qrStatus("");
    api("/login/qr", { method: "POST" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.qr_svg) { $("qrbox").innerHTML = d.qr_svg; qrStatus("请用微信扫描二维码…"); }
        else { $("qrbox").textContent = "获取二维码失败"; qrStatus(d.detail || d.error || ""); return; }
        stopQrPoll();
        qrTimer = setInterval(pollLogin, 2000);
      })
      .catch(function (e) { $("qrbox").textContent = "获取二维码失败"; qrStatus(e.message); });
  }

  function closeQr() {
    stopQrPoll();
    $("qrgate").style.display = "none";
    $("nameRow").style.display = "none";
    $("verifyRow").style.display = "none";
    if (pendingNewAcct) {
      var id = pendingNewAcct; pendingNewAcct = "";
      loadAccounts().then(function () { switchAccount(id); });
    }
  }

  function pollLogin() {
    var q = qrVerify ? "?verify_code=" + encodeURIComponent(qrVerify) : "";
    api("/login/qr" + q).then(function (r) { return r.json(); }).then(function (d) {
      qrVerify = ""; // each code is submitted once
      switch (d.status) {
        case "wait": qrStatus("请用微信扫描二维码…"); break;
        case "scaned": qrStatus("已扫描，验证中…"); break;
        case "redirecting": qrStatus("服务器重定向，继续…"); break;
        case "need_verifycode":
          $("verifyRow").style.display = "flex";
          qrStatus("微信显示了配对码，请在下方输入");
          $("verifyInput").focus();
          break;
        case "expired":
          if (d.qr_svg) $("qrbox").innerHTML = d.qr_svg;
          qrStatus("二维码已过期，已自动刷新，请重新扫描");
          break;
        case "confirmed":
          stopQrPoll();
          $("verifyRow").style.display = "none";
          $("qrbox").innerHTML = "✅";
          pendingNewAcct = (d.session && d.session.ilink_bot_id) || "";
          qrStatus("已添加账号，已上线（无需重启）。给它起个名字：");
          loadAccounts().then(function () {
            if (pendingNewAcct) { acct = pendingNewAcct; $("account").value = pendingNewAcct; }
            $("nameRow").style.display = "flex";
            $("nameInput").value = "";
            $("nameInput").focus();
          });
          break;
        case "error":
        case "no_attempt":
          stopQrPoll();
          qrStatus("登录失败：" + (d.message || d.error || "unknown"));
          break;
        default: qrStatus(d.message || d.status || "");
      }
    }).catch(function (e) { qrStatus("轮询失败：" + e.message); });
  }

  $("loginBtn").onclick = openQr;
  $("welcomeAdd").onclick = openQr;
  $("qrClose").onclick = closeQr;
  $("verifyBtn").onclick = function () {
    var v = $("verifyInput").value.trim();
    if (!v) return;
    qrVerify = v; $("verifyInput").value = ""; $("verifyRow").style.display = "none";
    qrStatus("提交配对码 " + v + " …");
    pollLogin();
  };
  $("verifyInput").addEventListener("keydown", function (e) { if (e.key === "Enter") $("verifyBtn").click(); });
  $("nameBtn").onclick = function () {
    var name = $("nameInput").value.trim();
    var id = pendingNewAcct;
    if (name && id) {
      api("/accounts/" + encodeURIComponent(id) + "/label", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: name })
      }).then(function () { closeQr(); }).catch(function () { closeQr(); });
    } else { closeQr(); }
  };
  $("nameInput").addEventListener("keydown", function (e) { if (e.key === "Enter") $("nameBtn").click(); });

  $("keyBtn").onclick = function () {
    KEY = $("keyInput").value.trim();
    if (!KEY) { $("keyErr").textContent = "请输入 API Key"; return; }
    localStorage.setItem("wbs_key", KEY);
    $("keyErr").textContent = "";
    start();
  };
  $("keyInput").addEventListener("keydown", function (e) { if (e.key === "Enter") $("keyBtn").click(); });
  $("logout").onclick = function () { localStorage.removeItem("wbs_key"); KEY = ""; gate(""); };
  $("account").onchange = function () { switchAccount(this.value); };
  $("acctRename").onclick = function () {
    if (!acct) return;
    var name = prompt("重命名账号：", acctName(accounts[acct]));
    if (name === null) return;
    name = name.trim(); if (!name) return;
    api(apath() + "/label", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: name })
    }).then(function () { loadAccounts(); }).catch(function (e) { sysLine("重命名失败：" + e.message); });
  };
  $("acctLogout").onclick = logoutAccount;
  $("acctDelete").onclick = deleteAccount;
  $("peer").onchange = function () { selected = this.value; reloadThread(); };
  $("send").onclick = sendText;
  $("text").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); }
  });
  $("attach").onclick = function () { $("file").click(); };
  $("file").onchange = function () { if (this.files[0]) sendFile(this.files[0]); this.value = ""; };

  if (KEY) { $("keyInput").value = KEY; start(); }
})();
</script>
</body>
</html>`

/* LikeBox 双栏收藏夹整理前端 */
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);

  const panesEl = $("#panes");
  const statText = $("#statText");
  const sortSelect = $("#sort");
  const layoutSwitch = $("#layoutSwitch");
  const themeBtn = $("#themeToggle");
  const contextMenu = $("#contextMenu");
  const commandToggle = $("#commandToggle");
  const commandPanel = $("#commandPanel");
  const commandSearch = $("#commandSearch");
  const commandSearchClear = $("#commandSearchClear");
  const commandLibList = $("#commandLibList");
  const commandTarget = $("#commandTarget");

  const editorModal = $("#editorModal");
  const editorTitle = $("#editorTitle");
  const editorForm = $("#editorForm");
  const inputLibrary = $("#inputLibrary");
  const inputUrl = $("#inputUrl");
  const inputTitle = $("#inputTitle");
  const inputFolder = $("#inputFolder");
  const inputTags = $("#inputTags");
  const folderOptions = $("#folderOptions");
  const btnSave = $("#btnSave");
  const btnFetchTitle = $("#btnFetchTitle");

  const confirmModal = $("#confirmModal");
  const confirmName = $("#confirmName");
  const btnConfirmDelete = $("#btnConfirmDelete");

  const quickTagModal = $("#quickTagModal");
  const quickTagForm = $("#quickTagForm");
  const quickTagName = $("#quickTagName");
  const quickTagInput = $("#quickTagInput");
  const btnQuickTagSave = $("#btnQuickTagSave");

  const noteModal = $("#noteModal");
  const noteForm = $("#noteForm");
  const noteName = $("#noteName");
  const noteInput = $("#noteInput");
  const btnNoteSave = $("#btnNoteSave");

  const replaceDomainModal = $("#replaceDomainModal");
  const replaceDomainForm = $("#replaceDomainForm");
  const replaceDomainOld = $("#replaceDomainOld");
  const replaceDomainNew = $("#replaceDomainNew");
  const replaceDomainScope = $("#replaceDomainScope");
  const btnReplaceDomain = $("#btnReplaceDomain");

  const batchTagModal = $("#batchTagModal");
  const batchTagForm = $("#batchTagForm");
  const batchTagCount = $("#batchTagCount");
  const batchTagInput = $("#batchTagInput");
  const btnBatchTagSave = $("#btnBatchTagSave");

  const batchImportModal = $("#batchImportModal");
  const batchLibrary = $("#batchLibrary");
  const batchFolder = $("#batchFolder");
  const batchFolderOptions = $("#batchFolderOptions");
  const batchProfile = $("#batchProfile");
  const batchText = $("#batchText");
  const batchRulesHint = $("#batchRulesHint");
  const batchPreview = $("#batchPreview");
  const batchPreviewSummary = $("#batchPreviewSummary");
  const btnBatchReloadRules = $("#btnBatchReloadRules");
  const btnBatchParse = $("#btnBatchParse");
  const btnBatchDoImport = $("#btnBatchDoImport");

  const batchExportModal = $("#batchExportModal");
  const batchExportLibrary = $("#batchExportLibrary");
  const batchExportFolder = $("#batchExportFolder");
  const batchExportSubfolders = $("#batchExportSubfolders");
  const batchExportSummary = $("#batchExportSummary");
  const batchExportPreview = $("#batchExportPreview");
  const btnBatchExportRefresh = $("#btnBatchExportRefresh");
  const btnBatchExportCopy = $("#btnBatchExportCopy");
  const btnBatchExportDownload = $("#btnBatchExportDownload");

  const folderModal = $("#folderModal");
  const folderTitle = $("#folderTitle");
  const folderForm = $("#folderForm");
  const folderName = $("#folderName");
  const folderHint = $("#folderHint");
  const btnFolderSave = $("#btnFolderSave");

  const folderDeleteModal = $("#folderDeleteModal");
  const folderDeleteName = $("#folderDeleteName");
  const folderDeleteCount = $("#folderDeleteCount");
  const btnFolderDelete = $("#btnFolderDelete");

  const tagModal = $("#tagModal");
  const tagForm = $("#tagForm");
  const tagInput = $("#tagInput");
  const btnTagSave = $("#btnTagSave");

  const networkModal = $("#networkModal");
  const lanEnabled = $("#lanEnabled");
  const lanPassword = $("#lanPassword");
  const networkAddresses = $("#networkAddresses");
  const btnNetworkSave = $("#btnNetworkSave");
  const btnRandomPassword = $("#btnRandomPassword");
  const btnNetwork = $("#btnNetwork");

  const exclusionsModal = $("#exclusionsModal");
  const exclusionsList = $("#exclusionsList");
  const exclusionInput = $("#exclusionInput");
  const btnAddExclusion = $("#btnAddExclusion");

  const backupModal = $("#backupModal");
  const backupSummary = $("#backupSummary");
  const backupList = $("#backupList");
  const btnBackupNow = $("#btnBackupNow");

  const toastBox = $("#toast");

  const LS_THEME = "likebox-theme";
  const LS_LAYOUT = "likebox-layout";
  const LS_PANES = "likebox-panes";
  const LS_VIEW = "likebox-view";
  const LS_FOLDER_WIDTH = "likebox-folder-width-";
  const MAX_PANES = 2;

  const blankPane = (libId = null) => ({
    libId,
    folder: null,
    q: "",
    page: 1,
    per: 100,
    items: [],
    total: 0,
    hasMore: false,
    folders: [],
    flat: [],
    libTotal: 0,
    loading: false,
    pendingScrollTop: null,
    showTree: true,
    batchMode: false,
    quickSelect: false,
    quickAnchor: null,
    selected: new Set(),
  });

  const state = {
    libraries: [],
    primary: null,
    layout: 2,
    panes: [blankPane(), blankPane()],
    sort: "recent",
    dragged: null,
    dragFolder: null,
    folderDrop: null,
    editingId: null,
    editingLibrary: null,
    pendingDelete: null,
    pendingBatch: null,
    folderEdit: null,
    folderDelete: null,
    tagLibrary: null,
    quickTagItem: null,
    noteItem: null,
    replaceDomainLibrary: null,
    batchTagPane: null,
    exclusionsLibrary: null,
    checkJobs: {},
    folderCache: {},
    menuItems: [],
    isLocal: true,
    ready: false,
    activePane: 0,
    activeArea: "",
    commandTarget: 0,
  };

  // ---------- 基础 ----------
  const persistView = () => {
    try {
      localStorage.setItem(
        LS_VIEW,
        JSON.stringify({
          sort: state.sort,
          panes: state.panes.map((pane) => ({
            lib: pane.libId || null,
            folder: pane.folder,
            showTree: pane.showTree !== false,
          })),
        })
      );
    } catch (err) {
      /* localStorage may be unavailable */
    }
  };

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const escapeAttr = escapeHtml;

  const safeUrl = (url) => {
    const raw = String(url || "").trim();
    return /^(https?:|file:|mailto:|ftp:)/i.test(raw) ? raw : "https://" + raw;
  };

  const initialOf = (text) => {
    const clean = String(text || "").replace(/^www\./i, "");
    return (clean[0] || "?").toUpperCase();
  };

  const folderLabel = (path) =>
    path === null || path === undefined ? "全部收藏" : path === "" ? "未分类" : path.replace(/\//g, " / ");

  const shortFolder = (path) => (path ? path.split("/").pop() : "未分类");

  const libraryById = (id) => state.libraries.find((lib) => lib.id === Number(id)) || null;

  const libraryLabel = (lib) => {
    const name = String((lib && lib.name) || "");
    const browser = String((lib && lib.browser) || "");
    if (!browser) return name;
    const escaped = browser.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const stripped = name.replace(new RegExp(`^${escaped}\\s*[·:\\-]?\\s*`, "i"), "");
    return stripped || name;
  };

  const browserClass = (browser) =>
    browser === "Edge" ? "edge" : browser === "Firefox" ? "firefox" : browser === "Chrome" ? "chrome" : "other";

  const tagHref = (tag) => `/tags/${encodeURIComponent(tag)}`;

  const renderTagChips = (tags, { limit = 4, offset = false } = {}) => {
    const list = Array.isArray(tags) ? tags : [];
    if (!list.length) return "";
    const shown = list.slice(0, limit);
    const chips = shown
      .map(
        (tag) =>
          `<a class="tag-chip${offset ? " offset" : ""}" href="${tagHref(tag)}" target="_blank" rel="noopener noreferrer" title="打开 #${escapeAttr(tag)} 标签页">#${escapeHtml(tag)}</a>`
      )
      .join("");
    const more = list.length > limit ? `<span class="tag-more">+${list.length - limit}</span>` : "";
    return `<span class="tag-list">${chips}${more}</span>`;
  };

  let toastTimer = null;
  const toast = (message, isError = false) => {
    toastBox.textContent = message;
    toastBox.classList.toggle("error", isError);
    toastBox.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastBox.hidden = true;
    }, 3000);
  };

  const api = async (url, options = {}) => {
    const res = await fetch(url, {
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`);
    return data;
  };

  const recordOpen = (id) => {
    if (!id) return;
    const url = `/api/bookmarks/${id}/open`;
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(url)) return;
    } catch (err) {
      /* ignore */
    }
    fetch(url, { method: "POST", keepalive: true }).catch(() => {});
  };

  // ---------- 主题 ----------
  const applyTheme = (theme) => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(LS_THEME, theme);
    themeBtn.textContent = theme === "dark" ? "☀" : "☾";
    themeBtn.title = theme === "dark" ? "切换到浅色模式" : "切换到深色模式";
    themeBtn.setAttribute("aria-label", themeBtn.title);
  };

  const initTheme = () => {
    const saved = localStorage.getItem(LS_THEME);
    const preferred = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    applyTheme(saved || preferred);
  };

  themeBtn.addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });

  // ---------- 收藏夹列表 ----------
  const updateStats = () => {
    const total = state.libraries.reduce((sum, lib) => sum + (lib.total || 0), 0);
    statText.textContent = `${state.libraries.length} 个收藏夹 · ${total} 条收藏`;
    renderCommandPanel();
  };

  const cleanPanes = () => {
    const ids = state.libraries.map((lib) => lib.id);
    state.panes.forEach((pane) => {
      if (pane.libId && !ids.includes(pane.libId)) {
        Object.assign(pane, blankPane(null));
      }
    });
  };

  const initialAssign = () => {
    cleanPanes();
    const used = new Set(state.panes.map((p) => p.libId).filter(Boolean));
    if (!state.panes[0].libId && state.primary) {
      state.panes[0].libId = state.primary;
      used.add(state.primary);
    }
    for (let i = 0; i < Math.min(MAX_PANES, state.libraries.length); i += 1) {
      if (!state.panes[i].libId) {
        const free = state.libraries.map((lib) => lib.id).find((id) => !used.has(id));
        if (free) {
          state.panes[i].libId = free;
          used.add(free);
        }
      }
    }
  };

  // ---------- 左上角收藏夹 / 搜索面板 ----------
  const commandPaneIndex = () => Math.min(state.layout - 1, Math.max(0, state.commandTarget));

  const hasActiveQuery = () => state.panes.slice(0, state.layout).some((pane) => pane.q);

  const renderCommandPanel = () => {
    const index = commandPaneIndex();
    const targetPane = state.panes[index];

    [...commandTarget.querySelectorAll("[data-pane]")].forEach((btn) => {
      const active = Number(btn.dataset.pane) === index;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
    commandTarget.hidden = state.layout < 2;

    const rows = state.libraries.map((lib) => {
      const current = targetPane.libId === lib.id;
      return `
        <div class="command-lib${current ? " current" : ""}" data-lib="${lib.id}" role="button" tabindex="0" aria-current="${current ? "true" : "false"}">
          <span class="browser-badge ${browserClass(lib.browser)}">${escapeHtml(lib.browser)}</span>
          <span class="command-lib-text">
            <span class="command-lib-name">${escapeHtml(libraryLabel(lib))}</span>
            <span class="command-lib-sub">${Number(lib.total || 0)} 条收藏${lib.is_primary ? " · 主收藏夹" : ""}</span>
            ${lib.tags && lib.tags.length ? `<span class="command-lib-tags">${renderTagChips(lib.tags, { limit: 4 })}</span>` : ""}
          </span>
          <button class="command-star${lib.is_primary ? " is-primary" : ""}" type="button" data-primary="${lib.id}"
                  title="${lib.is_primary ? "当前主收藏夹" : "设为主收藏夹"}" aria-label="${lib.is_primary ? "当前主收藏夹" : "设为主收藏夹"}">${lib.is_primary ? "★" : "☆"}</button>
        </div>`;
    });

    commandLibList.innerHTML = rows.length
      ? rows.join("")
      : `<div class="command-empty">还没有收藏夹，先点右上角「导入」。</div>`;

    if (document.activeElement !== commandSearch) commandSearch.value = targetPane.q || "";
    commandSearchClear.hidden = !(targetPane.q || hasActiveQuery());
    commandToggle.classList.toggle("has-filter", hasActiveQuery());
  };

  const openCommandPanel = (index = state.activePane) => {
    state.commandTarget = Math.min(state.layout - 1, Math.max(0, index));
    renderCommandPanel();
    commandPanel.hidden = false;
    commandToggle.classList.add("open");
    commandToggle.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => commandSearch.focus());
  };

  const closeCommandPanel = () => {
    commandPanel.hidden = true;
    commandToggle.classList.remove("open");
    commandToggle.setAttribute("aria-expanded", "false");
  };

  const setPaneLibrary = (index, libraryId) => {
    const showTree = state.panes[index].showTree;
    const query = state.panes[index].q;
    state.panes[index] = blankPane(libraryId);
    state.panes[index].showTree = showTree;
    state.panes[index].q = query;
    state.activePane = index;
    state.commandTarget = index;
    updatePane(index);
    if (libraryId) loadPane(index, { folders: false, reset: true });
    localStorage.setItem(LS_PANES, JSON.stringify(state.panes.map((pane) => pane.libId || null)));
    persistView();
    renderCommandPanel();
  };

  const applyCommandSearch = (value) => {
    const q = String(value || "").trim();
    for (let i = 0; i < state.layout; i += 1) {
      const pane = state.panes[i];
      if (!pane.libId) continue;
      pane.q = q;
      pane.selected.clear();
      pane.quickSelect = false;
      pane.quickAnchor = null;
      updatePane(i);
      loadPane(i, { folders: false, reset: true });
    }
    commandToggle.classList.toggle("has-filter", !!q);
    commandSearchClear.hidden = !q;
  };

  const reloadLibraries = async ({ clean = true } = {}) => {
    const data = await api("/api/libraries");
    state.libraries = data.libraries || [];
    state.primary = data.primary;
    if (clean) cleanPanes();
    updateStats();
  };

  // ---------- 栏骨架 ----------
  const paneShell = (index) => `
    <section class="pane" data-index="${index}" aria-label="收藏夹第 ${index + 1} 栏">
      <div class="pane-body">
        <div class="folder-panel">
          <div class="folder-list"></div>
          <div class="folder-footer">
            <div class="folder-count-row">
              <span class="browser-badge" hidden></span>
              <span class="pane-count"></span>
              <button class="meta-more load-more" type="button" hidden title="加载更多收藏"></button>
              <span class="net-progress" hidden></span>
            </div>
            <div class="folder-actions pane-tools">
              <button class="folder-icon tree-toggle" type="button" title="显示 / 隐藏文件夹" aria-label="显示 / 隐藏文件夹">▤</button>
              <button class="folder-icon batch-toggle" type="button" title="批量选择收藏" aria-label="批量选择收藏">☑</button>
              <button class="folder-icon pane-add" type="button" title="在这个收藏夹添加" aria-label="在这个收藏夹添加">＋</button>
              <button class="folder-icon pane-menu" type="button" title="更多操作" aria-label="更多操作">⋯</button>
            </div>
          </div>
        </div>
        <div class="folder-resizer" title="拖动调节文件夹栏宽度，双击恢复默认"></div>
        <div class="pane-list"></div>
      </div>
      <div class="pane-foot" hidden>
        <div class="batch-bar" hidden>
          <button class="batch-link batch-all" type="button" title="全选当前已加载的书签">全选</button>
          <button class="batch-link batch-clear" type="button">清空</button>
          <span class="batch-count" title="拖动已勾选的链接到左侧文件夹，可批量移动">已选 0</span>
          <button class="btn ghost sm batch-tag" type="button" disabled>批量加标签</button>
          <button class="btn danger sm batch-delete" type="button" disabled>删除</button>
          <button class="btn ghost sm batch-cancel" type="button">取消</button>
        </div>
      </div>
      <div class="pane-placeholder" hidden>
        <div class="ph-icon">🗂️</div>
        <p>这一栏还没有选择收藏夹。<br>在上方选择一个，或点「导入」添加新的书签文件。</p>
      </div>
    </section>`;

  const paneByIndex = (index) => panesEl.querySelector(`.pane[data-index="${index}"]`);

  const applyFolderWidth = (index) => {
    const paneEl = paneByIndex(index);
    if (!paneEl) return;
    const panel = $(".folder-panel", paneEl);
    const body = $(".pane-body", paneEl);
    if (!panel) return;
    const saved = Number(localStorage.getItem(`${LS_FOLDER_WIDTH}${state.layout}-${index}`));
    if (Number.isFinite(saved) && saved >= 80) {
      const maxWidth = Math.max(120, (body ? body.clientWidth : 600) - 150);
      const width = Math.min(maxWidth, Math.max(82, saved));
      panel.style.flexBasis = `${width}px`;
      panel.style.width = `${width}px`;
    } else {
      panel.style.removeProperty("flex-basis");
      panel.style.removeProperty("width");
    }
  };

  const renderPanes = () => {
    panesEl.dataset.layout = String(state.layout);
    panesEl.innerHTML = state.panes
      .slice(0, state.layout)
      .map((_, index) => paneShell(index))
      .join("");
    for (let i = 0; i < state.layout; i += 1) {
      updatePane(i);
      applyFolderWidth(i);
    }
  };

  // ---------- 渲染单个栏 ----------
  const folderRowHtml = (pane, path, name, count, depth, { drop = true, divider = false, total = count } = {}) => {
    const active =
      (path === "__all__" && pane.folder === null) ||
      (path !== "__all__" && pane.folder !== null && pane.folder === path);
    return `
      <button class="folder-row${active ? " active" : ""}${divider ? " divider" : ""}" type="button"
              draggable="${path && path !== "__all__" ? "true" : "false"}"
              data-library="${pane.libId}" data-folder="${escapeAttr(path)}" data-name="${escapeAttr(name)}"
              data-total="${total}" ${drop ? 'data-drop="1"' : ""} style="--depth:${depth}"
              title="${escapeAttr(drop && path !== "" ? `${name}（右键管理，选中后按 Delete 删除）` : name)}">
        <span class="folder-name">${escapeHtml(name)}</span>
        <span class="count">${count}</span>
      </button>`;
  };

  const folderListHtml = (pane) => {
    const rows = [folderRowHtml(pane, "__all__", "全部收藏", pane.libTotal, 0, { drop: false })];
    const uncategorized = pane.folders.find((node) => node.path === "");
    rows.push(
      folderRowHtml(pane, "", "未分类（拖到这里放根目录）", uncategorized ? uncategorized.total : 0, 0, {
        total: uncategorized ? uncategorized.total : 0,
      })
    );
    const walk = (nodes, depth) => {
      nodes.forEach((node) => {
        if (!node.path) return;
        rows.push(folderRowHtml(pane, node.path, node.name, node.total, depth, { total: node.total }));
        if (node.children && node.children.length) walk(node.children, depth + 1);
      });
    };
    walk(pane.folders, 1);
    return rows.join("");
  };

  const bookmarkRowHtml = (item, pane) => {
    const icon = item.icon
      ? `<img src="${escapeAttr(item.icon)}" alt="" loading="lazy" onerror="this.remove()">`
      : escapeHtml(initialOf(item.title));
    const fail = `${item.domain_status === 2
      ? `<span class="net-chip domain-chip" title="${escapeAttr(item.domain_error || "域名检测失败")}">域名挂掉</span>`
      : ""}${item.net_status === 2
      ? `<button class="net-chip" type="button" data-act="exclude" data-host="${escapeAttr(item.host || "")}" title="${escapeAttr(item.net_error || "网址检测失败")}">网址失效</button>`
      : ""}`;
    const selected = pane.selected.has(item.id);
    const isFail = item.net_status === 2 || item.domain_status === 2;
    return `
      <article class="bm${isFail ? " net-fail" : ""}${selected ? " selected" : ""}"
               draggable="true" data-id="${item.id}"
               data-library="${item.library_id}" data-folder="${escapeAttr(item.folder)}"
               data-title="${escapeAttr(item.title)}" data-host="${escapeAttr(item.host || "")}">
        <a class="bm-hit" href="${escapeAttr(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer"
           draggable="${pane.batchMode ? "false" : "true"}" title="${escapeAttr(item.url)}"></a>
        <input class="bm-check" type="checkbox" data-id="${item.id}" aria-label="选择此收藏" ${selected ? "checked" : ""}>
        <span class="bm-icon">${icon}</span>
        <div class="bm-text">
          <div class="bm-title" title="${escapeAttr(item.title)}">${escapeHtml(item.title)}</div>
          <div class="bm-sub">
            <span class="bm-domain">${escapeHtml(item.domain || "")}</span>
            <span class="bm-folder" title="${escapeAttr(folderLabel(item.folder))}">${escapeHtml(shortFolder(item.folder))}</span>
            ${fail}
          </div>
          ${item.note ? `<div class="bm-note" title="${escapeAttr(item.note)}">${escapeHtml(item.note)}</div>` : ""}
          ${item.tags && item.tags.length ? `<div class="bm-tags">${renderTagChips(item.tags, { limit: 4, offset: true })}</div>` : ""}
        </div>
        <div class="bm-actions">
          <input class="bm-quick-check" type="checkbox" data-id="${item.id}" aria-label="选择此收藏" title="选择此收藏" ${selected ? "checked" : ""}>
          <button class="icon-btn tag" type="button" data-act="tag" title="快速添加标签">#</button>
          <button class="icon-btn note" type="button" data-act="note" title="添加/编辑备注">🗒</button>
          <button class="icon-btn" type="button" data-act="edit" title="编辑">✎</button>
          <button class="icon-btn del" type="button" data-act="delete" title="删除">🗑</button>
        </div>
      </article>`;
  };

  const updatePane = (index, { preserveScroll = false } = {}) => {
    const paneEl = paneByIndex(index);
    if (!paneEl) return;
    const pane = state.panes[index];
    const lib = libraryById(pane.libId);

    const badge = $(".browser-badge", paneEl);
    const body = $(".pane-body", paneEl);
    const folderPanel = $(".folder-panel", paneEl);
    const folderList = $(".folder-list", paneEl);
    const list = $(".pane-list", paneEl);
    const foot = $(".pane-foot", paneEl);
    const placeholder = $(".pane-placeholder", paneEl);
    const tools = $(".pane-tools", paneEl);
    const folderScrollTop = preserveScroll ? folderList.scrollTop : null;
    const listScrollTop = preserveScroll ? (pane.pendingScrollTop ?? list.scrollTop) : null;

    paneEl.classList.toggle("primary", !!(lib && lib.is_primary));

    if (!lib) {
      badge.hidden = true;
      body.hidden = true;
      folderPanel.hidden = true;
      list.hidden = true;
      foot.hidden = true;
      tools.hidden = true;
      placeholder.hidden = false;
      return;
    }

    badge.hidden = false;
    badge.textContent = lib.browser;
    badge.title = lib.name;
    badge.className = `browser-badge ${browserClass(lib.browser)}`;

    body.hidden = false;
    folderPanel.hidden = false;
    list.hidden = false;
    tools.hidden = false;
    placeholder.hidden = true;

    const job = state.checkJobs[pane.libId];
    const progress = $(".net-progress", paneEl);
    if (job && job.running) {
      progress.hidden = false;
      progress.textContent = `检测 ${job.done}/${job.total}`;
    } else {
      progress.hidden = true;
      progress.textContent = "";
    }

    $(".pane-count", paneEl).textContent = `${pane.items.length}/${pane.total}`;

    folderList.innerHTML = folderListHtml(pane);
    if (preserveScroll && folderScrollTop !== null) folderList.scrollTop = folderScrollTop;

    if (pane.loading && (!preserveScroll || !pane.items.length)) {
      list.innerHTML = `<div class="pane-empty">加载中…</div>`;
    } else if (!pane.items.length) {
      list.innerHTML = `<div class="pane-empty">${
        pane.q
          ? "没有匹配的书签，换个关键词试试。"
          : pane.folder === null
          ? "这个收藏夹还没有书签，可以把其他栏的书签拖到下方文件夹。"
          : "这个文件夹还没有书签，可以把其他栏的书签拖进来。"
      }</div>`;
    } else if (!pane.loading || !preserveScroll) {
      list.innerHTML = pane.items.map((item) => bookmarkRowHtml(item, pane)).join("");
    }
    if (listScrollTop !== null) list.scrollTop = listScrollTop;

    const loadMore = $(".load-more", paneEl);
    loadMore.hidden = !!pane.batchMode || pane.items.length >= pane.total;
    loadMore.textContent = `↓ ${Math.max(0, pane.total - pane.items.length)}`;

    paneEl.classList.toggle("folders-collapsed", !pane.showTree);
    paneEl.classList.toggle("batch-mode", !!pane.batchMode);
    foot.hidden = !pane.batchMode;
    $(".batch-bar", paneEl).hidden = !pane.batchMode;
    updateBatchUi(index);
  };

  function updateBatchUi(index) {
    const paneEl = paneByIndex(index);
    const pane = state.panes[index];
    if (!paneEl || !pane) return;
    const count = pane.selected ? pane.selected.size : 0;
    const countEl = $(".batch-count", paneEl);
    const deleteBtn = $(".batch-delete", paneEl);
    const tagBtn = $(".batch-tag", paneEl);
    if (countEl) countEl.textContent = `已选 ${count}`;
    if (deleteBtn) deleteBtn.disabled = count === 0;
    if (tagBtn) tagBtn.disabled = count === 0;
    paneEl.querySelectorAll(".bm").forEach((row) => {
      const itemId = Number(row.dataset.id);
      const checked = pane.selected.has(itemId);
      row.classList.toggle("selected", checked);
      const box = $(".bm-check", row);
      if (box) box.checked = checked;
      const quickBox = $(".bm-quick-check", row);
      if (quickBox) quickBox.checked = checked;
    });
  }

  // ---------- 数据加载 ----------
  const fetchPaneFolders = async (pane) => {
    const data = await api(`/api/folders?library=${pane.libId}`);
    pane.folders = data.folders || [];
    pane.flat = data.flat || [];
    pane.libTotal = data.total || 0;
    state.folderCache[pane.libId] = pane.flat;
    if (pane.folder !== null && pane.folder !== "" && !pane.flat.includes(pane.folder)) {
      pane.folder = null;
    }
  };

  const fetchPaneList = async (pane, reset = true) => {
    if (reset) pane.page = 1;
    const params = new URLSearchParams();
    params.set("library", String(pane.libId));
    if (pane.q) params.set("q", pane.q);
    if (pane.folder !== null) params.set("folder", pane.folder);
    params.set("sort", state.sort);
    params.set("page", String(pane.page));
    params.set("per", String(pane.per));
    const data = await api(`/api/bookmarks?${params.toString()}`);
    pane.items = reset ? data.items : pane.items.concat(data.items);
    pane.total = data.total;
    pane.hasMore = data.has_more;
  };

  const loadPane = async (index, { folders = true, reset = true, preserveScroll = false } = {}) => {
    const pane = state.panes[index];
    if (!pane || !pane.libId || index >= state.layout) {
      updatePane(index);
      return;
    }
    if (preserveScroll) {
      const list = $(".pane-list", paneByIndex(index));
      pane.pendingScrollTop = list ? list.scrollTop : 0;
    } else {
      pane.pendingScrollTop = null;
    }
    pane.loading = true;
    updatePane(index, { preserveScroll });
    try {
      const tasks = [];
      if (folders) tasks.push(fetchPaneFolders(pane));
      tasks.push(fetchPaneList(pane, reset));
      await Promise.all(tasks);
    } catch (err) {
      toast(err.message, true);
    } finally {
      pane.loading = false;
      updatePane(index, { preserveScroll });
      pane.pendingScrollTop = null;
    }
  };

  const refreshLibrary = (libraryId, { preserveScroll = false } = {}) => {
    const jobs = [];
    for (let i = 0; i < state.layout; i += 1) {
      if (state.panes[i].libId === libraryId) {
        jobs.push(loadPane(i, { folders: true, reset: true, preserveScroll }));
      }
    }
    return Promise.all(jobs);
  };

  const setLayout = (layout) => {
    state.layout = Math.min(MAX_PANES, Math.max(1, layout));
    localStorage.setItem(LS_LAYOUT, String(state.layout));
    persistView();
    [...layoutSwitch.querySelectorAll("button")].forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.layout) === state.layout);
      btn.setAttribute("aria-pressed", Number(btn.dataset.layout) === state.layout ? "true" : "false");
    });
    renderPanes();
    state.activePane = Math.min(state.layout - 1, Math.max(0, state.activePane));
    state.commandTarget = state.activePane;
    renderCommandPanel();
    for (let i = 0; i < state.layout; i += 1) loadPane(i);
  };

  const placeLibrary = (libraryId) => {
    let index = state.panes.slice(0, state.layout).findIndex((pane) => !pane.libId);
    if (index < 0 && state.layout < MAX_PANES) {
      state.layout += 1;
      index = state.layout - 1;
    }
    if (index < 0) {
      [...layoutSwitch.querySelectorAll("button")].forEach((btn) => {
        btn.classList.toggle("active", Number(btn.dataset.layout) === state.layout);
      });
      return false;
    }
    state.panes[index] = blankPane(libraryId);
    state.panes[index].showTree = state.panes[0].showTree;
    localStorage.setItem(LS_LAYOUT, String(state.layout));
    persistView();
    [...layoutSwitch.querySelectorAll("button")].forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.layout) === state.layout);
    });
    renderPanes();
    loadPane(index);
    return true;
  };

  // ---------- 上下文菜单 ----------
  const closeMenu = () => {
    contextMenu.hidden = true;
    contextMenu.innerHTML = "";
    state.menuItems = [];
  };

  const showMenu = (x, y, items) => {
    state.menuItems = items;
    contextMenu.innerHTML = items
      .map(
        (item, index) =>
          `<button type="button" class="menu-item${item.danger ? " danger" : ""}" data-menu-index="${index}">${escapeHtml(item.label)}</button>`
      )
      .join("");
    contextMenu.hidden = false;
    contextMenu.style.left = "0px";
    contextMenu.style.top = "0px";
    const rect = contextMenu.getBoundingClientRect();
    contextMenu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    contextMenu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
  };

  contextMenu.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-menu-index]");
    if (!btn) return;
    const item = state.menuItems[Number(btn.dataset.menuIndex)];
    closeMenu();
    if (item && item.action) item.action();
  });

  document.addEventListener("click", (event) => {
    if (!contextMenu.hidden && !contextMenu.contains(event.target)) closeMenu();
  });
  document.addEventListener("scroll", closeMenu, true);
  window.addEventListener("resize", closeMenu);

  // ---------- 收藏夹标签 ----------
  const openTagModal = (libraryId) => {
    const lib = libraryById(libraryId);
    if (!lib) return;
    state.tagLibrary = libraryId;
    tagInput.value = (lib.tags || []).map((tag) => `#${tag}`).join(" ");
    openModal(tagModal);
    setTimeout(() => tagInput.focus(), 50);
  };

  tagForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.tagLibrary) return;
    btnTagSave.disabled = true;
    try {
      const data = await api(`/api/libraries/${state.tagLibrary}/tags`, {
        method: "POST",
        body: JSON.stringify({ tags: tagInput.value }),
      });
      const lib = libraryById(state.tagLibrary);
      if (lib) lib.tags = data.tags || [];
      closeModal(tagModal);
      await reloadLibraries({ clean: false });
      for (let i = 0; i < state.layout; i += 1) updatePane(i);
      toast("已保存收藏夹标签");
    } catch (err) {
      toast(err.message, true);
    } finally {
      btnTagSave.disabled = false;
    }
  });

  // ---------- 单条收藏快速标签 ----------
  const openQuickTag = (item) => {
    if (!item) return;
    state.quickTagItem = item;
    quickTagName.textContent = item.title;
    quickTagInput.value = (item.tags || []).map((tag) => `#${tag}`).join(" ");
    openModal(quickTagModal);
    setTimeout(() => {
      quickTagInput.focus();
      quickTagInput.select();
    }, 50);
  };

  quickTagForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const item = state.quickTagItem;
    if (!item) return;
    btnQuickTagSave.disabled = true;
    try {
      const data = await api(`/api/bookmarks/${item.id}`, {
        method: "PUT",
        body: JSON.stringify({
          library_id: item.library_id,
          url: item.url,
          title: item.title,
          folder: item.folder,
          tags: quickTagInput.value,
        }),
      });
      Object.assign(item, data.item || {});
      closeModal(quickTagModal);
      for (let i = 0; i < state.layout; i += 1) {
        if (state.panes[i].libId === item.library_id) updatePane(i);
      }
      toast(item.tags && item.tags.length ? "标签已保存" : "标签已清空");
    } catch (err) {
      toast(err.message, true);
    } finally {
      btnQuickTagSave.disabled = false;
    }
  });

  // ---------- 单条备注 ----------
  const openNote = (item) => {
    if (!item) return;
    state.noteItem = item;
    noteName.textContent = item.title;
    noteInput.value = item.note || "";
    openModal(noteModal);
    setTimeout(() => noteInput.focus(), 50);
  };

  noteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const item = state.noteItem;
    if (!item) return;
    btnNoteSave.disabled = true;
    try {
      const data = await api(`/api/bookmarks/${item.id}`, {
        method: "PUT",
        body: JSON.stringify({ note: noteInput.value }),
      });
      Object.assign(item, data.item || {});
      closeModal(noteModal);
      for (let i = 0; i < state.layout; i += 1) {
        if (state.panes[i].libId === item.library_id) updatePane(i);
      }
      toast(item.note ? "备注已保存" : "备注已清空");
    } catch (err) {
      toast(err.message, true);
    } finally {
      btnNoteSave.disabled = false;
    }
  });

  // ---------- 批量替换域名 ----------
  const openReplaceDomain = (index, host = "") => {
    const pane = state.panes[index];
    state.replaceDomainLibrary = pane ? pane.libId : null;
    replaceDomainOld.value = String(host || "").replace(/^www\./i, "");
    replaceDomainNew.value = "";
    replaceDomainScope.value = "library";
    openModal(replaceDomainModal);
    setTimeout(() => {
      if (replaceDomainOld.value) replaceDomainNew.focus();
      else replaceDomainOld.focus();
    }, 50);
  };

  replaceDomainForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (replaceDomainScope.value === "library" && !state.replaceDomainLibrary) {
      toast("请先选择收藏夹", true);
      return;
    }
    btnReplaceDomain.disabled = true;
    try {
      const payload = {
        old_domain: replaceDomainOld.value.trim(),
        new_domain: replaceDomainNew.value.trim(),
        scope: replaceDomainScope.value,
      };
      if (payload.scope === "library") payload.library_id = state.replaceDomainLibrary;
      const data = await api("/api/bookmarks/replace-domain", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!data.matched) {
        toast("没有找到匹配旧域名的链接", true);
        return;
      }
      closeModal(replaceDomainModal);
      for (let i = 0; i < state.layout; i += 1) {
        if (state.panes[i].libId) loadPane(i, { folders: false, reset: true });
      }
      const extra = data.skipped ? `，跳过 ${data.skipped} 条重复链接` : "";
      toast(`已替换 ${data.replaced} 条域名${extra}`);
    } catch (err) {
      toast(err.message, true);
    } finally {
      btnReplaceDomain.disabled = false;
    }
  });

  // ---------- 批量追加标签 ----------
  const openBatchTag = (index) => {
    const pane = state.panes[index];
    if (!pane || !pane.selected.size) {
      toast("请先选择要加标签的收藏", true);
      return;
    }
    state.batchTagPane = index;
    batchTagCount.textContent = `将给 ${pane.selected.size} 条收藏追加标签`;
    batchTagInput.value = "";
    openModal(batchTagModal);
    setTimeout(() => batchTagInput.focus(), 50);
  };

  batchTagForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const index = state.batchTagPane;
    const pane = state.panes[index];
    if (!pane || !pane.selected.size) {
      toast("请先选择要加标签的收藏", true);
      return;
    }
    btnBatchTagSave.disabled = true;
    try {
      const data = await api("/api/bookmarks/batch-tags", {
        method: "POST",
        body: JSON.stringify({ ids: [...pane.selected], tags: batchTagInput.value }),
      });
      closeModal(batchTagModal);
      await refreshLibrary(pane.libId);
      if (!data.updated) {
        toast("没有新增标签：标签已存在或已达 10 个上限", true);
      } else {
        const fullText = data.full ? `，${data.full} 条已达 10 个上限` : "";
        toast(`已为 ${data.updated} 条收藏追加标签${fullText}`);
      }
    } catch (err) {
      toast(err.message, true);
    } finally {
      btnBatchTagSave.disabled = false;
    }
  });

  // ---------- 局域网 ----------
  const openNetwork = async () => {
    try {
      const data = await api("/api/network");
      state.isLocal = true;
      lanEnabled.checked = !!data.enabled;
      lanPassword.value = "";
      const addresses = data.addresses && data.addresses.length ? data.addresses : ["（未检测到局域网 IP）"];
      networkAddresses.textContent = `${data.enabled ? "已开启" : "未开启"} · 端口 ${data.port} · 局域网地址：${addresses
        .map((ip) => `http://${ip}:${data.port}/`)
        .join(" 或 ")}`;
      openModal(networkModal);
    } catch (err) {
      toast(err.message, true);
    }
  };

  btnNetwork.addEventListener("click", openNetwork);

  btnRandomPassword.addEventListener("click", () => {
    const chars = "abcdefghjkmnpqrstuvwxy3456789";
    let value = "";
    for (let i = 0; i < 8; i += 1) value += chars[Math.floor(Math.random() * chars.length)];
    lanPassword.value = value;
  });

  btnNetworkSave.addEventListener("click", async () => {
    btnNetworkSave.disabled = true;
    try {
      const data = await api("/api/network/settings", {
        method: "POST",
        body: JSON.stringify({ enabled: lanEnabled.checked, password: lanPassword.value.trim() }),
      });
      lanEnabled.checked = !!data.enabled;
      lanPassword.value = "";
      const addresses = data.addresses && data.addresses.length ? data.addresses : ["（未检测到局域网 IP）"];
      networkAddresses.textContent = `${data.enabled ? "已开启" : "未开启"} · 端口 ${data.port} · 局域网地址：${addresses
        .map((ip) => `http://${ip}:${data.port}/`)
        .join(" 或 ")}`;
      toast(
        data.enabled
          ? data.has_password
            ? "局域网访问已开启，其他设备需要输入访问密码"
            : "已开启，但还没有密码，请在下方设置"
          : "局域网访问已关闭"
      );
    } catch (err) {
      toast(err.message, true);
    } finally {
      btnNetworkSave.disabled = false;
    }
  });

  // ---------- 排除域名 ----------
  const renderExclusions = (domains) => {
    exclusionsList.innerHTML = domains.length
      ? domains
          .map(
            (item) =>
              `<div class="exclusion-row"><span>${escapeHtml(item.domain)}</span><button type="button" class="icon-btn del" data-remove="${escapeAttr(item.domain)}" title="取消排除，重新检测该域名">×</button></div>`
          )
          .join("")
      : `<p class="form-hint">还没有排除域名。</p>`;
  };

  const openExclusions = async (libraryId) => {
    state.exclusionsLibrary = libraryId;
    try {
      const data = await api(`/api/exclusions?library=${libraryId}`);
      renderExclusions(data.domains || []);
      exclusionInput.value = "";
      openModal(exclusionsModal);
    } catch (err) {
      toast(err.message, true);
    }
  };

  exclusionsList.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-remove]");
    if (!btn || !state.exclusionsLibrary) return;
    try {
      await api("/api/exclusions", {
        method: "DELETE",
        body: JSON.stringify({ library_id: state.exclusionsLibrary, domain: btn.dataset.remove }),
      });
      const data = await api(`/api/exclusions?library=${state.exclusionsLibrary}`);
      renderExclusions(data.domains || []);
      toast("已移除排除域名");
    } catch (err) {
      toast(err.message, true);
    }
  });

  const addExclusion = async () => {
    const domain = exclusionInput.value.trim();
    if (!domain || !state.exclusionsLibrary) return;
    try {
      await api("/api/exclusions", {
        method: "POST",
        body: JSON.stringify({ library_id: state.exclusionsLibrary, domain }),
      });
      exclusionInput.value = "";
      const data = await api(`/api/exclusions?library=${state.exclusionsLibrary}`);
      renderExclusions(data.domains || []);
      await refreshLibrary(state.exclusionsLibrary);
      toast("已排除该域名，相关链接不再标记失效");
    } catch (err) {
      toast(err.message, true);
    }
  };

  btnAddExclusion.addEventListener("click", addExclusion);
  exclusionInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addExclusion();
    }
  });

  // ---------- 备份核查 ----------
  const formatBackupTime = (epoch) => {
    if (!epoch) return "未知时间";
    return new Date(epoch * 1000).toLocaleString("zh-CN", { hour12: false });
  };

  const formatBackupSize = (bytes) => {
    if (!bytes) return "0 B";
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  const renderBackupStatus = (data) => {
    const backups = data.backups || [];
    const bad = backups.filter((item) => !item.ok).length;
    backupSummary.textContent = backups.length
      ? `最多保留 ${data.keep} 份，当前 ${backups.length} 份；${
          bad ? `${bad} 份异常` : "全部校验通过"
        }；自动备份间隔 ${data.hours} 小时。`
      : `最多保留 ${data.keep} 份，当前还没有备份。`;
    backupList.innerHTML = backups.length
      ? backups
          .map(
            (item, index) => `
              <div class="backup-row${item.ok ? "" : " invalid"}">
                <div class="backup-main">
                  <div class="backup-name">${index === 0 ? "最新备份" : `备份 ${index + 1}`} · ${escapeHtml(
                    formatBackupTime(item.created_at)
                  )}</div>
                  <div class="backup-meta">${item.ok
                    ? `${item.bookmarks} 条收藏 · ${item.folders} 个文件夹 · ${formatBackupSize(item.size)}`
                    : escapeHtml(item.error || "校验失败")}</div>
                </div>
                <span class="backup-badge${item.ok ? " ok" : " bad"}">${
                  item.ok ? "校验通过" : "异常"
                }</span>
              </div>`
          )
          .join("")
      : `<p class="form-hint">暂无备份，可以点击下方按钮立即生成。</p>`;
  };

  const loadBackupStatus = async () => {
    backupSummary.textContent = "正在核查备份…";
    backupList.innerHTML = "";
    try {
      const data = await api("/api/backups");
      renderBackupStatus(data);
      return data;
    } catch (err) {
      backupSummary.textContent = `备份核查失败：${err.message}`;
      return null;
    }
  };

  const openBackupStatus = async () => {
    openModal(backupModal);
    await loadBackupStatus();
  };

  btnBackupNow.addEventListener("click", async () => {
    btnBackupNow.disabled = true;
    btnBackupNow.textContent = "正在备份并核查…";
    try {
      const data = await api("/api/backups", { method: "POST" });
      renderBackupStatus(data);
      toast(`备份完成并校验通过：${data.created}`);
    } catch (err) {
      toast(err.message, true);
      await loadBackupStatus();
    } finally {
      btnBackupNow.disabled = false;
      btnBackupNow.textContent = "立即备份并核查";
    }
  });

  // ---------- 失效检测 ----------
  const checkJobDone = async (job) => {
    const libId = job.library_id;
    const current = state.checkJobs[libId];
    if (current && current.id === job.id) delete state.checkJobs[libId];
    await refreshLibrary(libId);
    const domainFail = job.domain_fail || 0;
    toast(
      `检测完成：${job.ok} 条网址可访问，${job.fail} 条网址失效${
        domainFail ? `，其中 ${domainFail} 条域名挂掉` : ""
      }`
    );
  };

  const pollCheck = (libraryId, jobId) => {
    setTimeout(async () => {
      try {
        const data = await api(`/api/check/${jobId}`);
        const job = data.job;
        if (!job) return;
        state.checkJobs[libraryId] = job;
        for (let i = 0; i < state.layout; i += 1) {
          if (state.panes[i].libId === libraryId) updatePane(i);
        }
        if (job.running) pollCheck(libraryId, jobId);
        else await checkJobDone(job);
      } catch (err) {
        delete state.checkJobs[libraryId];
        for (let i = 0; i < state.layout; i += 1) updatePane(i);
        toast(err.message, true);
      }
    }, 700);
  };

  const startCheck = async (index, scope) => {
    const pane = state.panes[index];
    if (!pane.libId) return;
    if (scope === "ids" && !pane.items.length) {
      toast("当前列表没有可检测的链接", true);
      return;
    }
    try {
      const body = { library_id: pane.libId, scope: scope === "library" ? "library" : "ids" };
      if (scope !== "library") body.ids = pane.items.map((item) => item.id);
      const data = await api("/api/check/start", { method: "POST", body: JSON.stringify(body) });
      const job = data.job;
      state.checkJobs[pane.libId] = job;
      for (let i = 0; i < state.layout; i += 1) {
        if (state.panes[i].libId === pane.libId) updatePane(i);
      }
      toast(scope === "library" ? `开始检测整个收藏夹（${job.total} 条）` : `开始检测当前列表（${job.total} 条）`);
      pollCheck(pane.libId, job.id);
    } catch (err) {
      toast(err.message, true);
    }
  };

  const selectFailed = (index) => {
    const pane = state.panes[index];
    if (!pane || !pane.libId) return;
    const failed = pane.items.filter((item) => item.net_status === 2 || item.domain_status === 2);
    if (!failed.length) {
      toast("当前列表没有失效链接，先批量检测一次", true);
      return;
    }
    pane.batchMode = true;
    pane.selected = new Set(failed.map((item) => item.id));
    updatePane(index);
    toast(`已选中 ${failed.length} 条失效链接`);
  };

  const openPaneMenu = (index, button) => {
    const pane = state.panes[index];
    if (!pane.libId) return;
    const rect = button.getBoundingClientRect();
    showMenu(rect.right - 190, rect.bottom + 4, [
      { label: "重复链接检查…", action: () => window.open(`/duplicates?library=${pane.libId}`, "_blank", "noopener") },
      { label: "备份核查…", action: openBackupStatus },
      { label: "检测当前列表", action: () => startCheck(index, "ids") },
      { label: "检测整个收藏夹", action: () => startCheck(index, "library") },
      { label: "排除检测域名…", action: () => openExclusions(pane.libId) },
      { label: "收藏夹标签…", action: () => openTagModal(pane.libId) },
    ]);
  };

  // ---------- 交互 ----------
  panesEl.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest(".folder-resizer");
    if (!handle || event.button !== 0) return;
    event.preventDefault();
    const paneEl = handle.closest(".pane");
    const index = Number(paneEl.dataset.index);
    const panel = $(".folder-panel", paneEl);
    const body = $(".pane-body", paneEl);
    if (!panel || !body) return;

    const startX = event.clientX;
    const startWidth = panel.getBoundingClientRect().width;
    const pointerId = event.pointerId;
    const maxWidth = Math.max(120, Math.min(460, body.clientWidth - 150));

    const onMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      moveEvent.preventDefault();
      const width = Math.min(maxWidth, Math.max(82, startWidth + moveEvent.clientX - startX));
      panel.style.flexBasis = `${width}px`;
      panel.style.width = `${width}px`;
    };

    const onUp = (upEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      const width = Math.round(panel.getBoundingClientRect().width);
      localStorage.setItem(`${LS_FOLDER_WIDTH}${state.layout}-${index}`, String(width));
      handle.classList.remove("dragging");
      document.body.classList.remove("resizing-pane");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };

    handle.classList.add("dragging");
    document.body.classList.add("resizing-pane");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  });

  panesEl.addEventListener("dblclick", (event) => {
    const handle = event.target.closest(".folder-resizer");
    if (!handle) return;
    event.preventDefault();
    const index = Number(handle.closest(".pane").dataset.index);
    const panel = $(".folder-panel", handle.closest(".pane"));
    if (panel) {
      panel.style.removeProperty("flex-basis");
      panel.style.removeProperty("width");
    }
    localStorage.removeItem(`${LS_FOLDER_WIDTH}${state.layout}-${index}`);
  });

  layoutSwitch.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-layout]");
    if (!btn) return;
    setLayout(Number(btn.dataset.layout));
  });

  // ---------- 左上角面板交互 ----------
  let commandSearchTimer = null;

  commandToggle.addEventListener("click", () => {
    if (commandPanel.hidden) openCommandPanel(state.activePane);
    else closeCommandPanel();
  });

  commandTarget.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-pane]");
    if (!btn) return;
    state.commandTarget = Number(btn.dataset.pane);
    renderCommandPanel();
  });

  commandLibList.addEventListener("click", async (event) => {
    if (event.target.closest(".tag-chip")) return;
    const star = event.target.closest("[data-primary]");
    if (star) {
      event.preventDefault();
      event.stopPropagation();
      const id = Number(star.dataset.primary);
      const lib = libraryById(id);
      if (lib && !lib.is_primary) await setPrimary(id);
      renderCommandPanel();
      return;
    }
    const row = event.target.closest("[data-lib]");
    if (!row) return;
    setPaneLibrary(commandPaneIndex(), Number(row.dataset.lib));
    closeCommandPanel();
  });

  commandLibList.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest("[data-lib]");
    if (!row) return;
    event.preventDefault();
    setPaneLibrary(commandPaneIndex(), Number(row.dataset.lib));
    closeCommandPanel();
  });

  commandSearch.addEventListener("input", () => {
    clearTimeout(commandSearchTimer);
    commandSearchTimer = setTimeout(() => applyCommandSearch(commandSearch.value), 280);
  });

  commandSearchClear.addEventListener("click", () => {
    clearTimeout(commandSearchTimer);
    commandSearch.value = "";
    applyCommandSearch("");
    commandSearch.focus();
  });

  document.addEventListener("pointerdown", (event) => {
    if (commandPanel.hidden) return;
    if (commandPanel.contains(event.target) || commandToggle.contains(event.target)) return;
    closeCommandPanel();
  });

  const applyQuickSelect = (index, itemId, range = false) => {
    const pane = state.panes[index];
    if (!pane) return;
    const ids = pane.items.map((item) => item.id);
    const current = ids.indexOf(itemId);
    if (range && pane.quickAnchor != null) {
      const anchor = ids.indexOf(pane.quickAnchor);
      if (anchor >= 0 && current >= 0) {
        const start = Math.min(anchor, current);
        const end = Math.max(anchor, current);
        for (let i = start; i <= end; i += 1) pane.selected.add(ids[i]);
      } else if (current >= 0) {
        pane.selected.add(itemId);
      }
    } else {
      if (pane.selected.has(itemId)) pane.selected.delete(itemId);
      else pane.selected.add(itemId);
      pane.quickAnchor = itemId;
    }
    if (current >= 0 && pane.quickAnchor == null) pane.quickAnchor = itemId;
    pane.quickSelect = true;
    state.activePane = index;
    state.activeArea = "list";
    updateBatchUi(index);
  };

  panesEl.addEventListener("click", async (event) => {
    const paneEl = event.target.closest(".pane");
    if (!paneEl) return;
    const index = Number(paneEl.dataset.index);
    state.activePane = index;
    state.activeArea = event.target.closest(".folder-row") ? "folder" : "list";
    const pane = state.panes[index];

    if (event.target.closest(".batch-toggle")) {
      pane.batchMode = true;
      pane.quickSelect = false;
      pane.quickAnchor = null;
      pane.selected.clear();
      updatePane(index);
      return;
    }

    if (event.target.closest(".batch-cancel")) {
      pane.batchMode = false;
      pane.quickSelect = false;
      pane.quickAnchor = null;
      pane.selected.clear();
      updatePane(index);
      return;
    }

    if (event.target.closest(".batch-all")) {
      pane.items.forEach((item) => pane.selected.add(item.id));
      updateBatchUi(index);
      return;
    }

    if (event.target.closest(".batch-clear")) {
      pane.selected.clear();
      pane.quickAnchor = null;
      updateBatchUi(index);
      return;
    }

    if (event.target.closest(".batch-tag")) {
      openBatchTag(index);
      return;
    }

    if (event.target.closest(".batch-delete")) {
      askBatchDelete(index);
      return;
    }

    const quickCheck = event.target.closest(".bm-quick-check");
    if (quickCheck) {
      event.preventDefault();
      applyQuickSelect(index, Number(quickCheck.dataset.id), event.shiftKey);
      return;
    }

    const check = event.target.closest(".bm-check");
    if (check) return;

    if (pane.batchMode) {
      const batchRow = event.target.closest(".bm");
      if (batchRow && !event.target.closest(".net-chip")) {
        event.preventDefault();
        const itemId = Number(batchRow.dataset.id);
        if (pane.selected.has(itemId)) pane.selected.delete(itemId);
        else pane.selected.add(itemId);
        updateBatchUi(index);
        return;
      }
    }

    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      const quickRow = event.target.closest(".bm");
      if (quickRow && !event.target.closest(".bm-actions") && !event.target.closest(".net-chip")) {
        event.preventDefault();
        applyQuickSelect(index, Number(quickRow.dataset.id), event.shiftKey);
        return;
      }
    }

    const hit = event.target.closest(".bm-hit");
    if (hit) {
      const row = hit.closest(".bm");
      recordOpen(row.dataset.id);
    }

    const folderRow = event.target.closest(".folder-row");
    if (folderRow) {
      const path = folderRow.dataset.folder;
      pane.folder = path === "__all__" ? null : path;
      pane.selected.clear();
      pane.quickSelect = false;
      pane.quickAnchor = null;
      persistView();
      updatePane(index);
      await loadPane(index, { folders: false, reset: true });
      return;
    }

    if (event.target.closest(".tree-toggle")) {
      pane.showTree = !pane.showTree;
      localStorage.setItem("likebox-tree-" + index, pane.showTree ? "1" : "0");
      persistView();
      paneEl.classList.toggle("folders-collapsed", !pane.showTree);
      return;
    }

    if (event.target.closest(".pane-add")) {
      openEditor(null, { libraryId: pane.libId, folder: pane.folder === null ? "" : pane.folder });
      return;
    }

    if (event.target.closest(".pane-menu")) {
      event.stopPropagation();
      openPaneMenu(index, event.target.closest(".pane-menu"));
      return;
    }

    if (event.target.closest(".load-more")) {
      pane.page += 1;
      updatePane(index);
      await loadPane(index, { folders: false, reset: false });
      return;
    }

    const action = event.target.closest("[data-act]");
    if (action) {
      const row = action.closest(".bm");
      const item = row ? pane.items.find((it) => it.id === Number(row.dataset.id)) : null;
      if (!item) return;
      event.preventDefault();
      if (action.dataset.act === "edit") openEditor(item);
      else if (action.dataset.act === "tag") openQuickTag(item);
      else if (action.dataset.act === "note") openNote(item);
      else if (action.dataset.act === "delete") askDelete(item);
      else if (action.dataset.act === "exclude") {
        const host = item.host || action.dataset.host;
        if (!host) {
          toast("这个链接没有可用的域名", true);
          return;
        }
        try {
          await api("/api/exclusions", {
            method: "POST",
            body: JSON.stringify({ library_id: item.library_id, domain: host }),
          });
          toast(`已排除 ${host}，该域名的链接不再标记失效`);
          await refreshLibrary(item.library_id);
        } catch (err) {
          toast(err.message, true);
        }
      }
    }
  });

  panesEl.addEventListener("change", (event) => {
    const checkbox = event.target.closest(".bm-check");
    if (!checkbox) return;
    const paneEl = checkbox.closest(".pane");
    const index = Number(paneEl.dataset.index);
    const pane = state.panes[index];
    const itemId = Number(checkbox.dataset.id);
    if (checkbox.checked) pane.selected.add(itemId);
    else pane.selected.delete(itemId);
    updateBatchUi(index);
  });

  // 右键文件夹
  panesEl.addEventListener("contextmenu", (event) => {
    const folderRow = event.target.closest(".folder-row");
    if (folderRow) {
      event.preventDefault();
      const index = Number(folderRow.closest(".pane").dataset.index);
      const pane = state.panes[index];
      if (!pane.libId) return;
      const path = folderRow.dataset.folder;
      const name = folderRow.dataset.name;
      const total = Number(folderRow.dataset.total || 0);
      if (path === "__all__" || path === "") {
        showMenu(event.clientX, event.clientY, [
          { label: "新建文件夹（根目录）", action: () => openFolderCreate(pane.libId, "") },
          { label: "批量检测当前列表", action: () => startCheck(index, "ids") },
        ]);
        return;
      }
      showMenu(event.clientX, event.clientY, [
        { label: "新建子文件夹", action: () => openFolderCreate(pane.libId, path) },
        { label: "重命名", action: () => openFolderRename(pane.libId, path, name) },
        { label: "删除文件夹", danger: true, action: () => openFolderDelete(pane.libId, path, name, total) },
        { label: "批量检测此文件夹", action: () => startCheck(index, "ids") },
      ]);
      return;
    }

    const listArea = event.target.closest(".pane-list");
    if (!listArea) return;
    event.preventDefault();
    const index = Number(listArea.closest(".pane").dataset.index);
    const pane = state.panes[index];
    if (!pane.libId) return;
    const failed = pane.items.filter((item) => item.net_status === 2 || item.domain_status === 2).length;
    const host = event.target.closest(".bm") ? event.target.closest(".bm").dataset.host || "" : "";
    showMenu(event.clientX, event.clientY, [
      { label: `批量检测当前列表（${pane.items.length} 条）`, action: () => startCheck(index, "ids") },
      { label: "批量检测整个收藏夹", action: () => startCheck(index, "library") },
      { label: `一键选中失效链接（${failed} 条）`, action: () => selectFailed(index) },
      { label: "批量替换域名…", action: () => openReplaceDomain(index, host) },
      { label: "排除检测域名…", action: () => openExclusions(pane.libId) },
    ]);
  });

  // ---------- 拖拽 ----------
  const clearDragOver = () => {
    panesEl.querySelectorAll(".folder-row.drag-over").forEach((row) => row.classList.remove("drag-over"));
  };

  const clearFolderDrop = () => {
    panesEl
      .querySelectorAll(".folder-row")
      .forEach((row) =>
        row.classList.remove(
          "drag-over",
          "folder-drop-before",
          "folder-drop-after",
          "folder-drop-inside"
        )
      );
    panesEl.querySelectorAll(".folder-list").forEach((list) => list.classList.remove("folder-drop-root"));
  };

  panesEl.addEventListener("dragstart", (event) => {
    const folderRow = event.target.closest(".folder-row");
    if (folderRow && folderRow.dataset.folder && folderRow.dataset.folder !== "__all__") {
      const path = folderRow.dataset.folder;
      state.dragFolder = {
        path,
        name: folderRow.dataset.name || path.split("/").pop() || path,
        library: Number(folderRow.dataset.library),
      };
      try {
        event.dataTransfer.setData("text/plain", `likebox-folder:${path}`);
        event.dataTransfer.effectAllowed = "move";
      } catch (err) {
        /* ignore */
      }
      folderRow.classList.add("dragging");
      document.body.classList.add("folder-dragging");
      return;
    }

    const row = event.target.closest(".bm");
    if (!row) return;
    const paneEl = row.closest(".pane");
    const index = Number(paneEl.dataset.index);
    const pane = state.panes[index];
    const rowId = Number(row.dataset.id);
    const selectedDrag = !!(pane && pane.selected.has(rowId) && pane.selected.size > 0);
    const ids = selectedDrag ? [...pane.selected] : [rowId];
    const items = ids.map((id) => {
      const item = pane && pane.items.find((it) => it.id === id);
      return item
        ? { id: item.id, library: item.library_id, folder: item.folder }
        : { id, library: Number(row.dataset.library), folder: row.dataset.folder };
    });
    state.dragged = {
      batch: selectedDrag,
      ids: items.map((item) => item.id),
      items,
      id: rowId,
      library: Number(row.dataset.library),
      folder: row.dataset.folder,
      title: row.dataset.title || "",
    };
    try {
      event.dataTransfer.setData("text/plain", state.dragged.batch ? `likebox:${ids.join(",")}` : String(rowId));
      event.dataTransfer.effectAllowed = "move";
    } catch (err) {
      /* ignore */
    }
    if (state.dragged.batch) {
      paneEl.querySelectorAll(".bm").forEach((itemRow) => {
        if (pane.selected.has(Number(itemRow.dataset.id))) itemRow.classList.add("dragging");
      });
    } else {
      row.classList.add("dragging");
    }
    document.body.classList.add("dragging");
  });

  panesEl.addEventListener("dragend", () => {
    state.dragged = null;
    state.dragFolder = null;
    state.folderDrop = null;
    panesEl.querySelectorAll(".bm.dragging").forEach((row) => row.classList.remove("dragging"));
    panesEl.querySelectorAll(".folder-row.dragging").forEach((row) => row.classList.remove("dragging"));
    document.body.classList.remove("dragging", "folder-dragging");
    clearFolderDrop();
  });

  panesEl.addEventListener("dragover", (event) => {
    if (state.dragFolder) {
      const folderRow = event.target.closest(".folder-row");
      const list = event.target.closest(".folder-list");
      if (!list) return;
      const dragged = state.dragFolder;

      if (!folderRow) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (!state.folderDrop || state.folderDrop.mode !== "root") {
          clearFolderDrop();
          list.classList.add("folder-drop-root");
          state.folderDrop = { mode: "root", parent: "", library: dragged.library, targetPath: "" };
        }
        return;
      }

      const targetPath = folderRow.dataset.folder;
      const library = Number(folderRow.dataset.library);
      if (library !== dragged.library || targetPath === "__all__") {
        state.folderDrop = null;
        clearFolderDrop();
        return;
      }
      if (!targetPath) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (!state.folderDrop || state.folderDrop.mode !== "root") {
          clearFolderDrop();
          list.classList.add("folder-drop-root");
          state.folderDrop = { mode: "root", parent: "", library, targetPath: "" };
        }
        return;
      }
      if (targetPath === dragged.path || targetPath.startsWith(`${dragged.path}/`)) {
        state.folderDrop = null;
        clearFolderDrop();
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";

      const rect = folderRow.getBoundingClientRect();
      const ratio = rect.height ? (event.clientY - rect.top) / rect.height : 0.5;
      const mode = ratio < 0.24 ? "before" : ratio > 0.76 ? "after" : "inside";
      if (
        state.folderDrop &&
        state.folderDrop.mode === mode &&
        state.folderDrop.targetPath === targetPath
      ) {
        return;
      }
      clearFolderDrop();
      folderRow.classList.add(`folder-drop-${mode}`);
      const segments = targetPath.split("/");
      const parent = mode === "inside" ? targetPath : segments.slice(0, -1).join("/");
      state.folderDrop = { mode, parent, library, targetPath };
      return;
    }

    if (!state.dragged) return;
    const target = event.target.closest('.folder-row[data-drop="1"]');
    if (!target) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (!target.classList.contains("drag-over")) {
      clearDragOver();
      target.classList.add("drag-over");
    }
  });

  panesEl.addEventListener("dragleave", (event) => {
    const target = event.target.closest(".folder-row");
    if (!target) return;
    const related = event.relatedTarget;
    if (related && target.contains(related)) return;
    target.classList.remove(
      "drag-over",
      "folder-drop-before",
      "folder-drop-after",
      "folder-drop-inside"
    );
  });

  panesEl.addEventListener("drop", async (event) => {
    if (state.dragFolder) {
      event.preventDefault();
      const dragged = state.dragFolder;
      const drop = state.folderDrop;
      state.dragFolder = null;
      state.folderDrop = null;
      clearFolderDrop();
      document.body.classList.remove("folder-dragging");
      if (!drop) return;
      await moveFolder(dragged, drop);
      return;
    }

    const target = event.target.closest('.folder-row[data-drop="1"]');
    if (!target || !state.dragged) return;
    event.preventDefault();
    clearDragOver();
    document.body.classList.remove("dragging");

    const libraryId = Number(target.dataset.library);
    const folder = target.dataset.folder || "";
    const dragged = state.dragged;
    state.dragged = null;
    if (!libraryId) return;

    if (dragged.batch) {
      const allThere = dragged.items.every((item) => item.library === libraryId && item.folder === folder);
      if (allThere) {
        toast("选中的收藏已经在目标位置");
        return;
      }
      await moveBatch(dragged.items, libraryId, folder);
      return;
    }

    if (libraryId === dragged.library && folder === dragged.folder) {
      toast("书签已经在目标位置");
      return;
    }
    await moveBookmark(dragged.id, libraryId, folder, dragged.library);
  });

  const moveFolder = async (dragged, drop) => {
    try {
      const body = {
        library_id: dragged.library,
        path: dragged.path,
        parent: drop.parent,
      };
      if (drop.mode === "before") body.before = drop.targetPath;
      else if (drop.mode === "after") body.after = drop.targetPath;
      const data = await api("/api/folders/move", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const newPath = data.path;
      for (let i = 0; i < state.layout; i += 1) {
        const pane = state.panes[i];
        if (pane.libId !== dragged.library || !pane.folder) continue;
        if (pane.folder === dragged.path || pane.folder.startsWith(`${dragged.path}/`)) {
          pane.folder = newPath + pane.folder.slice(dragged.path.length);
        }
      }
      await refreshLibrary(dragged.library, { preserveScroll: true });
      toast(`已移动文件夹「${dragged.name}」到「${shortFolder(newPath)}」`);
    } catch (err) {
      toast(err.message, true);
      await refreshLibrary(dragged.library, { preserveScroll: true });
    }
  };

  const moveBatch = async (items, libraryId, folder) => {
    try {
      const data = await api("/api/bookmarks/batch-move", {
        method: "POST",
        body: JSON.stringify({
          ids: items.map((item) => item.id),
          library_id: libraryId,
          folder,
        }),
      });
      const lib = libraryById(libraryId);
      const skipped = data.skipped || 0;
      toast(
        `已移动 ${data.moved || 0} 条到「${lib ? lib.name : "收藏夹"} · ${shortFolder(folder)}」` +
          (skipped ? `，${skipped} 条重复已跳过` : "")
      );
      const sources = [...new Set(items.map((item) => item.library))];
      state.panes.forEach((pane) => {
        if (sources.includes(pane.libId)) pane.selected.clear();
      });
      await reloadLibraries();
      await refreshLibrary(libraryId, { preserveScroll: true });
      for (const source of sources) {
        if (source !== libraryId) await refreshLibrary(source, { preserveScroll: true });
      }
      updateStats();
    } catch (err) {
      toast(err.message, true);
      const sources = [...new Set(items.map((item) => item.library))];
      for (const source of sources) await refreshLibrary(source, { preserveScroll: true });
    }
  };

  const moveBookmark = async (id, libraryId, folder, fromLibraryId) => {
    try {
      await api(`/api/bookmarks/${id}/move`, {
        method: "POST",
        body: JSON.stringify({ library_id: libraryId, folder }),
      });
      const lib = libraryById(libraryId);
      toast(`已移动到「${lib ? lib.name : "收藏夹"} · ${shortFolder(folder)}」`);
      await reloadLibraries();
      await refreshLibrary(libraryId, { preserveScroll: true });
      if (fromLibraryId !== libraryId) await refreshLibrary(fromLibraryId, { preserveScroll: true });
      updateStats();
    } catch (err) {
      toast(err.message, true);
      await refreshLibrary(fromLibraryId, { preserveScroll: true });
    }
  };

  // ---------- 主收藏夹 ----------
  const setPrimary = async (libraryId) => {
    try {
      const data = await api(`/api/libraries/${libraryId}/primary`, { method: "POST" });
      state.libraries = data.libraries || state.libraries;
      state.primary = data.primary;
      state.libraries.forEach((lib) => {
        lib.is_primary = lib.id === state.primary;
      });
      updateStats();
      for (let i = 0; i < state.layout; i += 1) updatePane(i);
      toast(`已将「${libraryById(libraryId)?.name || ""}」设为主收藏夹`);
    } catch (err) {
      toast(err.message, true);
    }
  };

  // ---------- 弹窗 ----------
  const openModal = (modal) => {
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  };

  const closeModal = (modal) => {
    if (modal.hidden) return;
    modal.hidden = true;
    if (editorModal.hidden && confirmModal.hidden && folderModal.hidden && folderDeleteModal.hidden && tagModal.hidden && quickTagModal.hidden && noteModal.hidden && replaceDomainModal.hidden && batchTagModal.hidden && networkModal.hidden && exclusionsModal.hidden && backupModal.hidden) {
      document.body.style.overflow = "";
    }
  };

  document.querySelectorAll("[data-close]").forEach((el) => {
    el.addEventListener("click", () => closeModal(el.closest(".modal")));
  });

  const fillFolderOptions = async (libraryId) => {
    let flat = state.folderCache[libraryId];
    if (!flat) {
      try {
        const data = await api(`/api/folders?library=${libraryId}`);
        flat = data.flat || [];
        state.folderCache[libraryId] = flat;
      } catch (err) {
        flat = [];
      }
    }
    folderOptions.innerHTML = flat.map((path) => `<option value="${escapeAttr(path)}"></option>`).join("");
  };

  const openEditor = (item, defaults = {}) => {
    state.editingId = item ? item.id : null;
    state.editingLibrary = item ? item.library_id : null;
    editorTitle.textContent = item ? "编辑收藏" : "添加收藏";

    inputLibrary.innerHTML = state.libraries
      .map((lib) => `<option value="${lib.id}">${escapeHtml(lib.name)}</option>`)
      .join("");

    const libId = item ? item.library_id : defaults.libraryId || state.primary || (state.libraries[0] && state.libraries[0].id);
    inputLibrary.value = libId ? String(libId) : "";
    inputUrl.value = item ? item.url : "";
    inputTitle.value = item ? item.title : "";
    inputFolder.value = item ? item.folder : defaults.folder || "";
    inputTags.value = item ? (item.tags || []).map((tag) => `#${tag}`).join(" ") : "";
    btnSave.disabled = false;
    fillFolderOptions(Number(inputLibrary.value));
    openModal(editorModal);
    setTimeout(() => (item ? inputTitle : inputUrl).focus(), 60);
  };

  inputLibrary.addEventListener("change", () => {
    fillFolderOptions(Number(inputLibrary.value));
  });

  editorForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      library_id: Number(inputLibrary.value),
      url: inputUrl.value.trim(),
      title: inputTitle.value.trim(),
      folder: inputFolder.value.trim(),
      tags: inputTags.value.trim(),
    };
    if (!payload.library_id) {
      toast("请选择收藏夹", true);
      return;
    }
    if (!payload.url) {
      toast("请填写网址", true);
      inputUrl.focus();
      return;
    }
    btnSave.disabled = true;
    try {
      if (state.editingId) {
        await api(`/api/bookmarks/${state.editingId}`, { method: "PUT", body: JSON.stringify(payload) });
        toast("已保存修改");
      } else {
        await api("/api/bookmarks", { method: "POST", body: JSON.stringify(payload) });
        toast("已添加收藏");
      }
      const oldLibrary = state.editingLibrary;
      delete state.folderCache[payload.library_id];
      if (oldLibrary) delete state.folderCache[oldLibrary];
      closeModal(editorModal);
      await reloadLibraries();
      await refreshLibrary(payload.library_id);
      if (oldLibrary && oldLibrary !== payload.library_id) await refreshLibrary(oldLibrary);
    } catch (err) {
      toast(err.message, true);
    } finally {
      btnSave.disabled = false;
    }
  });

  btnFetchTitle.addEventListener("click", async () => {
    const url = inputUrl.value.trim();
    if (!url) {
      inputUrl.focus();
      return;
    }
    btnFetchTitle.disabled = true;
    btnFetchTitle.textContent = "获取中…";
    try {
      const data = await api(`/api/page-title?url=${encodeURIComponent(url)}`);
      if (data.title) {
        inputTitle.value = data.title;
        toast("已获取网页标题");
      }
    } catch (err) {
      toast(err.message, true);
    } finally {
      btnFetchTitle.disabled = false;
      btnFetchTitle.textContent = "取标题";
    }
  });

  function askDelete(item) {
    state.pendingDelete = item;
    state.pendingBatch = null;
    confirmName.textContent = item.title;
    openModal(confirmModal);
  }

  function askBatchDelete(index) {
    const pane = state.panes[index];
    if (!pane || !pane.selected.size) {
      toast("请先勾选要删除的收藏", true);
      return;
    }
    state.pendingDelete = null;
    state.pendingBatch = {
      ids: [...pane.selected],
      libraryId: pane.libId,
      index,
    };
    confirmName.textContent = `${pane.selected.size} 条选中的收藏`;
    openModal(confirmModal);
  }

  btnConfirmDelete.addEventListener("click", async () => {
    const batch = state.pendingBatch;
    const item = state.pendingDelete;
    if (!batch && !item) return;
    btnConfirmDelete.disabled = true;
    try {
      if (batch) {
        const data = await api("/api/bookmarks/batch-delete", {
          method: "POST",
          body: JSON.stringify({ ids: batch.ids }),
        });
        const pane = state.panes[batch.index];
        if (pane) {
          pane.batchMode = false;
          pane.quickSelect = false;
          pane.quickAnchor = null;
          pane.selected.clear();
        }
        closeModal(confirmModal);
        toast(`已删除 ${data.deleted || batch.ids.length} 条收藏`);
        state.pendingBatch = null;
        await reloadLibraries();
        await refreshLibrary(batch.libraryId);
      } else {
        await api(`/api/bookmarks/${item.id}`, { method: "DELETE" });
        closeModal(confirmModal);
        toast("已删除");
        state.pendingDelete = null;
        await reloadLibraries();
        await refreshLibrary(item.library_id);
      }
    } catch (err) {
      toast(err.message, true);
    } finally {
      btnConfirmDelete.disabled = false;
      state.pendingDelete = null;
      state.pendingBatch = null;
    }
  });

  // ---------- 文件夹 CRUD ----------
  const openFolderCreate = (libraryId, parent) => {
    state.folderEdit = { mode: "create", libraryId, parent, path: null };
    folderTitle.textContent = "新建文件夹";
    folderHint.textContent = parent ? `创建位置：${folderLabel(parent)}` : "创建位置：根目录";
    folderName.value = "";
    btnFolderSave.disabled = false;
    openModal(folderModal);
    setTimeout(() => folderName.focus(), 50);
  };

  const openFolderRename = (libraryId, path, name) => {
    state.folderEdit = { mode: "rename", libraryId, parent: null, path, name };
    folderTitle.textContent = "重命名文件夹";
    folderHint.textContent = `原路径：${folderLabel(path)}`;
    folderName.value = name;
    btnFolderSave.disabled = false;
    openModal(folderModal);
    setTimeout(() => {
      folderName.focus();
      folderName.select();
    }, 50);
  };

  folderForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const edit = state.folderEdit;
    if (!edit) return;
    const name = folderName.value.trim();
    if (!name) return;
    btnFolderSave.disabled = true;
    try {
      if (edit.mode === "create") {
        const data = await api("/api/folders", {
          method: "POST",
          body: JSON.stringify({ library_id: edit.libraryId, parent: edit.parent, name }),
        });
        toast(`已新建文件夹「${name}」`);
        delete state.folderCache[edit.libraryId];
        closeModal(folderModal);
        await reloadLibraries({ clean: false });
        await refreshLibrary(edit.libraryId);
        toast(`文件夹已创建：${folderLabel(data.path)}`);
      } else {
        const data = await api("/api/folders", {
          method: "PUT",
          body: JSON.stringify({ library_id: edit.libraryId, path: edit.path, name }),
        });
        delete state.folderCache[edit.libraryId];
        closeModal(folderModal);
        state.panes.forEach((pane) => {
          if (pane.libId !== edit.libraryId || pane.folder === null) return;
          if (pane.folder === edit.path) pane.folder = data.path;
          else if (pane.folder.startsWith(edit.path + "/")) {
            pane.folder = data.path + pane.folder.slice(edit.path.length);
          }
        });
        await reloadLibraries({ clean: false });
        await refreshLibrary(edit.libraryId);
        toast(`已重命名为「${name}」`);
      }
    } catch (err) {
      toast(err.message, true);
    } finally {
      btnFolderSave.disabled = false;
    }
  });

  const openFolderDelete = (libraryId, path, name, total) => {
    state.folderDelete = { libraryId, path, name };
    folderDeleteName.textContent = name;
    folderDeleteCount.textContent = total
      ? `将同时删除该文件夹及其子文件夹中的 ${total} 条收藏，无法恢复。`
      : "该文件夹及其子文件夹会被删除。";
    btnFolderDelete.disabled = false;
    openModal(folderDeleteModal);
  };

  btnFolderDelete.addEventListener("click", async () => {
    const item = state.folderDelete;
    if (!item) return;
    btnFolderDelete.disabled = true;
    try {
      const data = await api("/api/folders", {
        method: "DELETE",
        body: JSON.stringify({ library_id: item.libraryId, path: item.path }),
      });
      delete state.folderCache[item.libraryId];
      closeModal(folderDeleteModal);
      state.panes.forEach((pane) => {
        if (pane.libId !== item.libraryId || pane.folder === null) return;
        if (pane.folder === item.path || pane.folder.startsWith(item.path + "/")) pane.folder = null;
      });
      await reloadLibraries();
      await refreshLibrary(item.libraryId);
      toast(`已删除文件夹，同时删除 ${data.bookmarks} 条收藏`);
    } catch (err) {
      toast(err.message, true);
    } finally {
      btnFolderDelete.disabled = false;
      state.folderDelete = null;
    }
  });

  // ---------- 顶栏 ----------
  $("#btnAdd").addEventListener("click", () => {
    const active = state.panes.slice(0, state.layout).find((pane) => pane.libId);
    openEditor(null, {
      libraryId: active ? active.libId : state.primary,
      folder: active && active.folder !== null ? active.folder : "",
    });
  });

  const batchRulePathLabel = (data) => {
    const path = String((data && data.rules_path) || "").replace(/\\/g, "/");
    const short = path.split("/").filter(Boolean).slice(-2).join("/");
    if (data && data.rules_error) {
      batchRulesHint.textContent = `规则文件有问题，已回退到内置规则：${data.rules_error}`;
    } else {
      batchRulesHint.textContent = `规则文件：${short || "config/import_rules.json"}；可修改后点「刷新」重新读取。`;
    }
  };

  const loadBatchRules = async () => {
    try {
      const data = await api("/api/import/rules");
      const current = batchProfile.value;
      const profiles = data.profiles || [];
      batchProfile.innerHTML = profiles
        .map(
          (profile) =>
            `<option value="${escapeAttr(profile.key)}" title="${escapeAttr(profile.description || "")}">${escapeHtml(profile.name)}</option>`
        )
        .join("");
      if (current && profiles.some((profile) => profile.key === current)) {
        batchProfile.value = current;
      } else if (data.default_profile) {
        batchProfile.value = data.default_profile;
      }
      batchRulePathLabel(data);
    } catch (err) {
      batchRulesHint.textContent = `规则读取失败：${err.message}`;
    }
  };

  const fillBatchFolderOptions = async (libraryId) => {
    let flat = state.folderCache[libraryId];
    if (!flat) {
      try {
        const data = await api(`/api/folders?library=${libraryId}`);
        flat = data.flat || [];
        state.folderCache[libraryId] = flat;
      } catch (err) {
        flat = [];
      }
    }
    batchFolderOptions.innerHTML = flat
      .map((path) => `<option value="${escapeAttr(path)}"></option>`)
      .join("");
  };

  const invalidateBatchPreview = () => {
    batchPreview.innerHTML = "";
    batchPreviewSummary.textContent = "尚未解析";
    btnBatchDoImport.disabled = true;
  };

  const renderBatchPreview = (data) => {
    const items = data.items || [];
    const warnings = (data.warnings || []).length;
    const tagUnion = [];
    items.forEach((item) => {
      (item.tags || []).forEach((tag) => {
        if (!tagUnion.includes(tag)) tagUnion.push(tag);
      });
    });
    const tagSummary = tagUnion.length
      ? ` · 标签 #${tagUnion.slice(0, 8).join(" #")}${tagUnion.length > 8 ? " …" : ""}`
      : " · 无标签";
    batchPreviewSummary.textContent = data.total
      ? `已解析 ${data.total} 条${data.truncated ? `，预览前 ${items.length} 条` : ""}${warnings ? ` · ${warnings} 条提示` : ""}${tagSummary}`
      : "没有解析到网址";
    if (!items.length) {
      batchPreview.innerHTML = `<div class="batch-preview-empty">没有可预览的网址，请检查文本或规则</div>`;
      btnBatchDoImport.disabled = true;
      return;
    }
    batchPreview.innerHTML = items
      .map((item) => {
        const tags = (item.tags || [])
          .map((tag) => `<span class="batch-preview-tag">#${escapeHtml(tag)}</span>`)
          .join("");
        const tagLine = tags || `<span class="batch-preview-empty-tag">无</span>`;
        const note = item.note
          ? `<div class="batch-preview-note"><span class="batch-preview-label">备注</span>${escapeHtml(item.note.length > 180 ? `${item.note.slice(0, 180)}…` : item.note)}</div>`
          : `<div class="batch-preview-note"><span class="batch-preview-label">备注</span><span class="batch-preview-empty-tag">无</span></div>`;
        return `<div class="batch-preview-item">
          <div class="batch-preview-head">
            <span class="batch-preview-title">${escapeHtml(item.title || item.url)}</span>
            <span class="batch-preview-folder">${escapeHtml(item.folder || "未分类")}</span>
          </div>
          <div class="batch-preview-url">${escapeHtml(item.url)}</div>
          <div class="batch-preview-meta"><span class="batch-preview-label">标签</span>${tagLine}</div>
          ${note}
        </div>`;
      })
      .join("");
    btnBatchDoImport.disabled = !data.total;
  };

  const batchPayload = () => ({
    library_id: Number(batchLibrary.value),
    folder: batchFolder.value.trim(),
    profile: batchProfile.value,
    text: batchText.value,
  });

  const openBatchImport = (initialText = "") => {
    if (!state.libraries.length) {
      toast("还没有收藏夹，请先导入浏览器书签", true);
      return;
    }
    const active = state.panes[state.activePane] || {};
    const libId = active.libId || state.primary || state.libraries[0].id;
    batchLibrary.innerHTML = state.libraries
      .map((lib) => `<option value="${lib.id}">${escapeHtml(lib.name)}</option>`)
      .join("");
    batchLibrary.value = String(libId);
    batchFolder.value = active.libId === libId && active.folder ? active.folder : "";
    batchText.value = initialText || "";
    invalidateBatchPreview();
    loadBatchRules();
    fillBatchFolderOptions(libId);
    openModal(batchImportModal);
    setTimeout(() => batchText.focus(), 60);
  };

  const parseBatchPreview = async () => {
    const payload = batchPayload();
    if (!payload.library_id) {
      toast("请选择收藏夹", true);
      return;
    }
    if (!payload.text.trim()) {
      toast("请先粘贴或选择文本内容", true);
      batchText.focus();
      return;
    }
    btnBatchParse.disabled = true;
    try {
      const data = await api("/api/import/preview", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      renderBatchPreview(data);
      if (data.profiles) {
        const current = data.profile;
        batchProfile.innerHTML = data.profiles
          .map(
            (profile) =>
              `<option value="${escapeAttr(profile.key)}" title="${escapeAttr(profile.description || "")}">${escapeHtml(profile.name)}</option>`
          )
          .join("");
        batchProfile.value = current;
      }
      batchRulePathLabel(data);
    } catch (err) {
      invalidateBatchPreview();
      toast(err.message, true);
    } finally {
      btnBatchParse.disabled = false;
    }
  };

  const importBatch = async () => {
    const payload = batchPayload();
    if (!payload.library_id || !payload.text.trim()) {
      toast("请选择收藏夹并填写内容", true);
      return;
    }
    btnBatchDoImport.disabled = true;
    try {
      const data = await api("/api/import/batch", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const libraryId = payload.library_id;
      state.libraries = data.libraries || state.libraries;
      state.primary = data.primary;
      state.libraries.forEach((lib) => {
        lib.is_primary = lib.id === state.primary;
      });
      delete state.folderCache[libraryId];
      updateStats();
      const visible = state.panes
        .slice(0, state.layout)
        .some((pane) => pane.libId === libraryId);
      if (visible) {
        state.panes.slice(0, state.layout).forEach((pane) => {
          if (pane.libId === libraryId) pane.folder = data.target_folder || null;
        });
        await refreshLibrary(libraryId, { preserveScroll: false });
      } else {
        const placed = placeLibrary(libraryId);
        if (!placed) {
          toast(`已导入 ${data.inserted} 条，但当前栏位已满`, true);
        }
      }
      closeModal(batchImportModal);
      batchText.value = "";
      invalidateBatchPreview();
      const skipped = data.skipped ? `，跳过 ${data.skipped} 条重复` : "";
      toast(`已导入 ${data.inserted} 条${skipped}`);
    } catch (err) {
      toast(err.message, true);
      btnBatchDoImport.disabled = false;
    }
  };

  $("#btnBatchImport").addEventListener("click", () => openBatchImport());
  btnBatchReloadRules.addEventListener("click", loadBatchRules);
  btnBatchParse.addEventListener("click", parseBatchPreview);
  btnBatchDoImport.addEventListener("click", importBatch);
  batchLibrary.addEventListener("change", () => {
    batchFolder.value = "";
    fillBatchFolderOptions(Number(batchLibrary.value));
    invalidateBatchPreview();
  });
  batchFolder.addEventListener("input", invalidateBatchPreview);
  batchProfile.addEventListener("change", invalidateBatchPreview);
  batchText.addEventListener("input", invalidateBatchPreview);

  let batchExportData = null;

  const fillBatchExportFolders = async (libraryId) => {
    let flat = state.folderCache[libraryId];
    if (!flat) {
      try {
        const data = await api(`/api/folders?library=${libraryId}`);
        flat = data.flat || [];
        state.folderCache[libraryId] = flat;
      } catch (err) {
        flat = [];
      }
    }
    const options = [
      '<option value="__all__">全部文件夹（含未分类）</option>',
      '<option value="__uncategorized__">未分类</option>',
      ...flat.map((path) => `<option value="${escapeAttr(path)}">${escapeHtml(path)}</option>`),
    ];
    batchExportFolder.innerHTML = options.join("");
    batchExportFolder.value = "__all__";
  };

  const previewBatchExport = async () => {
    const libraryId = Number(batchExportLibrary.value);
    if (!libraryId) {
      toast("请选择收藏夹", true);
      return;
    }
    btnBatchExportRefresh.disabled = true;
    batchExportSummary.textContent = "正在生成预览…";
    try {
      const data = await api("/api/export/text", {
        method: "POST",
        body: JSON.stringify({
          library_id: libraryId,
          folder: batchExportFolder.value || "__all__",
          include_subfolders: batchExportSubfolders.checked,
        }),
      });
      batchExportData = data;
      batchExportPreview.value = data.text || "";
      const tagText = (data.tags || []).length
        ? ` · 标签 #${data.tags.slice(0, 8).join(" #")}${data.tags.length > 8 ? " …" : ""}`
        : " · 无标签";
      batchExportSummary.textContent = data.count
        ? `共 ${data.count} 条 · ${data.folders.length} 个文件夹${tagText}`
        : "没有可导出的收藏";
      btnBatchExportCopy.disabled = !data.count;
      btnBatchExportDownload.disabled = !data.count;
    } catch (err) {
      batchExportData = null;
      batchExportPreview.value = "";
      batchExportSummary.textContent = "预览生成失败";
      btnBatchExportCopy.disabled = true;
      btnBatchExportDownload.disabled = true;
      toast(err.message, true);
    } finally {
      btnBatchExportRefresh.disabled = false;
    }
  };

  const openBatchExport = async () => {
    if (!state.libraries.length) {
      toast("还没有收藏夹", true);
      return;
    }
    const active = state.panes[state.activePane] || {};
    const libId = active.libId || state.primary || state.libraries[0].id;
    batchExportLibrary.innerHTML = state.libraries
      .map((lib) => `<option value="${lib.id}">${escapeHtml(lib.name)}</option>`)
      .join("");
    batchExportLibrary.value = String(libId);
    batchExportData = null;
    batchExportPreview.value = "";
    batchExportSummary.textContent = "正在加载文件夹…";
    btnBatchExportCopy.disabled = true;
    btnBatchExportDownload.disabled = true;
    openModal(batchExportModal);
    await fillBatchExportFolders(libId);
    await previewBatchExport();
  };

  const copyBatchExport = async () => {
    const text = batchExportPreview.value;
    if (!text) {
      toast("没有可复制的内容", true);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast("导出文本已复制");
    } catch (err) {
      batchExportPreview.focus();
      batchExportPreview.select();
      try {
        document.execCommand("copy");
        toast("导出文本已复制");
      } catch (fallbackErr) {
        toast("复制失败，请手动全选复制", true);
      }
    }
  };

  const downloadBatchExport = () => {
    const text = batchExportPreview.value;
    if (!text) {
      toast("没有可下载的内容", true);
      return;
    }
    const library = state.libraries.find((lib) => lib.id === Number(batchExportLibrary.value));
    const suffix = batchExportData ? batchExportData.folder_label : "全部文件夹";
    const safe = `${library ? library.name : "LikeBox"}-${suffix}`
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "_")
      .slice(0, 100);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safe}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  $("#btnBatchExport").addEventListener("click", () => openBatchExport());
  btnBatchExportRefresh.addEventListener("click", previewBatchExport);
  btnBatchExportCopy.addEventListener("click", copyBatchExport);
  btnBatchExportDownload.addEventListener("click", downloadBatchExport);
  batchExportLibrary.addEventListener("change", async () => {
    await fillBatchExportFolders(Number(batchExportLibrary.value));
    await previewBatchExport();
  });
  batchExportFolder.addEventListener("change", previewBatchExport);
  batchExportSubfolders.addEventListener("change", previewBatchExport);

  $("#btnExport").addEventListener("click", () => {
    if (!state.primary) {
      toast("还没有可导出的收藏夹", true);
      return;
    }
    window.location.href = `/api/export?library=${state.primary}`;
  });

  $("#btnImport").addEventListener("click", () => $("#fileInput").click());

  $("#fileInput").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    const isHtml =
      name.endsWith(".html") ||
      name.endsWith(".htm") ||
      (file.type || "").includes("html");
    if (!isHtml) {
      try {
        const text = await file.text();
        openBatchImport(text);
        setTimeout(() => batchText.focus(), 80);
      } catch (err) {
        toast(`读取文本文件失败：${err.message}`, true);
      } finally {
        event.target.value = "";
      }
      return;
    }
    const form = new FormData();
    form.append("file", file);
    toast("正在导入…");
    try {
      const res = await fetch("/api/import", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "导入失败");
      state.libraries = data.libraries || state.libraries;
      state.primary = data.primary;
      state.libraries.forEach((lib) => {
        lib.is_primary = lib.id === state.primary;
      });
      updateStats();
      const placed = placeLibrary(data.library.id);
      if (placed) {
        toast(`已导入 ${data.inserted} 条，识别为「${data.browser}」`);
      } else {
        updatePane(0);
        updatePane(1);
        toast(`已导入 ${data.inserted} 条（${data.browser}），两栏已占用，请在栏头下拉选择新收藏夹`, true);
      }
    } catch (err) {
      toast(err.message, true);
    } finally {
      event.target.value = "";
    }
  });

  sortSelect.addEventListener("change", () => {
    state.sort = sortSelect.value;
    persistView();
    for (let i = 0; i < state.layout; i += 1) {
      state.panes[i].selected.clear();
      state.panes[i].quickSelect = false;
      state.panes[i].quickAnchor = null;
      loadPane(i, { folders: false, reset: true });
    }
  });

  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (commandPanel.hidden) openCommandPanel(state.activePane);
      else closeCommandPanel();
      return;
    }

    const typing = event.target.closest && event.target.closest("input:not([type='checkbox']):not([type='radio']), textarea, select, [contenteditable='true']");
    const activeEl = document.activeElement;
    const activeModal = activeEl && activeEl.closest ? activeEl.closest(".modal") : null;
    const pane = state.panes[state.activePane];

    if (event.key === "Enter" && !event.defaultPrevented) {
      if (!confirmModal.hidden && (!activeModal || activeModal === confirmModal)) {
        event.preventDefault();
        btnConfirmDelete.click();
        return;
      }
      if (!folderDeleteModal.hidden && !activeModal) {
        event.preventDefault();
        btnFolderDelete.click();
        return;
      }
    }

    if (event.key === "Delete" && !typing && !activeModal) {
      if (!pane || !pane.libId) return;
      if (pane.batchMode || pane.quickSelect) {
        if (pane.selected.size) {
          event.preventDefault();
          askBatchDelete(state.activePane);
        }
        return;
      }
      if (state.activeArea !== "folder" || !pane.showTree) return;
      const row = document.querySelector(`.pane[data-index="${state.activePane}"] .folder-row.active`);
      if (!row) return;
      const path = row.dataset.folder;
      if (!path || path === "__all__") return;
      event.preventDefault();
      openFolderDelete(pane.libId, path, row.dataset.name, Number(row.dataset.total || 0));
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a" && !typing && !activeModal) {
      if (!pane || (!pane.batchMode && !pane.quickSelect && state.activeArea !== "list")) return;
      event.preventDefault();
      pane.quickSelect = true;
      pane.items.forEach((item) => pane.selected.add(item.id));
      updateBatchUi(state.activePane);
      return;
    }

    if (event.key === "Escape") {
      const hadOverlay = !commandPanel.hidden || !contextMenu.hidden || [
        editorModal,
        confirmModal,
        folderModal,
        folderDeleteModal,
        tagModal,
        quickTagModal,
        noteModal,
        replaceDomainModal,
        batchTagModal,
        networkModal,
        exclusionsModal,
      ].some((modal) => !modal.hidden);
      closeCommandPanel();
      closeMenu();
      closeModal(editorModal);
      closeModal(confirmModal);
      closeModal(folderModal);
      closeModal(folderDeleteModal);
      closeModal(tagModal);
      closeModal(quickTagModal);
      closeModal(noteModal);
      closeModal(replaceDomainModal);
      closeModal(batchTagModal);
      closeModal(networkModal);
      closeModal(exclusionsModal);
      if (!hadOverlay) {
        let cleared = false;
        state.panes.forEach((pane, index) => {
          if (pane.quickSelect || pane.selected.size) {
            pane.selected.clear();
            pane.quickSelect = false;
            pane.quickAnchor = null;
            updateBatchUi(index);
            cleared = true;
          }
        });
        if (cleared) event.preventDefault();
      }
    }
  });

  // ---------- 启动 ----------
  const start = async () => {
    initTheme();

    const savedLayout = Number(localStorage.getItem(LS_LAYOUT));
    if (savedLayout >= 1 && savedLayout <= MAX_PANES) state.layout = savedLayout;

    try {
      await reloadLibraries({ clean: false });
      initialAssign();

      let savedPanes = null;
      try {
        savedPanes = JSON.parse(localStorage.getItem(LS_PANES) || "null");
      } catch (err) {
        savedPanes = null;
      }
      let savedView = null;
      try {
        savedView = JSON.parse(localStorage.getItem(LS_VIEW) || "null");
      } catch (err) {
        savedView = null;
      }
      if (Array.isArray(savedPanes)) {
        const valid = new Set(state.libraries.map((lib) => lib.id));
        savedPanes.slice(0, MAX_PANES).forEach((id, index) => {
          if (id && valid.has(id)) state.panes[index].libId = id;
        });
      }
      initialAssign();

      state.layout = Math.min(MAX_PANES, Math.max(1, state.layout));
      localStorage.setItem(LS_LAYOUT, String(state.layout));
      localStorage.setItem(LS_PANES, JSON.stringify(state.panes.map((pane) => pane.libId || null)));

      [...layoutSwitch.querySelectorAll("button")].forEach((btn) => {
        const active = Number(btn.dataset.layout) === state.layout;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
      });

      for (let i = 0; i < MAX_PANES; i += 1) {
        const saved = localStorage.getItem("likebox-tree-" + i);
        state.panes[i].showTree = saved === null ? true : saved === "1";
      }

      if (savedView && typeof savedView === "object") {
        if (["recent", "title", "folder", "oldest"].includes(savedView.sort)) {
          state.sort = savedView.sort;
          sortSelect.value = state.sort;
        }
        const panesView = Array.isArray(savedView.panes) ? savedView.panes : [];
        panesView.forEach((view, index) => {
          const pane = state.panes[index];
          if (!pane || !view || typeof view !== "object") return;
          if (view.folder === null || typeof view.folder === "string") pane.folder = view.folder;
          if (view.showTree !== undefined) pane.showTree = !!view.showTree;
        });
      }

      renderPanes();
      state.ready = true;
      state.activePane = 0;
      state.commandTarget = 0;
      renderCommandPanel();
      for (let i = 0; i < state.layout; i += 1) loadPane(i);

      try {
        const network = await api("/api/network/status");
        state.isLocal = !!network.is_local;
        btnNetwork.hidden = !state.isLocal;
      } catch (err) {
        /* ignore */
      }
    } catch (err) {
      toast(err.message, true);
    }
  };

  start();
})();

/* LikeBox 双栏收藏夹整理前端 */
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);

  const panesEl = $("#panes");
  const statText = $("#statText");
  const sortSelect = $("#sort");
  const layoutSwitch = $("#layoutSwitch");
  const themeBtn = $("#themeToggle");
  const contextMenu = $("#contextMenu");

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

  const toastBox = $("#toast");

  const LS_THEME = "likebox-theme";
  const LS_LAYOUT = "likebox-layout";
  const LS_PANES = "likebox-panes";
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
    showTree: true,
    batchMode: false,
    selected: new Set(),
  });

  const state = {
    libraries: [],
    primary: null,
    layout: 2,
    panes: [blankPane(), blankPane()],
    sort: "recent",
    dragged: null,
    editingId: null,
    editingLibrary: null,
    pendingDelete: null,
    pendingBatch: null,
    folderEdit: null,
    folderDelete: null,
    tagLibrary: null,
    exclusionsLibrary: null,
    checkJobs: {},
    folderCache: {},
    menuItems: [],
    isLocal: true,
    ready: false,
  };

  const searchTimers = new Map();

  // ---------- 基础 ----------
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
      <div class="pane-head">
        <div class="pane-lib">
          <select class="lib-select" aria-label="选择收藏夹"></select>
          <span class="browser-badge" hidden></span>
          <button class="primary-btn" type="button">☆ 设为主</button>
        </div>
        <div class="pane-tools">
          <input class="pane-search" type="search" placeholder="搜索标题 / 网址 / 文件夹" autocomplete="off">
          <button class="btn ghost sm tree-toggle" type="button" title="显示 / 隐藏文件夹">文件夹</button>
          <button class="btn ghost sm pane-add" type="button" title="在这个收藏夹添加">+</button>
          <button class="btn ghost sm pane-menu" type="button" title="更多操作">⋯</button>
        </div>
      </div>
      <div class="pane-meta">
        <span class="folder-label">全部收藏</span>
        <span class="pane-count"></span>
        <span class="net-progress" hidden></span>
      </div>
      <div class="pane-tags" hidden></div>
      <div class="pane-body">
        <div class="folder-panel"><div class="folder-list"></div></div>
        <div class="folder-resizer" title="拖动调节文件夹栏宽度，双击恢复默认"></div>
        <div class="pane-list"></div>
      </div>
      <div class="pane-foot">
        <span class="shown"></span>
        <div class="foot-actions">
          <button class="btn ghost sm batch-toggle" type="button">批量</button>
          <button class="btn ghost sm load-more" type="button" hidden>加载更多</button>
        </div>
        <div class="batch-bar" hidden>
          <button class="batch-link batch-all" type="button" title="全选当前已加载的书签">全选</button>
          <button class="batch-link batch-clear" type="button">清空</button>
          <span class="batch-count">已选 0</span>
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
              data-library="${pane.libId}" data-folder="${escapeAttr(path)}" data-name="${escapeAttr(name)}"
              data-total="${total}" ${drop ? 'data-drop="1"' : ""} style="--depth:${depth}">
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
    const fail =
      item.net_status === 2
        ? `<button class="net-chip" type="button" data-act="exclude" data-host="${escapeAttr(item.host || "")}" title="${escapeAttr(item.net_error || "链接检测失败")}">网址失效</button>`
        : "";
    const selected = pane.selected.has(item.id);
    return `
      <article class="bm${item.net_status === 2 ? " net-fail" : ""}${selected ? " selected" : ""}"
               draggable="${pane.batchMode ? "false" : "true"}" data-id="${item.id}"
               data-library="${item.library_id}" data-folder="${escapeAttr(item.folder)}"
               data-title="${escapeAttr(item.title)}" data-host="${escapeAttr(item.host || "")}">
        <a class="bm-hit" href="${escapeAttr(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer"
           draggable="true" title="${escapeAttr(item.url)}"></a>
        <input class="bm-check" type="checkbox" data-id="${item.id}" aria-label="选择此收藏" ${selected ? "checked" : ""}>
        <span class="bm-icon">${icon}</span>
        <div class="bm-text">
          <div class="bm-title" title="${escapeAttr(item.title)}">${escapeHtml(item.title)}</div>
          <div class="bm-sub">
            <span class="bm-domain">${escapeHtml(item.domain || "")}</span>
            <span class="bm-folder" title="${escapeAttr(folderLabel(item.folder))}">${escapeHtml(shortFolder(item.folder))}</span>
            ${fail}
          </div>
          ${item.tags && item.tags.length ? `<div class="bm-tags">${renderTagChips(item.tags, { limit: 4, offset: true })}</div>` : ""}
        </div>
        <div class="bm-actions">
          <button class="icon-btn" type="button" data-act="edit" title="编辑">✎</button>
          <button class="icon-btn del" type="button" data-act="delete" title="删除">🗑</button>
        </div>
      </article>`;
  };

  const updatePane = (index) => {
    const paneEl = paneByIndex(index);
    if (!paneEl) return;
    const pane = state.panes[index];
    const lib = libraryById(pane.libId);

    const select = $(".lib-select", paneEl);
    const options = [`<option value="">— 选择收藏夹 —</option>`]
      .concat(
        state.libraries.map(
          (item) => `<option value="${item.id}">${escapeHtml(item.name)}${item.is_primary ? " ★" : ""}</option>`
        )
      )
      .join("");
    if (select.dataset.signature !== options) {
      select.innerHTML = options;
      select.dataset.signature = options;
    }
    select.value = pane.libId ? String(pane.libId) : "";

    const badge = $(".browser-badge", paneEl);
    const primaryBtn = $(".primary-btn", paneEl);
    const meta = $(".pane-meta", paneEl);
    const tagsRow = $(".pane-tags", paneEl);
    const body = $(".pane-body", paneEl);
    const folderPanel = $(".folder-panel", paneEl);
    const list = $(".pane-list", paneEl);
    const foot = $(".pane-foot", paneEl);
    const placeholder = $(".pane-placeholder", paneEl);
    const tools = $(".pane-tools", paneEl);
    const search = $(".pane-search", paneEl);

    paneEl.classList.toggle("primary", !!(lib && lib.is_primary));

    if (!lib) {
      badge.hidden = true;
      primaryBtn.hidden = true;
      meta.hidden = true;
      tagsRow.hidden = true;
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
    badge.className = `browser-badge ${browserClass(lib.browser)}`;

    primaryBtn.hidden = false;
    primaryBtn.textContent = lib.is_primary ? "★ 主收藏夹" : "☆ 设为主";
    primaryBtn.classList.toggle("is-primary", lib.is_primary);

    meta.hidden = false;
    tagsRow.hidden = false;
    body.hidden = false;
    folderPanel.hidden = false;
    list.hidden = false;
    foot.hidden = false;
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

    $(".folder-label", meta).textContent = folderLabel(pane.folder);
    $(".pane-count", meta).textContent = pane.q ? `搜索“${pane.q}”` : `${pane.total} 条`;

    if (document.activeElement !== search) search.value = pane.q;

    tagsRow.innerHTML = `${renderTagChips(lib.tags || [])}<button class="tag-add" type="button" data-act="tag-lib" title="给整个收藏夹打标签"># 标签</button>`;

    $(".folder-list", paneEl).innerHTML = folderListHtml(pane);

    if (pane.loading) {
      list.innerHTML = `<div class="pane-empty">加载中…</div>`;
    } else if (!pane.items.length) {
      list.innerHTML = `<div class="pane-empty">${
        pane.q
          ? "没有匹配的书签，换个关键词试试。"
          : pane.folder === null
          ? "这个收藏夹还没有书签，可以把其他栏的书签拖到下方文件夹。"
          : "这个文件夹还没有书签，可以把其他栏的书签拖进来。"
      }</div>`;
    } else {
      list.innerHTML = pane.items.map((item) => bookmarkRowHtml(item, pane)).join("");
    }

    $(".shown", paneEl).textContent = `${pane.items.length} / ${pane.total} 条`;
    const loadMore = $(".load-more", paneEl);
    loadMore.hidden = !(pane.items.length < pane.total);
    loadMore.textContent = `加载更多（${Math.max(0, pane.total - pane.items.length)}）`;

    paneEl.classList.toggle("folders-collapsed", !pane.showTree);
    paneEl.classList.toggle("batch-mode", !!pane.batchMode);
    $(".shown", paneEl).hidden = !!pane.batchMode;
    $(".foot-actions", paneEl).hidden = !!pane.batchMode;
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
    if (countEl) countEl.textContent = `已选 ${count}`;
    if (deleteBtn) deleteBtn.disabled = count === 0;
    if (pane.batchMode) {
      paneEl.querySelectorAll(".bm").forEach((row) => {
        const itemId = Number(row.dataset.id);
        const checked = pane.selected.has(itemId);
        row.classList.toggle("selected", checked);
        const box = $(".bm-check", row);
        if (box) box.checked = checked;
      });
    }
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

  const loadPane = async (index, { folders = true, reset = true } = {}) => {
    const pane = state.panes[index];
    if (!pane || !pane.libId || index >= state.layout) {
      updatePane(index);
      return;
    }
    pane.loading = true;
    updatePane(index);
    try {
      const tasks = [];
      if (folders) tasks.push(fetchPaneFolders(pane));
      tasks.push(fetchPaneList(pane, reset));
      await Promise.all(tasks);
    } catch (err) {
      toast(err.message, true);
    } finally {
      pane.loading = false;
      updatePane(index);
    }
  };

  const refreshLibrary = (libraryId) => {
    const jobs = [];
    for (let i = 0; i < state.layout; i += 1) {
      if (state.panes[i].libId === libraryId) jobs.push(loadPane(i, { folders: true, reset: true }));
    }
    return Promise.all(jobs);
  };

  const setLayout = (layout) => {
    state.layout = Math.min(MAX_PANES, Math.max(1, layout));
    localStorage.setItem(LS_LAYOUT, String(state.layout));
    [...layoutSwitch.querySelectorAll("button")].forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.layout) === state.layout);
      btn.setAttribute("aria-pressed", Number(btn.dataset.layout) === state.layout ? "true" : "false");
    });
    renderPanes();
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

  // ---------- 失效检测 ----------
  const checkJobDone = async (job) => {
    const libId = job.library_id;
    const current = state.checkJobs[libId];
    if (current && current.id === job.id) delete state.checkJobs[libId];
    await refreshLibrary(libId);
    toast(`检测完成：${job.ok} 条可访问，${job.fail} 条失效`);
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

  const openPaneMenu = (index, button) => {
    const pane = state.panes[index];
    if (!pane.libId) return;
    const rect = button.getBoundingClientRect();
    showMenu(rect.right - 190, rect.bottom + 4, [
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

  panesEl.addEventListener("click", async (event) => {    const paneEl = event.target.closest(".pane");
    if (!paneEl) return;
    const index = Number(paneEl.dataset.index);
    const pane = state.panes[index];

    if (event.target.closest(".batch-toggle")) {
      pane.batchMode = true;
      pane.selected.clear();
      updatePane(index);
      return;
    }

    if (event.target.closest(".batch-cancel")) {
      pane.batchMode = false;
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
      updateBatchUi(index);
      return;
    }

    if (event.target.closest(".batch-delete")) {
      askBatchDelete(index);
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
      updatePane(index);
      await loadPane(index, { folders: false, reset: true });
      return;
    }

    if (event.target.closest(".tree-toggle")) {
      pane.showTree = !pane.showTree;
      localStorage.setItem("likebox-tree-" + index, pane.showTree ? "1" : "0");
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

    if (event.target.closest(".primary-btn")) {
      if (pane.libId && !libraryById(pane.libId).is_primary) await setPrimary(pane.libId);
      return;
    }

    if (event.target.closest(".load-more")) {
      pane.page += 1;
      updatePane(index);
      await loadPane(index, { folders: false, reset: false });
      return;
    }

    if (event.target.closest('[data-act="tag-lib"]')) {
      if (pane.libId) openTagModal(pane.libId);
      return;
    }

    const action = event.target.closest("[data-act]");
    if (action) {
      const row = action.closest(".bm");
      const item = row ? pane.items.find((it) => it.id === Number(row.dataset.id)) : null;
      if (!item) return;
      event.preventDefault();
      if (action.dataset.act === "edit") openEditor(item);
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
    if (checkbox) {
      const paneEl = checkbox.closest(".pane");
      const index = Number(paneEl.dataset.index);
      const pane = state.panes[index];
      const itemId = Number(checkbox.dataset.id);
      if (checkbox.checked) pane.selected.add(itemId);
      else pane.selected.delete(itemId);
      updateBatchUi(index);
      return;
    }

    const select = event.target.closest(".lib-select");
    if (!select) return;
    const index = Number(select.closest(".pane").dataset.index);
    const value = select.value ? Number(select.value) : null;
    state.panes[index] = blankPane(value);
    state.panes[index].showTree = state.panes[0].showTree;
    updatePane(index);
    if (value) loadPane(index);
    localStorage.setItem(
      LS_PANES,
      JSON.stringify(state.panes.map((pane) => pane.libId || null))
    );
  });

  panesEl.addEventListener("input", (event) => {
    const search = event.target.closest(".pane-search");
    if (!search) return;
    const index = Number(search.closest(".pane").dataset.index);
    const pane = state.panes[index];
    pane.q = search.value.trim();
    pane.selected.clear();
    clearTimeout(searchTimers.get(index));
    searchTimers.set(
      index,
      setTimeout(() => {
        loadPane(index, { folders: false, reset: true });
      }, 280)
    );
  });

  // 右键文件夹
  panesEl.addEventListener("contextmenu", (event) => {
    const folderRow = event.target.closest(".folder-row");
    if (!folderRow) return;
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
      ]);
      return;
    }
    showMenu(event.clientX, event.clientY, [
      { label: "新建子文件夹", action: () => openFolderCreate(pane.libId, path) },
      { label: "重命名", action: () => openFolderRename(pane.libId, path, name) },
      { label: "删除文件夹", danger: true, action: () => openFolderDelete(pane.libId, path, name, total) },
    ]);
  });

  // ---------- 拖拽 ----------
  const clearDragOver = () => {
    panesEl.querySelectorAll(".folder-row.drag-over").forEach((row) => row.classList.remove("drag-over"));
  };

  panesEl.addEventListener("dragstart", (event) => {
    const row = event.target.closest(".bm");
    if (!row) return;
    state.dragged = {
      id: Number(row.dataset.id),
      library: Number(row.dataset.library),
      folder: row.dataset.folder,
      title: row.dataset.title || "",
    };
    try {
      event.dataTransfer.setData("text/plain", String(state.dragged.id));
      event.dataTransfer.effectAllowed = "move";
    } catch (err) {
      /* ignore */
    }
    row.classList.add("dragging");
    document.body.classList.add("dragging");
  });

  panesEl.addEventListener("dragend", () => {
    state.dragged = null;
    panesEl.querySelectorAll(".bm.dragging").forEach((row) => row.classList.remove("dragging"));
    document.body.classList.remove("dragging");
    clearDragOver();
  });

  panesEl.addEventListener("dragover", (event) => {
    if (!state.dragged) return;
    const target = event.target.closest('.folder-row[data-drop="1"]');
    if (!target) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (!target.classList.contains("drag-over")) {
      clearDragOver();
      target.classList.add("drag-over");
      target.scrollIntoView({ block: "nearest" });
    }
  });

  panesEl.addEventListener("dragleave", (event) => {
    const target = event.target.closest(".folder-row");
    if (!target) return;
    const related = event.relatedTarget;
    if (related && target.contains(related)) return;
    target.classList.remove("drag-over");
  });

  panesEl.addEventListener("drop", async (event) => {
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

    if (libraryId === dragged.library && folder === dragged.folder) {
      toast("书签已经在目标位置");
      return;
    }
    await moveBookmark(dragged.id, libraryId, folder, dragged.library);
  });

  const moveBookmark = async (id, libraryId, folder, fromLibraryId) => {
    try {
      await api(`/api/bookmarks/${id}/move`, {
        method: "POST",
        body: JSON.stringify({ library_id: libraryId, folder }),
      });
      const lib = libraryById(libraryId);
      toast(`已移动到「${lib ? lib.name : "收藏夹"} · ${shortFolder(folder)}」`);
      await reloadLibraries();
      await refreshLibrary(libraryId);
      if (fromLibraryId !== libraryId) await refreshLibrary(fromLibraryId);
      updateStats();
    } catch (err) {
      toast(err.message, true);
      await refreshLibrary(fromLibraryId);
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
    if (editorModal.hidden && confirmModal.hidden && folderModal.hidden && folderDeleteModal.hidden && tagModal.hidden && networkModal.hidden && exclusionsModal.hidden) {
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
    for (let i = 0; i < state.layout; i += 1) {
      state.panes[i].selected.clear();
      loadPane(i, { folders: false, reset: true });
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
      closeModal(editorModal);
      closeModal(confirmModal);
      closeModal(folderModal);
      closeModal(folderDeleteModal);
      closeModal(tagModal);
      closeModal(networkModal);
      closeModal(exclusionsModal);
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

      renderPanes();
      state.ready = true;
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

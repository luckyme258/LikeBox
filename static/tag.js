/* LikeBox 标签聚合页 */
(() => {
  const body = document.body;
  const tag = body.dataset.tag || "";
  const groupsEl = document.getElementById("tagGroups");
  const summaryEl = document.getElementById("tagSummary");
  const sortGroup = document.getElementById("sortGroup");
  const filterGroup = document.getElementById("filterGroup");
  const themeBtn = document.getElementById("tagTheme");

  let sort = "recent";
  let filter = "all";

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const initialOf = (text) => (String(text || "").replace(/^www\./i, "")[0] || "?").toUpperCase();

  const safeUrl = (url) => {
    const raw = String(url || "").trim();
    return /^(https?:|file:|mailto:|ftp:)/i.test(raw) ? raw : "https://" + raw;
  };

  const applyTheme = (theme) => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("likebox-theme", theme);
    themeBtn.textContent = theme === "dark" ? "☀" : "☾";
  };

  const initTheme = () => {
    const saved = localStorage.getItem("likebox-theme");
    const preferred = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    applyTheme(saved || preferred);
  };

  themeBtn.addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });

  const relativeTime = (seconds) => {
    if (!seconds) return "";
    const diff = Math.max(0, Date.now() / 1000 - seconds);
    if (diff < 120) return "刚刚";
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
    if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`;
    const date = new Date(seconds * 1000);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };

  const browserClass = (browser) =>
    browser === "Edge" ? "edge" : browser === "Firefox" ? "firefox" : browser === "Chrome" ? "chrome" : "other";

  const recordOpen = (id) => {
    const url = `/api/bookmarks/${id}/open`;
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(url)) return;
    } catch (err) {
      /* ignore */
    }
    fetch(url, { method: "POST", keepalive: true }).catch(() => {});
  };

  const itemHtml = (item) => {
    const favicon = item.icon
      ? `<img src="${escapeHtml(item.icon)}" alt="" loading="lazy" onerror="this.remove()">`
      : escapeHtml(initialOf(item.title));
    const stats = [
      `<span class="${item.use_count ? "hot" : ""}">总 ${item.use_count || 0}</span>`,
      `<span>周 ${item.week_count || 0}</span>`,
      `<span>24h ${item.day_count || 0}</span>`,
    ].join("");
    const last = item.last_open ? ` · 最近 ${relativeTime(item.last_open)}` : "";
    return `
      <a class="tag-item" href="${escapeHtml(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer"
         data-id="${item.id}" title="${escapeHtml(item.url)}">
        <span class="favicon">${favicon}</span>
        <span class="item-text">
          <span class="item-title">${escapeHtml(item.title)}</span>
          <span class="item-meta">${escapeHtml(item.host || "")}${last}</span>
        </span>
        <span class="tag-stats">${stats}</span>
      </a>`;
  };

  const subtreeCount = (node) =>
    (node.items ? node.items.length : 0) + (node.children || []).reduce((sum, child) => sum + subtreeCount(child), 0);

  const folderHtml = (node) => {
    const count = subtreeCount(node);
    const depth = node.depth || 0;
    const heading = `
      <div class="tag-folder-head" style="padding-left:${Math.max(0, depth - 1) * 14}px">
        <span class="folder-path">${node.path ? escapeHtml(node.path.replace(/\//g, " / ")) : "未分类"}</span>
        <span class="folder-count">${count}</span>
      </div>`;
    const items = node.items && node.items.length ? `<div class="tag-items">${node.items.map(itemHtml).join("")}</div>` : "";
    const children = (node.children || []).map(folderHtml).join("");
    if (!count && !children) return "";
    return `<div class="tag-folder">${heading}${items}${children}</div>`;
  };

  const groupHtml = (group) => {
    const lib = group.library;
    return `
      <section class="tag-group">
        <div class="tag-group-head">
          <h2>${escapeHtml(lib.name)}</h2>
          <span class="browser-badge ${browserClass(lib.browser)}">${escapeHtml(lib.browser)}</span>
          <span class="group-count">${group.total} 条 · ${group.folder_count} 个文件夹</span>
        </div>
        ${(group.tree || []).map(folderHtml).join("")}
      </section>`;
  };

  const setActive = (container, key, value) => {
    [...container.querySelectorAll("button")].forEach((btn) => {
      btn.classList.toggle("active", btn.dataset[key] === value);
    });
  };

  const load = async () => {
    summaryEl.textContent = "载入中…";
    try {
      const res = await fetch(`/api/tags/${encodeURIComponent(tag)}?sort=${sort}&filter=${filter}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载失败");
      summaryEl.textContent = `${data.total} 条收藏`;
      if (!data.groups || !data.groups.length) {
        groupsEl.innerHTML = `<div class="tag-empty">这个筛选条件下没有收藏。<br>可以换个统计维度，或回到 LikeBox 给收藏夹 / 收藏打上 #${escapeHtml(tag)} 标签。</div>`;
      } else {
        groupsEl.innerHTML = data.groups.map(groupHtml).join("");
      }
    } catch (err) {
      summaryEl.textContent = "";
      groupsEl.innerHTML = `<div class="tag-empty">${escapeHtml(err.message)}</div>`;
    }
  };

  sortGroup.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-sort]");
    if (!btn) return;
    sort = btn.dataset.sort;
    setActive(sortGroup, "sort", sort);
    load();
  });

  filterGroup.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-filter]");
    if (!btn) return;
    filter = btn.dataset.filter;
    setActive(filterGroup, "filter", filter);
    load();
  });

  groupsEl.addEventListener("click", (event) => {
    const link = event.target.closest(".tag-item");
    if (link) recordOpen(link.dataset.id);
  });

  const init = () => {
    initTheme();
    setActive(sortGroup, "sort", sort);
    setActive(filterGroup, "filter", filter);
    load();
  };

  init();
})();

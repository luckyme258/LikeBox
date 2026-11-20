/* LikeBox 标签聚合页 */
(() => {
  const body = document.body;
  const tag = body.dataset.tag || "";
  const groupsEl = document.getElementById("tagGroups");
  const summaryEl = document.getElementById("tagSummary");
  const sortGroup = document.getElementById("sortGroup");
  const filterGroup = document.getElementById("filterGroup");
  const themeBtn = document.getElementById("tagTheme");

  const tagEditModal = document.getElementById("tagEditModal");
  const tagEditForm = document.getElementById("tagEditForm");
  const tagEditName = document.getElementById("tagEditName");
  const tagEditInput = document.getElementById("tagEditInput");
  const btnTagEditSave = document.getElementById("btnTagEditSave");

  const tagNoteModal = document.getElementById("tagNoteModal");
  const tagNoteForm = document.getElementById("tagNoteForm");
  const tagNoteName = document.getElementById("tagNoteName");
  const tagNoteInput = document.getElementById("tagNoteInput");
  const btnTagNoteSave = document.getElementById("btnTagNoteSave");

  let sort = "recent";
  let filter = "all";
  let currentItems = new Map();
  let activeItem = null;

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

  const openModal = (modal) => {
    modal.hidden = false;
    body.style.overflow = "hidden";
  };

  const closeModal = (modal) => {
    if (modal.hidden) return;
    modal.hidden = true;
    if (tagEditModal.hidden && tagNoteModal.hidden) body.style.overflow = "";
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
    const note = item.note
      ? `<span class="item-note" title="${escapeHtml(item.note)}">${escapeHtml(item.note)}</span>`
      : "";
    return `
      <article class="tag-item" data-id="${item.id}">
        <a class="tag-item-hit" href="${escapeHtml(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer"
           data-id="${item.id}" title="${escapeHtml(item.url)}">
          <span class="favicon">${favicon}</span>
          <span class="item-text">
            <span class="item-title">${escapeHtml(item.title)}</span>
            <span class="item-meta">${escapeHtml(item.host || "")}${last}</span>
            ${note}
          </span>
          <span class="tag-stats">${stats}</span>
        </a>
        <div class="tag-item-actions">
          <button class="icon-btn tag" type="button" data-act="tag" title="编辑标签">#</button>
          <button class="icon-btn note" type="button" data-act="note" title="编辑备注">🗒</button>
          <button class="icon-btn del" type="button" data-act="delete" title="删除">🗑</button>
        </div>
      </article>`;
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

  const collectItems = (node, map) => {
    (node.items || []).forEach((item) => map.set(item.id, item));
    (node.children || []).forEach((child) => collectItems(child, map));
  };

  const openTagEdit = (item) => {
    activeItem = item;
    tagEditName.textContent = item.title;
    tagEditInput.value = (item.tags || []).map((value) => `#${value}`).join(" ");
    openModal(tagEditModal);
    setTimeout(() => {
      tagEditInput.focus();
      tagEditInput.select();
    }, 50);
  };

  const openNote = (item) => {
    activeItem = item;
    tagNoteName.textContent = item.title;
    tagNoteInput.value = item.note || "";
    openModal(tagNoteModal);
    setTimeout(() => tagNoteInput.focus(), 50);
  };

  const saveBookmark = async (payload) => {
    const res = await fetch(`/api/bookmarks/${activeItem.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "保存失败");
    return data;
  };

  tagEditForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!activeItem) return;
    btnTagEditSave.disabled = true;
    try {
      await saveBookmark({
        library_id: activeItem.library_id,
        url: activeItem.url,
        title: activeItem.title,
        folder: activeItem.folder,
        tags: tagEditInput.value,
      });
      closeModal(tagEditModal);
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      btnTagEditSave.disabled = false;
    }
  });

  tagNoteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!activeItem) return;
    btnTagNoteSave.disabled = true;
    try {
      await saveBookmark({ note: tagNoteInput.value });
      closeModal(tagNoteModal);
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      btnTagNoteSave.disabled = false;
    }
  });

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
      currentItems = new Map();
      (data.groups || []).forEach((group) => (group.tree || []).forEach((node) => collectItems(node, currentItems)));
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

  groupsEl.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-act]");
    if (action) {
      const row = action.closest(".tag-item");
      const item = row ? currentItems.get(Number(row.dataset.id)) : null;
      if (!item) return;
      event.preventDefault();
      event.stopPropagation();
      if (action.dataset.act === "tag") openTagEdit(item);
      else if (action.dataset.act === "note") openNote(item);
      else if (action.dataset.act === "delete") {
        if (!window.confirm("删除这条收藏？")) return;
        try {
          const res = await fetch(`/api/bookmarks/${item.id}`, { method: "DELETE" });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "删除失败");
          await load();
        } catch (err) {
          alert(err.message);
        }
      }
      return;
    }

    const link = event.target.closest(".tag-item-hit");
    if (link) recordOpen(link.dataset.id);
  });

  document.querySelectorAll("[data-close]").forEach((el) => {
    el.addEventListener("click", () => closeModal(el.closest(".modal")));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeModal(tagEditModal);
    closeModal(tagNoteModal);
  });

  const init = () => {
    initTheme();
    setActive(sortGroup, "sort", sort);
    setActive(filterGroup, "filter", filter);
    load();
  };

  init();
})();

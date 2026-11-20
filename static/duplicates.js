/* LikeBox 重复链接检查页 */
(() => {
  const library = Number(document.body.dataset.library);
  const summaryEl = document.getElementById("dupSummary");
  const listEl = document.getElementById("dupList");
  const noticeEl = document.getElementById("dupNotice");
  const deleteBtn = document.getElementById("dupDelete");
  const keepOldestBtn = document.getElementById("dupKeepOldest");
  const clearBtn = document.getElementById("dupClear");
  const refreshBtn = document.getElementById("dupRefresh");
  const themeBtn = document.getElementById("dupTheme");

  const confirmModal = document.getElementById("dupConfirmModal");
  const confirmCount = document.getElementById("dupConfirmCount");
  const confirmDelete = document.getElementById("dupConfirmDelete");

  let groups = [];
  let selected = new Set();
  let busy = false;
  let error = "";

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const dateText = (seconds) => {
    if (!seconds) return "时间未知";
    const date = new Date(seconds * 1000);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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

  const setNotice = (message, error = false) => {
    noticeEl.hidden = !message;
    noticeEl.textContent = message || "";
    noticeEl.classList.toggle("error", !!error);
  };

  const updateUi = () => {
    const totalItems = groups.reduce((sum, group) => sum + group.items.length, 0);
    if (error) {
      summaryEl.textContent = "检查失败";
    } else if (busy && !groups.length) {
      summaryEl.textContent = "正在检查…";
    } else if (groups.length) {
      summaryEl.textContent = `${groups.length} 组 · 共 ${totalItems} 条重复记录 · 已选 ${selected.size} 条待删除`;
    } else {
      summaryEl.textContent = "没有发现重复链接";
    }
    refreshBtn.disabled = busy;
    keepOldestBtn.disabled = busy || groups.length === 0;
    clearBtn.disabled = busy || selected.size === 0;
    deleteBtn.disabled = busy || !!error || selected.size === 0;
  };

  const render = () => {
    if (!groups.length) {
      listEl.innerHTML = `<div class="dup-empty">当前收藏夹里没有 URL 相同的重复链接。</div>`;
      updateUi();
      return;
    }
    listEl.innerHTML = groups
      .map((group, groupIndex) => {
        const items = group.items
          .map((item, itemIndex) => {
            const checked = selected.has(item.id);
            const folder = item.folder ? item.folder.replace(/\//g, " / ") : "未分类";
            return `<label class="dup-item ${checked ? "selected" : ""}">
              <input class="dup-check" type="checkbox" data-id="${item.id}" data-group="${groupIndex}" ${checked ? "checked" : ""}>
              <span class="dup-item-main">
                <span class="dup-item-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
                <span class="dup-item-meta">${escapeHtml(folder)} · ${dateText(item.add_date)}</span>
              </span>
              ${itemIndex === 0 ? `<span class="dup-chip">最早</span>` : ""}
            </label>`;
          })
          .join("");
        return `<div class="dup-group">
          <div class="dup-group-head">
            <span class="dup-url" title="${escapeHtml(group.url)}">${escapeHtml(group.url)}</span>
            <span class="dup-count">${group.items.length} 条</span>
          </div>
          <div class="dup-items">${items}</div>
        </div>`;
      })
      .join("");
    updateUi();
  };

  const selectCopies = () => {
    selected = new Set();
    groups.forEach((group) => {
      group.items.slice(1).forEach((item) => selected.add(item.id));
    });
  };

  const openConfirm = () => {
    if (!selected.size) return;
    confirmCount.textContent = `${selected.size} 条重复链接`;
    confirmModal.hidden = false;
    document.body.style.overflow = "hidden";
  };

  const closeConfirm = () => {
    confirmModal.hidden = true;
    document.body.style.overflow = "";
  };

  const load = async () => {
    busy = true;
    error = "";
    groups = [];
    selected = new Set();
    setNotice("");
    listEl.innerHTML = `<div class="dup-empty">正在扫描当前收藏夹…</div>`;
    updateUi();
    try {
      const res = await fetch(`/api/bookmarks/duplicates?library=${library}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "检查失败");
      groups = data.groups || [];
      selectCopies();
      render();
    } catch (err) {
      error = err.message;
      groups = [];
      selected = new Set();
      listEl.innerHTML = `<div class="dup-empty">${escapeHtml(err.message)}</div>`;
    } finally {
      busy = false;
      updateUi();
    }
  };

  themeBtn.addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });

  refreshBtn.addEventListener("click", load);

  keepOldestBtn.addEventListener("click", () => {
    selectCopies();
    render();
  });

  clearBtn.addEventListener("click", () => {
    selected = new Set();
    render();
  });

  listEl.addEventListener("change", (event) => {
    const checkbox = event.target.closest(".dup-check");
    if (!checkbox) return;
    const id = Number(checkbox.dataset.id);
    const group = groups[Number(checkbox.dataset.group)];
    if (!group) return;
    if (checkbox.checked && group.items.every((item) => item.id === id || selected.has(item.id))) {
      checkbox.checked = false;
      setNotice("每组至少保留一条链接", true);
      return;
    }
    if (checkbox.checked) selected.add(id);
    else selected.delete(id);
    checkbox.closest(".dup-item").classList.toggle("selected", checkbox.checked);
    setNotice("");
    updateUi();
  });

  deleteBtn.addEventListener("click", () => {
    if (!selected.size) {
      setNotice("请先勾选要删除的重复链接", true);
      return;
    }
    openConfirm();
  });

  confirmDelete.addEventListener("click", async () => {
    if (!selected.size || confirmDelete.disabled) return;
    confirmDelete.disabled = true;
    const ids = [...selected];
    try {
      const res = await fetch("/api/bookmarks/batch-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "删除失败");
      closeConfirm();
      await load();
      setNotice(`已删除 ${data.deleted || ids.length} 条重复链接`);
    } catch (err) {
      closeConfirm();
      setNotice(err.message, true);
    } finally {
      confirmDelete.disabled = false;
    }
  });

  confirmModal.querySelectorAll("[data-close]").forEach((el) => {
    el.addEventListener("click", closeConfirm);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !confirmModal.hidden) {
      closeConfirm();
      return;
    }
    if (event.key === "Enter" && !confirmModal.hidden) {
      event.preventDefault();
      confirmDelete.click();
    }
  });

  initTheme();
  load();
})();

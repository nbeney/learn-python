// file-manager.js — manage the Python files stored by the editor.
// Files live in IndexedDB via window.FileStore (assets/file-store.js); this
// module reads/writes through that async API so changes show up in the editor
// (and vice-versa, via FileStore's cross-tab change notifications).
//
// Phase 1 operates on the "scripts" area only and presents bare file names
// (e.g. "main.py"); FileStore keys scripts as "scripts/<name>".
//
// Depends on assets/minizip.js (window.MiniZip) for ZIP import/export.

(function () {
  "use strict";

  var SCRIPTS_AREA = "scripts";
  var toKey = function (name) { return SCRIPTS_AREA + "/" + name; };
  var toName = function (path) {
    return path.indexOf("/") === -1 ? path : path.slice(path.indexOf("/") + 1);
  };

  // ---------- In-memory cache (name -> code), hydrated from FileStore ----------
  var files = {};
  var activeName = null;      // bare name of the file open in the editor

  function hydrate() {
    return FileStore.list(SCRIPTS_AREA).then(function (metas) {
      return Promise.all(metas.map(function (m) {
        return FileStore.read(m.path).then(function (rec) {
          return { name: toName(m.path), content: typeof rec.content === "string" ? rec.content : "" };
        });
      }));
    }).then(function (entries) {
      var next = {};
      entries.forEach(function (e) { next[e.name] = e.content; });
      files = next;
      return FileStore.getActive();
    }).then(function (activePath) {
      activeName = toName(activePath);
    });
  }

  // ---------- Name helpers (mirror the editor) ----------
  function normaliseName(input) {
    var name = (input || "").trim();
    if (!name) return "";
    if (!/\.py$/i.test(name)) name += ".py";
    return name;
  }
  function uniqueName(base) {
    if (files[base] === undefined) return base;
    var stem = base.replace(/\.py$/i, "");
    var n = 2;
    while (files[stem + n + ".py"] !== undefined) n++;
    return stem + n + ".py";
  }

  // ---------- Small utilities ----------
  function sortedNames() {
    return Object.keys(files).sort(function (a, b) { return a.localeCompare(b); });
  }
  function byteLen(s) { return new Blob([s]).size; }
  function humanSize(n) {
    if (n < 1024) return n + " B";
    return (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB";
  }
  function lineCount(s) { return s ? s.split("\n").length : 0; }
  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  // Show a transient message. Pass { error: true } for a red (warning) toast.
  function toast(msg, opts) {
    var el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.toggle("error", !!(opts && opts.error));
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove("show"); }, 2200);
  }

  // Trigger a browser download of a Blob.
  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // ---------- Selection state ----------
  var selected = new Set();   // file names that are ticked

  // ---------- Rendering ----------
  var listEl = document.getElementById("list");
  var selbarEl = document.getElementById("selbar");
  var searchEl = document.getElementById("searchInput");
  var exportBtn = document.getElementById("exportBtn");
  var deleteBtn = document.getElementById("deleteBtn");

  function currentQuery() { return (searchEl.value || "").trim(); }

  function firstMatchLine(code, q) {
    var lines = code.split("\n");
    var low = q.toLowerCase();
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().indexOf(low) !== -1) {
        return { n: i + 1, text: lines[i] };
      }
    }
    return null;
  }

  function highlight(text, q) {
    if (!q) return escapeHtml(text);
    var safeText = escapeHtml(text);
    var safeQuery = escapeHtml(q);
    var re = new RegExp(escapeRegExp(safeQuery), "ig");
    return safeText.replace(re, function (m) { return "<mark>" + m + "</mark>"; });
  }

  // Re-hydrate from the store, then paint. All callers that mutate the store
  // call render() afterwards so the view reflects the authoritative state.
  function render() {
    return hydrate().then(paint);
  }

  function paint() {
    var q = currentQuery();
    var names = sortedNames();
    var current = activeName;

    var shown = names.filter(function (name) {
      if (!q) return true;
      var low = q.toLowerCase();
      return name.toLowerCase().indexOf(low) !== -1 ||
             String(files[name]).toLowerCase().indexOf(low) !== -1;
    });

    // Drop stale selections (files that no longer exist).
    selected.forEach(function (n) { if (files[n] === undefined) selected.delete(n); });

    listEl.innerHTML = "";

    var head = document.createElement("div");
    head.className = "row head";
    var allShownSelected = shown.length > 0 && shown.every(function (n) { return selected.has(n); });
    head.innerHTML =
      '<input type="checkbox" id="selAll" ' + (allShownSelected ? "checked" : "") +
      ' title="Select all shown" aria-label="Select all shown" />' +
      '<span class="fname">Name</span>' +
      '<span class="meta">Size · Lines</span>' +
      '<span class="rowbtns" style="width:8.5rem"></span>';
    listEl.appendChild(head);
    head.querySelector("#selAll").addEventListener("change", function (e) {
      if (e.target.checked) shown.forEach(function (n) { selected.add(n); });
      else shown.forEach(function (n) { selected.delete(n); });
      paint();
    });

    if (!shown.length) {
      var empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = q ? "No files match “" + q + "”." : "No files yet.";
      listEl.appendChild(empty);
      updateSelbar();
      return;
    }

    shown.forEach(function (name) {
      var code = String(files[name]);
      var row = document.createElement("div");
      row.className = "row" + (name === current ? " current" : "");

      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selected.has(name);
      cb.setAttribute("aria-label", "Select " + name);
      cb.addEventListener("change", function () {
        cb.checked ? selected.add(name) : selected.delete(name);
        updateSelbar();
        syncSelAll();
      });

      var fname = document.createElement("span");
      fname.className = "fname";
      var nameLink = document.createElement("a");
      nameLink.className = "namelink";
      nameLink.href = "editor.html";
      nameLink.title = "Open " + name + " in the editor";
      nameLink.innerHTML = highlight(name, q);
      nameLink.addEventListener("click", function (e) {
        e.preventDefault();
        openInEditor(name);
      });
      fname.appendChild(nameLink);
      if (name === current) {
        var badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = "in editor";
        fname.appendChild(badge);
      }

      var meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = humanSize(byteLen(code)) + " · " + lineCount(code);

      var btns = document.createElement("span");
      btns.className = "rowbtns";
      btns.appendChild(iconBtn("📝", "Open in editor", function () { openInEditor(name); }));
      btns.appendChild(iconBtn("📄", "Make a copy", function () { copyFile(name); }));
      btns.appendChild(iconBtn("✏️", "Rename", function () { renameFile(name); }));
      btns.appendChild(iconBtn("⬇️", "Download .py", function () { downloadOne(name); }));
      btns.appendChild(iconBtn("🗑️", "Delete", function () { deleteFile(name); }));

      row.appendChild(cb);
      row.appendChild(fname);
      row.appendChild(meta);
      row.appendChild(btns);
      listEl.appendChild(row);

      if (q) {
        var hit = firstMatchLine(code, q);
        if (hit) {
          var pre = document.createElement("div");
          pre.className = "matchline";
          pre.innerHTML = "L" + hit.n + ": " + highlight(hit.text.slice(0, 160), q);
          listEl.appendChild(pre);
        }
      }
    });

    updateSelbar();
  }

  function iconBtn(label, title, onClick) {
    var b = document.createElement("button");
    b.className = "iconbtn";
    b.type = "button";
    b.textContent = label;
    b.title = title;
    b.setAttribute("aria-label", title);
    b.addEventListener("click", onClick);
    return b;
  }

  function syncSelAll() {
    var q = currentQuery();
    var shown = sortedNames().filter(function (name) {
      if (!q) return true;
      var low = q.toLowerCase();
      return name.toLowerCase().indexOf(low) !== -1 ||
             String(files[name]).toLowerCase().indexOf(low) !== -1;
    });
    var selAll = document.getElementById("selAll");
    if (selAll) selAll.checked = shown.length > 0 && shown.every(function (n) { return selected.has(n); });
  }

  function updateSelbar() {
    var total = Object.keys(files).length;
    var n = selected.size;
    selbarEl.textContent = total + " file" + (total === 1 ? "" : "s") +
      (n ? " · " + n + " selected" : "");
    var disabled = n === 0;
    exportBtn.disabled = disabled;
    deleteBtn.disabled = disabled;
  }

  // On a failed store operation, surface the error and leave state as-is.
  function storeError(e, what) {
    toast((what || "That didn't work") + ": " + (e && e.message || e), { error: true });
  }

  // ---------- Actions ----------
  function newFile() {
    var input = prompt("New file name:", uniqueName("untitled.py"));
    if (input === null) return;
    var name = normaliseName(input);
    if (!name) return;
    if (files[name] !== undefined) { toast("“" + name + "” already exists.", { error: true }); return; }
    FileStore.write(toKey(name), "# " + name + "\n\n", { area: SCRIPTS_AREA })
      .then(render).then(function () { toast("Created " + name); })
      .catch(function (e) { storeError(e, "Couldn't create the file"); });
  }

  function renameFile(name) {
    var input = prompt('Rename "' + name + '" to:', name);
    if (input === null) return;
    var next = normaliseName(input);
    if (!next || next === name) return;
    var overwrite = files[next] !== undefined;
    if (overwrite && !confirm('"' + next + '" exists. Overwrite it?')) return;
    var op = overwrite
      ? FileStore.write(toKey(next), files[name], { area: SCRIPTS_AREA })
          .then(function () { return FileStore.remove(toKey(name)); })
      : FileStore.rename(toKey(name), toKey(next));
    op.then(function () {
      if (selected.has(name)) { selected.delete(name); selected.add(next); }
      return render();
    }).then(function () { toast("Renamed to " + next); })
      .catch(function (e) { storeError(e, "Couldn't rename the file"); });
  }

  function copyFile(name) {
    var suggested = uniqueName("copy-of-" + name);
    var input = prompt('Copy "' + name + '" to:', suggested);
    if (input === null) return;
    var next = normaliseName(input);
    if (!next) return;
    var overwrite = files[next] !== undefined;
    if (overwrite && !confirm('"' + next + '" exists. Overwrite it?')) return;
    // Overwrite path uses write; otherwise copy (which rejects on conflict).
    var op = overwrite
      ? FileStore.write(toKey(next), files[name], { area: SCRIPTS_AREA })
      : FileStore.copy(toKey(name), toKey(next));
    op.then(render).then(function () { toast("Copied to " + next); })
      .catch(function (e) { storeError(e, "Couldn't copy the file"); });
  }

  function deleteFile(name) {
    if (!confirm('Delete "' + name + '"? This cannot be undone.')) return;
    FileStore.remove(toKey(name)).then(function () {
      selected.delete(name);
      return render();
    }).then(function () { toast("Deleted " + name); })
      .catch(function (e) { storeError(e, "Couldn't delete the file"); });
  }

  function deleteSelected() {
    if (!selected.size) return;   // button is disabled when nothing is selected
    var names = Array.from(selected);
    if (!confirm("Delete " + names.length + " selected file" +
        (names.length === 1 ? "" : "s") + "? This cannot be undone.")) return;
    // Remove sequentially so the store's re-seed logic stays consistent.
    var chain = Promise.resolve();
    names.forEach(function (n) {
      chain = chain.then(function () { return FileStore.remove(toKey(n)); });
    });
    chain.then(function () {
      names.forEach(function (n) { selected.delete(n); });
      return render();
    }).then(function () {
      toast("Deleted " + names.length + " file" + (names.length === 1 ? "" : "s"));
    }).catch(function (e) { storeError(e, "Couldn't delete the files"); });
  }

  function openInEditor(name) {
    FileStore.setActive(toKey(name)).then(function () {
      window.open("editor.html", "_blank");
      toast("Opening " + name + " in the editor…");
    }).catch(function (e) { storeError(e, "Couldn't open the file"); });
  }

  function downloadOne(name) {
    download(new Blob([files[name]], { type: "text/x-python" }), name);
  }

  // ---------- Export ----------
  function exportSelected() {
    if (!selected.size) return;   // button is disabled when nothing is selected
    var names = Array.from(selected);
    var subset = {};
    names.forEach(function (n) { subset[n] = files[n]; });
    try {
      var bytes = MiniZip.zip(subset);
      var stamp = new Date().toISOString().slice(0, 10);
      download(new Blob([bytes], { type: "application/zip" }),
        "python-files-" + stamp + ".zip");
      toast("Exported " + names.length + " file" + (names.length === 1 ? "" : "s"));
    } catch (e) {
      toast("Export failed: " + (e && e.message || e), { error: true });
    }
  }

  // ---------- Import ----------
  var zipInput = document.getElementById("zipInput");
  function importZip() { zipInput.value = ""; zipInput.click(); }
  zipInput.addEventListener("change", function () {
    var file = zipInput.files && zipInput.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      Promise.resolve()
        .then(function () { return MiniZip.unzip(new Uint8Array(reader.result)); })
        .then(function (incoming) { return mergeImported(incoming); })
        .catch(function (e) { toast("Import failed: " + (e && e.message || e), { error: true }); });
    };
    reader.readAsArrayBuffer(file);
  });

  // Merge imported files; prompt once if any would overwrite existing ones.
  function mergeImported(incoming) {
    var incomingNames = Object.keys(incoming);
    if (!incomingNames.length) { toast("The archive had no files.", { error: true }); return; }

    // Ensure a .py name and drop any folder path. unzip entries may be plain
    // strings (older format) or { kind, text } (newer); take the text.
    var normalised = {};
    incomingNames.forEach(function (n) {
      var base = n.split("/").pop();
      var entry = incoming[n];
      var text = (entry && typeof entry === "object") ? (entry.text || "") : String(entry);
      normalised[normaliseName(base)] = text;
    });

    var clashes = Object.keys(normalised).filter(function (n) { return files[n] !== undefined; });
    if (clashes.length) {
      var msg = clashes.length + " file" + (clashes.length === 1 ? "" : "s") +
        " already exist:\n\n" + clashes.slice(0, 12).join("\n") +
        (clashes.length > 12 ? "\n…" : "") +
        "\n\nOK = overwrite them, Cancel = keep both (imported copies renamed).";
      var overwrite = confirm(msg);
      if (!overwrite) {
        var renamed = {};
        Object.keys(normalised).forEach(function (n) {
          var target = files[n] !== undefined ? uniqueName(n) : n;
          renamed[target] = normalised[n];
        });
        normalised = renamed;
      }
    }

    var names = Object.keys(normalised);
    var chain = Promise.resolve();
    names.forEach(function (n) {
      chain = chain.then(function () {
        return FileStore.write(toKey(n), normalised[n], { area: SCRIPTS_AREA });
      });
    });
    return chain.then(render).then(function () {
      toast("Imported " + names.length + " file" + (names.length === 1 ? "" : "s"));
    });
  }

  // ---------- Fallback banner ----------
  function warnIfNotPersistent() {
    if (!FileStore.isPersistent()) {
      toast("Files can't be saved in this session.", { error: true });
    }
  }

  // ---------- Wire up ----------
  document.getElementById("newBtn").addEventListener("click", newFile);
  document.getElementById("importBtn").addEventListener("click", importZip);
  document.getElementById("exportBtn").addEventListener("click", exportSelected);
  document.getElementById("deleteBtn").addEventListener("click", deleteSelected);

  searchEl.addEventListener("input", paint);
  document.getElementById("searchClear").addEventListener("click", function () {
    searchEl.value = ""; paint(); searchEl.focus();
  });

  // Refresh when another tab (e.g. the editor) changes files.
  FileStore.onChange(function () { render(); });

  // Boot: init the store, then do the first render.
  FileStore.init()
    .then(function () { warnIfNotPersistent(); return render(); })
    .catch(function (e) { toast("Storage error: " + (e && e.message || e), { error: true }); });
})();

// file-manager.js — manage the Python files the editor keeps in localStorage.
// Shares the editor's storage schema so changes show up in the editor:
//   editor:files   -> JSON { "name.py": "code", ... }
//   editor:current -> the active file name in the editor
//
// Depends on assets/minizip.js (window.MiniZip) for ZIP import/export.

(function () {
  "use strict";

  var FILES_KEY = "editor:files";
  var CURRENT_KEY = "editor:current";
  var DEFAULT_NAME = "main.py";
  var STARTER = "# New file\n\n";

  // ---------- Storage ----------
  function loadFiles() {
    try {
      var raw = JSON.parse(localStorage.getItem(FILES_KEY));
      if (raw && typeof raw === "object" && Object.keys(raw).length) return raw;
    } catch (_) { /* fall through */ }
    return { [DEFAULT_NAME]: STARTER };
  }
  function saveFiles(f) { localStorage.setItem(FILES_KEY, JSON.stringify(f)); }
  function getCurrent() {
    var n = localStorage.getItem(CURRENT_KEY);
    return n && files[n] !== undefined ? n : Object.keys(files)[0];
  }
  function setCurrent(n) { localStorage.setItem(CURRENT_KEY, n); }

  var files = loadFiles();
  saveFiles(files);                 // persist defaults on first visit

  // ---------- Name helpers (mirrors the editor) ----------
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

  // Return the first matching line (for the content preview under a row).
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

  // Escape the text first, then wrap matches of the (escaped) query in <mark>.
  // Escaping the query the same way keeps the match aligned with the escaped
  // haystack (e.g. a query containing & or <).
  function highlight(text, q) {
    if (!q) return escapeHtml(text);
    var safeText = escapeHtml(text);
    var safeQuery = escapeHtml(q);
    var re = new RegExp(escapeRegExp(safeQuery), "ig");
    return safeText.replace(re, function (m) { return "<mark>" + m + "</mark>"; });
  }

  function render() {
    var q = currentQuery();
    var names = sortedNames();
    var current = getCurrent();

    // Filter by query (name OR contents).
    var shown = names.filter(function (name) {
      if (!q) return true;
      var low = q.toLowerCase();
      return name.toLowerCase().indexOf(low) !== -1 ||
             String(files[name]).toLowerCase().indexOf(low) !== -1;
    });

    // Drop stale selections (files that no longer exist).
    selected.forEach(function (n) { if (files[n] === undefined) selected.delete(n); });

    listEl.innerHTML = "";

    // Header row with a "select all (shown)" checkbox.
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
      render();
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

      // Content match preview, if the query matched inside the file.
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
    // Selection-dependent actions are disabled until something is ticked.
    var disabled = n === 0;
    exportBtn.disabled = disabled;
    deleteBtn.disabled = disabled;
  }

  // ---------- Actions ----------
  function newFile() {
    var input = prompt("New file name:", uniqueName("untitled.py"));
    if (input === null) return;
    var name = normaliseName(input);
    if (!name) return;
    if (files[name] !== undefined) { toast("“" + name + "” already exists."); return; }
    files[name] = "# " + name + "\n\n";
    saveFiles(files);
    render();
    toast("Created " + name);
  }

  function renameFile(name) {
    var input = prompt('Rename "' + name + '" to:', name);
    if (input === null) return;
    var next = normaliseName(input);
    if (!next || next === name) return;
    if (files[next] !== undefined && !confirm('"' + next + '" exists. Overwrite it?')) return;
    files[next] = files[name];
    delete files[name];
    saveFiles(files);
    if (getCurrent() === name) setCurrent(next);
    if (selected.has(name)) { selected.delete(name); selected.add(next); }
    render();
    toast("Renamed to " + next);
  }

  function copyFile(name) {
    var suggested = uniqueName("copy-of-" + name);
    var input = prompt('Copy "' + name + '" to:', suggested);
    if (input === null) return;
    var next = normaliseName(input);
    if (!next) return;
    if (files[next] !== undefined && !confirm('"' + next + '" exists. Overwrite it?')) return;
    files[next] = files[name];
    saveFiles(files);
    render();
    toast("Copied to " + next);
  }

  function deleteFile(name) {
    if (!confirm('Delete "' + name + '"? This cannot be undone.')) return;
    delete files[name];
    selected.delete(name);
    ensureNotEmpty();
    saveFiles(files);
    fixCurrent();
    render();
    toast("Deleted " + name);
  }

  function deleteSelected() {
    if (!selected.size) return;   // button is disabled when nothing is selected
    var names = Array.from(selected);
    if (!confirm("Delete " + names.length + " selected file" +
        (names.length === 1 ? "" : "s") + "? This cannot be undone.")) return;
    names.forEach(function (n) { delete files[n]; selected.delete(n); });
    ensureNotEmpty();
    saveFiles(files);
    fixCurrent();
    render();
    toast("Deleted " + names.length + " file" + (names.length === 1 ? "" : "s"));
  }

  // Never leave zero files; recreate a default if the store becomes empty.
  function ensureNotEmpty() {
    if (Object.keys(files).length === 0) files[DEFAULT_NAME] = STARTER;
  }
  // If the editor's current file was deleted, point it at an existing one.
  function fixCurrent() {
    var cur = localStorage.getItem(CURRENT_KEY);
    if (!cur || files[cur] === undefined) setCurrent(sortedNames()[0]);
  }

  function openInEditor(name) {
    setCurrent(name);
    window.open("editor.html", "_blank");
    toast("Opening " + name + " in the editor…");
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
      toast("Export failed: " + (e && e.message || e));
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
        .then(function (incoming) { mergeImported(incoming); })
        .catch(function (e) { toast("Import failed: " + (e && e.message || e)); });
    };
    reader.readAsArrayBuffer(file);
  });

  // Merge imported files; prompt once if any would overwrite existing ones.
  function mergeImported(incoming) {
    var incomingNames = Object.keys(incoming);
    if (!incomingNames.length) { toast("The archive had no files."); return; }

    // Only accept .py files; rename others to .py for consistency? Keep as-is
    // but ensure a .py extension so the editor can open them.
    var normalised = {};
    incomingNames.forEach(function (n) {
      var base = n.split("/").pop();          // drop any folder path
      normalised[normaliseName(base)] = incoming[n];
    });

    var clashes = Object.keys(normalised).filter(function (n) { return files[n] !== undefined; });
    if (clashes.length) {
      var msg = clashes.length + " file" + (clashes.length === 1 ? "" : "s") +
        " already exist:\n\n" + clashes.slice(0, 12).join("\n") +
        (clashes.length > 12 ? "\n…" : "") +
        "\n\nOK = overwrite them, Cancel = keep both (imported copies renamed).";
      var overwrite = confirm(msg);
      if (!overwrite) {
        // Rename imported copies to avoid clobbering existing files.
        var renamed = {};
        Object.keys(normalised).forEach(function (n) {
          var target = files[n] !== undefined ? uniqueName(n) : n;
          renamed[target] = normalised[n];
        });
        normalised = renamed;
      }
    }

    Object.keys(normalised).forEach(function (n) { files[n] = normalised[n]; });
    saveFiles(files);
    render();
    toast("Imported " + Object.keys(normalised).length + " file" +
      (Object.keys(normalised).length === 1 ? "" : "s"));
  }

  // ---------- Wire up ----------
  document.getElementById("newBtn").addEventListener("click", newFile);
  document.getElementById("importBtn").addEventListener("click", importZip);
  document.getElementById("exportBtn").addEventListener("click", exportSelected);
  document.getElementById("deleteBtn").addEventListener("click", deleteSelected);

  searchEl.addEventListener("input", render);
  document.getElementById("searchClear").addEventListener("click", function () {
    searchEl.value = ""; render(); searchEl.focus();
  });

  // If another tab (e.g. the editor) changes the files, refresh the list.
  window.addEventListener("storage", function (e) {
    if (e.key === FILES_KEY || e.key === CURRENT_KEY) {
      files = loadFiles();
      render();
    }
  });

  render();
})();

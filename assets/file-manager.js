// file-manager.js — manage the files the editor/runtime keep in IndexedDB
// (via window.FileStore). Presents five areas as tabs: scripts, images,
// sounds, music, data. Scripts/data are text; images/sounds/music are binary
// assets (Blobs) with previews. Depends on assets/minizip.js for ZIP import/
// export (text + binary).

(function () {
  "use strict";

  // ---------- Areas ----------
  var AREAS = ["scripts", "images", "sounds", "music", "data"];
  var TEXT_AREAS = { scripts: true, data: true };   // the rest are binary
  var currentArea = "scripts";

  function isTextArea(area) { return !!TEXT_AREAS[area]; }
  function toKey(area, name) { return area + "/" + name; }
  function toName(path) {
    return path.indexOf("/") === -1 ? path : path.slice(path.indexOf("/") + 1);
  }

  // Default extension / new-file behaviour per area. Scripts keep the .py
  // convention; data defaults to .txt; binary areas are upload-only.
  function defaultExt(area) { return area === "scripts" ? ".py" : (area === "data" ? ".txt" : ""); }

  // ---------- In-memory cache for the CURRENT area ----------
  // entries: { name -> { kind, content } } where content is a string (text)
  // or a Blob (binary). Rebuilt from FileStore on every render.
  var entries = {};
  var activeName = null;      // bare name of the file open in the editor (scripts)

  function hydrate() {
    return FileStore.list(currentArea).then(function (metas) {
      return Promise.all(metas.map(function (m) {
        return FileStore.read(m.path).then(function (rec) {
          return { name: toName(m.path), kind: rec.kind, content: rec.content };
        });
      }));
    }).then(function (list) {
      var next = {};
      list.forEach(function (e) { next[e.name] = { kind: e.kind, content: e.content }; });
      entries = next;
      return FileStore.getActive();
    }).then(function (activePath) {
      activeName = toName(activePath);
    });
  }

  // ---------- Name helpers ----------
  function normaliseName(input, area) {
    var name = (input || "").trim();
    if (!name) return "";
    var ext = defaultExt(area);
    if (ext && !new RegExp("\\" + ext + "$", "i").test(name)) {
      // Only auto-append for scripts; data/binary keep whatever extension the
      // user/file provides, defaulting data to .txt when none is present.
      if (area === "scripts") name += ext;
      else if (area === "data" && name.indexOf(".") === -1) name += ext;
    }
    return name;
  }
  function uniqueName(base) {
    if (entries[base] === undefined) return base;
    var dot = base.lastIndexOf(".");
    var stem = dot === -1 ? base : base.slice(0, dot);
    var ext = dot === -1 ? "" : base.slice(dot);
    var n = 2;
    while (entries[stem + n + ext] !== undefined) n++;
    return stem + n + ext;
  }

  // ---------- Small utilities ----------
  function sortedNames() {
    return Object.keys(entries).sort(function (a, b) { return a.localeCompare(b); });
  }
  function contentSize(e) {
    if (e.kind === "binary" && e.content instanceof Blob) return e.content.size;
    return new Blob([String(e.content)]).size;
  }
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

  function toast(msg, opts) {
    var el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.toggle("error", !!(opts && opts.error));
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove("show"); }, 2200);
  }

  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // ---------- Object URL bookkeeping (revoke on each re-render) ----------
  var liveUrls = [];
  function objectUrl(blob) { var u = URL.createObjectURL(blob); liveUrls.push(u); return u; }
  function revokeUrls() { liveUrls.forEach(function (u) { URL.revokeObjectURL(u); }); liveUrls = []; }

  // ---------- Selection ----------
  var selected = new Set();

  // ---------- DOM refs ----------
  var listEl = document.getElementById("list");
  var selbarEl = document.getElementById("selbar");
  var searchEl = document.getElementById("searchInput");
  var exportBtn = document.getElementById("exportBtn");
  var deleteBtn = document.getElementById("deleteBtn");
  var newBtn = document.getElementById("newBtn");
  var uploadBtn = document.getElementById("uploadBtn");
  var tabsEl = document.getElementById("tabs");

  function currentQuery() { return (searchEl.value || "").trim(); }

  function firstMatchLine(code, q) {
    var lines = code.split("\n");
    var low = q.toLowerCase();
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().indexOf(low) !== -1) return { n: i + 1, text: lines[i] };
    }
    return null;
  }
  function highlight(text, q) {
    if (!q) return escapeHtml(text);
    var re = new RegExp(escapeRegExp(escapeHtml(q)), "ig");
    return escapeHtml(text).replace(re, function (m) { return "<mark>" + m + "</mark>"; });
  }

  // Re-hydrate then paint, and refresh the per-tab counts.
  function render() { return hydrate().then(paint).then(refreshTabCounts); }

  // Update the count pill on every tab from the store (cheap: metadata only).
  function refreshTabCounts() {
    return Promise.all(AREAS.map(function (area) {
      return FileStore.list(area).then(function (metas) { return metas.length; });
    })).then(function (counts) {
      AREAS.forEach(function (area, i) {
        var tab = tabsEl.querySelector('.tab[data-area="' + area + '"]');
        if (!tab) return;
        var badge = tab.querySelector("[data-count]");
        if (badge) badge.textContent = counts[i];
      });
    });
  }

  function paint() {
    revokeUrls();
    var q = currentQuery();
    var names = sortedNames();
    var textArea = isTextArea(currentArea);

    var shown = names.filter(function (name) {
      if (!q) return true;
      var low = q.toLowerCase();
      if (name.toLowerCase().indexOf(low) !== -1) return true;
      // Content search only applies to text areas.
      var e = entries[name];
      return textArea && e.kind === "text" &&
        String(e.content).toLowerCase().indexOf(low) !== -1;
    });

    selected.forEach(function (n) { if (entries[n] === undefined) selected.delete(n); });

    listEl.innerHTML = "";

    var head = document.createElement("div");
    head.className = "row head";
    var allShownSelected = shown.length > 0 && shown.every(function (n) { return selected.has(n); });
    head.innerHTML =
      '<input type="checkbox" id="selAll" ' + (allShownSelected ? "checked" : "") +
      ' title="Select all shown" aria-label="Select all shown" />' +
      '<span class="fname">Name</span>' +
      '<span class="meta">' + (textArea ? "Size · Lines" : "Size") + '</span>' +
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
      empty.textContent = q
        ? "No files match “" + q + "”."
        : emptyMessage(currentArea);
      listEl.appendChild(empty);
      updateSelbar();
      return;
    }

    shown.forEach(function (name) { listEl.appendChild(renderRow(name, q, textArea)); });
    updateSelbar();
  }

  function emptyMessage(area) {
    if (area === "images") return "No images yet. Use Upload to add .png/.jpg/.gif files.";
    if (area === "sounds") return "No sounds yet. Use Upload to add .wav/.ogg/.mp3 files.";
    if (area === "music") return "No music yet. Use Upload to add .ogg/.mp3 files.";
    if (area === "data") return "No data files yet.";
    return "No files yet.";
  }

  function renderRow(name, q, textArea) {
    var e = entries[name];
    var wrap = document.createElement("div");
    var row = document.createElement("div");
    row.className = "row" + (currentArea === "scripts" && name === activeName ? " current" : "");

    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = selected.has(name);
    cb.setAttribute("aria-label", "Select " + name);
    cb.addEventListener("change", function () {
      cb.checked ? selected.add(name) : selected.delete(name);
      updateSelbar(); syncSelAll();
    });
    row.appendChild(cb);

    // Preview tile for binary areas.
    if (!textArea) row.appendChild(renderPreview(name, e));

    var fname = document.createElement("span");
    fname.className = "fname";
    if (currentArea === "scripts") {
      var link = document.createElement("a");
      link.className = "namelink";
      link.href = "editor.html";
      link.title = "Open " + name + " in the editor";
      link.innerHTML = highlight(name, q);
      link.addEventListener("click", function (ev) { ev.preventDefault(); openInEditor(name); });
      fname.appendChild(link);
      if (name === activeName) {
        var badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = "in editor";
        fname.appendChild(badge);
      }
    } else {
      fname.innerHTML = highlight(name, q);
    }
    row.appendChild(fname);

    var meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = textArea
      ? humanSize(contentSize(e)) + " · " + lineCount(String(e.content))
      : humanSize(contentSize(e));
    row.appendChild(meta);

    var btns = document.createElement("span");
    btns.className = "rowbtns";
    if (currentArea === "scripts") {
      btns.appendChild(iconBtn("📝", "Open in editor", function () { openInEditor(name); }));
      btns.appendChild(iconBtn("📄", "Make a copy", function () { copyFile(name); }));
    }
    btns.appendChild(iconBtn("✏️", "Rename", function () { renameFile(name); }));
    btns.appendChild(iconBtn("⬇️", "Download", function () { downloadOne(name); }));
    btns.appendChild(iconBtn("🗑️", "Delete", function () { deleteFile(name); }));
    row.appendChild(btns);

    wrap.appendChild(row);

    // Content match preview line (text areas only).
    if (q && textArea && e.kind === "text") {
      var hit = firstMatchLine(String(e.content), q);
      if (hit) {
        var pre = document.createElement("div");
        pre.className = "matchline";
        pre.innerHTML = "L" + hit.n + ": " + highlight(hit.text.slice(0, 160), q);
        wrap.appendChild(pre);
      }
    }
    return wrap;
  }

  // Build a preview tile: image thumbnail, or an audio play button for
  // sounds/music. Falls back to a placeholder when preview isn't possible.
  function renderPreview(name, e) {
    var tile = document.createElement("span");
    tile.className = "preview";
    var blob = (e.content instanceof Blob) ? e.content : null;

    if (currentArea === "images" && blob) {
      var img = document.createElement("img");
      img.alt = name;
      img.src = objectUrl(blob);
      img.addEventListener("error", function () {
        tile.innerHTML = '<span class="placeholder">🖼️</span>';
      });
      tile.appendChild(img);
      return tile;
    }

    if ((currentArea === "sounds" || currentArea === "music") && blob) {
      var audio = document.createElement("audio");
      audio.src = objectUrl(blob);
      audio.preload = "none";
      var play = document.createElement("button");
      play.className = "playbtn";
      play.type = "button";
      play.textContent = "▶";
      play.title = "Play " + name;
      play.setAttribute("aria-label", "Play " + name);
      play.addEventListener("click", function () {
        if (audio.paused) {
          audio.play().then(function () { play.textContent = "⏸"; })
            .catch(function () { play.textContent = "⚠️"; });
        } else { audio.pause(); play.textContent = "▶"; }
      });
      audio.addEventListener("ended", function () { play.textContent = "▶"; });
      audio.addEventListener("error", function () { play.textContent = "⚠️"; play.disabled = true; });
      tile.appendChild(play);
      tile.appendChild(audio);
      return tile;
    }

    tile.innerHTML = '<span class="placeholder">' +
      (currentArea === "images" ? "🖼️" : currentArea === "sounds" ? "🔊" :
       currentArea === "music" ? "🎵" : "💾") + "</span>";
    return tile;
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
    var textArea = isTextArea(currentArea);
    var shown = sortedNames().filter(function (name) {
      if (!q) return true;
      var low = q.toLowerCase();
      if (name.toLowerCase().indexOf(low) !== -1) return true;
      var e = entries[name];
      return textArea && e.kind === "text" && String(e.content).toLowerCase().indexOf(low) !== -1;
    });
    var selAll = document.getElementById("selAll");
    if (selAll) selAll.checked = shown.length > 0 && shown.every(function (n) { return selected.has(n); });
  }

  function updateSelbar() {
    var total = Object.keys(entries).length;
    var n = selected.size;
    selbarEl.textContent = total + " file" + (total === 1 ? "" : "s") + " in " + currentArea +
      (n ? " · " + n + " selected" : "");
    var disabled = n === 0;
    exportBtn.disabled = disabled;
    deleteBtn.disabled = disabled;
  }

  function storeError(e, what) {
    toast((what || "That didn't work") + ": " + (e && e.message || e), { error: true });
  }

  // ---------- Actions ----------
  function newFile() {
    if (!isTextArea(currentArea)) {
      toast("Use Upload to add files to this area.", { error: true });
      return;
    }
    var suggested = uniqueName("untitled" + defaultExt(currentArea));
    var input = prompt("New file name:", suggested);
    if (input === null) return;
    var name = normaliseName(input, currentArea);
    if (!name) return;
    if (entries[name] !== undefined) { toast("“" + name + "” already exists.", { error: true }); return; }
    var starter = currentArea === "scripts" ? "# " + name + "\n\n" : "";
    FileStore.write(toKey(currentArea, name), starter, { area: currentArea })
      .then(render).then(function () { toast("Created " + name); })
      .catch(function (e) { storeError(e, "Couldn't create the file"); });
  }

  function renameFile(name) {
    var input = prompt('Rename "' + name + '" to:', name);
    if (input === null) return;
    var next = normaliseName(input, currentArea);
    if (!next || next === name) return;
    var overwrite = entries[next] !== undefined;
    if (overwrite && !confirm('"' + next + '" exists. Overwrite it?')) return;
    var op = overwrite
      ? FileStore.write(toKey(currentArea, next), entries[name].content, { area: currentArea })
          .then(function () { return FileStore.remove(toKey(currentArea, name)); })
      : FileStore.rename(toKey(currentArea, name), toKey(currentArea, next));
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
    var next = normaliseName(input, currentArea);
    if (!next) return;
    var overwrite = entries[next] !== undefined;
    if (overwrite && !confirm('"' + next + '" exists. Overwrite it?')) return;
    var op = overwrite
      ? FileStore.write(toKey(currentArea, next), entries[name].content, { area: currentArea })
      : FileStore.copy(toKey(currentArea, name), toKey(currentArea, next));
    op.then(render).then(function () { toast("Copied to " + next); })
      .catch(function (e) { storeError(e, "Couldn't copy the file"); });
  }

  function deleteFile(name) {
    if (!confirm('Delete "' + name + '"? This cannot be undone.')) return;
    FileStore.remove(toKey(currentArea, name)).then(function () {
      selected.delete(name);
      return render();
    }).then(function () { toast("Deleted " + name); })
      .catch(function (e) { storeError(e, "Couldn't delete the file"); });
  }

  function deleteSelected() {
    if (!selected.size) return;
    var names = Array.from(selected);
    if (!confirm("Delete " + names.length + " selected file" +
        (names.length === 1 ? "" : "s") + "? This cannot be undone.")) return;
    var chain = Promise.resolve();
    names.forEach(function (n) {
      chain = chain.then(function () { return FileStore.remove(toKey(currentArea, n)); });
    });
    chain.then(function () {
      names.forEach(function (n) { selected.delete(n); });
      return render();
    }).then(function () {
      toast("Deleted " + names.length + " file" + (names.length === 1 ? "" : "s"));
    }).catch(function (e) { storeError(e, "Couldn't delete the files"); });
  }

  function openInEditor(name) {
    FileStore.setActive(toKey("scripts", name)).then(function () {
      window.open("editor.html", "_blank");
      toast("Opening " + name + " in the editor…");
    }).catch(function (e) { storeError(e, "Couldn't open the file"); });
  }

  function downloadOne(name) {
    var e = entries[name];
    var blob = (e.content instanceof Blob) ? e.content
      : new Blob([String(e.content)], { type: "text/plain" });
    download(blob, name);
  }

  // ---------- Upload (binary + data areas) ----------
  var uploadInput = document.getElementById("uploadInput");
  function startUpload() { uploadInput.value = ""; uploadInput.click(); }
  uploadInput.addEventListener("change", function () {
    var fileList = Array.prototype.slice.call(uploadInput.files || []);
    if (!fileList.length) return;
    var textArea = isTextArea(currentArea);
    var chain = Promise.resolve();
    var added = 0;
    fileList.forEach(function (f) {
      chain = chain.then(function () {
        var name = normaliseName(f.name, currentArea);
        if (entries[name] !== undefined && !confirm('"' + name + '" exists. Overwrite it?')) return;
        // Text areas store decoded text; binary areas store the Blob as-is.
        var contentP = textArea ? f.text() : Promise.resolve(f);
        return contentP.then(function (content) {
          return FileStore.write(toKey(currentArea, name), content, { area: currentArea });
        }).then(function () { added++; });
      });
    });
    chain.then(render).then(function () {
      toast("Uploaded " + added + " file" + (added === 1 ? "" : "s"));
    }).catch(function (e) { storeError(e, "Upload failed"); });
  });

  // ---------- Export selected (current area) ----------
  function exportSelected() {
    if (!selected.size) return;
    var names = Array.from(selected);
    var subset = {};
    names.forEach(function (n) { subset[n] = entries[n].content; });
    MiniZip.zip(subset).then(function (bytes) {
      var stamp = new Date().toISOString().slice(0, 10);
      download(new Blob([bytes], { type: "application/zip" }),
        currentArea + "-" + stamp + ".zip");
      toast("Exported " + names.length + " file" + (names.length === 1 ? "" : "s"));
    }).catch(function (e) { toast("Export failed: " + (e && e.message || e), { error: true }); });
  }

  // ---------- Import ZIP (into current area) ----------
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

  // Merge imported entries into the current area; prompt once before
  // overwriting. Text areas store decoded text; binary areas store bytes as a
  // Blob.
  function mergeImported(incoming) {
    var incomingNames = Object.keys(incoming);
    if (!incomingNames.length) { toast("The archive had no files.", { error: true }); return; }
    var textArea = isTextArea(currentArea);

    // Prepare { name -> content } for the current area.
    var prepared = {};
    incomingNames.forEach(function (n) {
      var base = n.split("/").pop();
      var entry = incoming[n];
      var name = normaliseName(base, currentArea);
      if (textArea) {
        prepared[name] = (entry && typeof entry === "object")
          ? (entry.text != null ? entry.text : "") : String(entry);
      } else {
        var bytes = (entry && entry.bytes) ? entry.bytes : new Uint8Array();
        prepared[name] = new Blob([bytes]);
      }
    });

    var clashes = Object.keys(prepared).filter(function (n) { return entries[n] !== undefined; });
    if (clashes.length) {
      var msg = clashes.length + " file" + (clashes.length === 1 ? "" : "s") +
        " already exist:\n\n" + clashes.slice(0, 12).join("\n") +
        (clashes.length > 12 ? "\n…" : "") +
        "\n\nOK = overwrite them, Cancel = keep both (imported copies renamed).";
      if (!confirm(msg)) {
        var renamed = {};
        Object.keys(prepared).forEach(function (n) {
          var target = entries[n] !== undefined ? uniqueName(n) : n;
          renamed[target] = prepared[n];
        });
        prepared = renamed;
      }
    }

    var names = Object.keys(prepared);
    var chain = Promise.resolve();
    names.forEach(function (n) {
      chain = chain.then(function () {
        return FileStore.write(toKey(currentArea, n), prepared[n], { area: currentArea });
      });
    });
    return chain.then(render).then(function () {
      toast("Imported " + names.length + " file" + (names.length === 1 ? "" : "s"));
    });
  }

  // ---------- Area tabs ----------
  function selectArea(area) {
    if (AREAS.indexOf(area) === -1) area = "scripts";
    currentArea = area;
    selected.clear();
    Array.prototype.forEach.call(tabsEl.querySelectorAll(".tab"), function (t) {
      t.setAttribute("aria-selected", String(t.dataset.area === area));
    });
    // "New" only makes sense for text areas; binary areas use Upload.
    newBtn.style.display = isTextArea(area) ? "" : "none";
    render();
  }
  Array.prototype.forEach.call(tabsEl.querySelectorAll(".tab"), function (t) {
    t.addEventListener("click", function () { selectArea(t.dataset.area); });
  });

  // ---------- Fallback banner ----------
  function warnIfNotPersistent() {
    if (!FileStore.isPersistent()) toast("Files can't be saved in this session.", { error: true });
  }

  // ---------- Wire up ----------
  newBtn.addEventListener("click", newFile);
  uploadBtn.addEventListener("click", startUpload);
  document.getElementById("importBtn").addEventListener("click", importZip);
  exportBtn.addEventListener("click", exportSelected);
  deleteBtn.addEventListener("click", deleteSelected);

  searchEl.addEventListener("input", paint);
  document.getElementById("searchClear").addEventListener("click", function () {
    searchEl.value = ""; paint(); searchEl.focus();
  });

  FileStore.onChange(function () { render(); });

  FileStore.init()
    .then(function () { warnIfNotPersistent(); selectArea("scripts"); })
    .catch(function (e) { toast("Storage error: " + (e && e.message || e), { error: true }); });
})();

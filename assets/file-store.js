// file-store.js — async, IndexedDB-backed file store for the learn-python app.
// Replaces the old localStorage file store. Both editor.html and
// assets/file-manager.js talk to this module (window.FileStore) instead of
// reading/writing localStorage directly.
//
// Storage model (design: Data Models):
//   Database "learnpython-files" v1
//     object store "files" keyPath "path", index "by_area" on "area"
//       record: { path, area, name, kind, content, size, mtime }
//     object store "meta"  keyPath "key"
//       records: { key:"active", value:"scripts/main.py" }
//                { key:"persistRequested", value:true }
//
// Keys are "<area>/<name>" (e.g. "scripts/main.py", "images/player.png").
// All methods are async (return Promises). If IndexedDB cannot be opened the
// module transparently falls back to an in-memory store with the same API.
//
// Dependency-free, offline, works as a classic <script> (sets window.FileStore).

(function () {
  "use strict";

  // ---- Constants -----------------------------------------------------------
  var DB_NAME = "learnpython-files";
  var DB_VERSION = 1;
  var FILES_STORE = "files";
  var META_STORE = "meta";
  var AREA_INDEX = "by_area";
  var CHANNEL_NAME = "learnpython-files";

  var DEFAULT_AREA = "scripts";
  var DEFAULT_NAME = "main.py";
  var DEFAULT_PATH = DEFAULT_AREA + "/" + DEFAULT_NAME;

  var ACTIVE_KEY = "active";
  var PERSIST_KEY = "persistRequested";

  // Starter content for a freshly seeded store. The editor still owns its own
  // richer starter for brand-new files it creates itself; this is the minimal
  // content so a fresh install is never empty.
  var STARTER = "# Welcome to Python! 🐍\n# Press Run to try this out.\n\nprint(\"Hello, world! 👋\")\n";

  // ---- Typed errors (callers branch on .name) ------------------------------
  function NotFoundError(message) {
    this.name = "NotFoundError";
    this.message = message || "File not found";
  }
  NotFoundError.prototype = Object.create(Error.prototype);
  NotFoundError.prototype.constructor = NotFoundError;

  function ConflictError(message) {
    this.name = "ConflictError";
    this.message = message || "A file with that name already exists";
  }
  ConflictError.prototype = Object.create(Error.prototype);
  ConflictError.prototype.constructor = ConflictError;

  // ---- Key + record helpers ------------------------------------------------
  function makeKey(area, name) { return area + "/" + name; }
  function splitKey(path) {
    var i = path.indexOf("/");
    if (i === -1) return { area: DEFAULT_AREA, name: path };
    return { area: path.slice(0, i), name: path.slice(i + 1) };
  }
  function kindOf(content) {
    return (typeof Blob !== "undefined" && content instanceof Blob) ? "binary" : "text";
  }
  function sizeOf(content) {
    if (typeof Blob !== "undefined" && content instanceof Blob) return content.size;
    return new Blob([String(content)]).size;
  }
  function toMeta(rec) {
    return {
      path: rec.path, area: rec.area, name: rec.name,
      kind: rec.kind, size: rec.size, mtime: rec.mtime,
    };
  }
  // Normalise a caller-supplied path/name into a full "<area>/<name>" key.
  // If the path has no area prefix, `area` (default "scripts") is applied.
  function normalisePath(pathOrName, area) {
    area = area || DEFAULT_AREA;
    if (pathOrName.indexOf("/") !== -1) return pathOrName;     // already an area key
    return makeKey(area, pathOrName);
  }
  // Build a full record from a key + content.
  function makeRecord(path, content) {
    var parts = splitKey(path);
    return {
      path: path,
      area: parts.area,
      name: parts.name,
      kind: kindOf(content),
      content: content,
      size: sizeOf(content),
      mtime: Date.now(),
    };
  }

  // ---- Change notification (task 4) ---------------------------------------
  var subscribers = [];           // same-tab onChange handlers
  var channel = null;             // BroadcastChannel, if available
  try {
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = function (ev) { dispatchLocal(ev.data); };
    }
  } catch (_) { channel = null; }

  function dispatchLocal(msg) {
    for (var i = 0; i < subscribers.length; i++) {
      try { subscribers[i](msg); } catch (_) { /* a bad handler must not break others */ }
    }
  }
  // Notify same-tab subscribers immediately and other tabs via the channel.
  // Never throws: a channel failure must not undo a committed mutation.
  function notify(type, path, area) {
    var msg = { type: type, path: path, area: area, origin: tabId };
    dispatchLocal(msg);
    if (channel) {
      try { channel.postMessage(msg); } catch (_) { /* cross-tab sync skipped */ }
    }
  }
  var tabId = Math.random().toString(36).slice(2);

  // ---- IndexedDB plumbing --------------------------------------------------
  var db = null;        // open IDBDatabase once ready (null => fallback/in-memory)
  var impl = null;      // the active backend: idbBackend or memoryBackend
  var persistRequested = false;

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!("indexedDB" in self) || !self.indexedDB) {
        reject(new Error("IndexedDB is not available"));
        return;
      }
      var req;
      try { req = self.indexedDB.open(DB_NAME, DB_VERSION); }
      catch (e) { reject(e); return; }
      req.onupgradeneeded = function () {
        var idb = req.result;
        if (!idb.objectStoreNames.contains(FILES_STORE)) {
          var files = idb.createObjectStore(FILES_STORE, { keyPath: "path" });
          files.createIndex(AREA_INDEX, "area", { unique: false });
        }
        if (!idb.objectStoreNames.contains(META_STORE)) {
          idb.createObjectStore(META_STORE, { keyPath: "key" });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error("Failed to open IndexedDB")); };
      req.onblocked = function () { /* another tab holds an older version open */ };
    });
  }

  function reqP(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  // ---- IndexedDB backend ---------------------------------------------------
  var idbBackend = {
    getRecord: function (path) {
      var t = db.transaction(FILES_STORE, "readonly");
      return reqP(t.objectStore(FILES_STORE).get(path));
    },
    getAll: function () {
      var t = db.transaction(FILES_STORE, "readonly");
      return reqP(t.objectStore(FILES_STORE).getAll());
    },
    putRecord: function (rec) {
      var t = db.transaction(FILES_STORE, "readwrite");
      t.objectStore(FILES_STORE).put(rec);
      return txDone(t);
    },
    deleteRecord: function (path) {
      var t = db.transaction(FILES_STORE, "readwrite");
      t.objectStore(FILES_STORE).delete(path);
      return txDone(t);
    },
    getMeta: function (key) {
      var t = db.transaction(META_STORE, "readonly");
      return reqP(t.objectStore(META_STORE).get(key)).then(function (r) {
        return r ? r.value : undefined;
      });
    },
    setMeta: function (key, value) {
      var t = db.transaction(META_STORE, "readwrite");
      t.objectStore(META_STORE).put({ key: key, value: value });
      return txDone(t);
    },
  };
  function txDone(t) {
    return new Promise(function (resolve, reject) {
      t.oncomplete = function () { resolve(); };
      t.onerror = function () { reject(t.error || new Error("Transaction failed")); };
      t.onabort = function () { reject(t.error || new Error("Transaction aborted")); };
    });
  }

  // ---- In-memory fallback backend (task 5) ---------------------------------
  // Identical surface to idbBackend, backed by plain Maps. Used when IndexedDB
  // cannot be opened (e.g. some private-browsing modes). isPersistent()=false.
  function makeMemoryBackend() {
    var fileMap = new Map();   // path -> record
    var metaMap = new Map();   // key -> value
    return {
      getRecord: function (path) { return Promise.resolve(fileMap.get(path)); },
      getAll: function () { return Promise.resolve(Array.from(fileMap.values())); },
      putRecord: function (rec) { fileMap.set(rec.path, rec); return Promise.resolve(); },
      deleteRecord: function (path) { fileMap.delete(path); return Promise.resolve(); },
      getMeta: function (key) { return Promise.resolve(metaMap.get(key)); },
      setMeta: function (key, value) { metaMap.set(key, value); return Promise.resolve(); },
    };
  }

  // ---- Seeding -------------------------------------------------------------
  function seedIfEmpty() {
    return impl.getAll().then(function (all) {
      if (all && all.length) return;
      return impl.putRecord(makeRecord(DEFAULT_PATH, STARTER)).then(function () {
        return impl.setMeta(ACTIVE_KEY, DEFAULT_PATH);
      });
    });
  }

  // ---- Public API ----------------------------------------------------------
  var readyPromise = null;

  function init() {
    if (readyPromise) return readyPromise;
    readyPromise = openDb().then(function (opened) {
      db = opened;
      impl = idbBackend;
    }).catch(function () {
      // Transparent fallback: keep the app usable without persistence.
      db = null;
      impl = makeMemoryBackend();
    }).then(function () {
      return impl.getMeta(PERSIST_KEY);
    }).then(function (flag) {
      persistRequested = !!flag;
      return seedIfEmpty();
    });
    return readyPromise;
  }

  function isPersistent() { return !!db; }

  function list(area) {
    return impl.getAll().then(function (all) {
      var out = [];
      for (var i = 0; i < all.length; i++) {
        if (!area || all[i].area === area) out.push(toMeta(all[i]));
      }
      out.sort(function (a, b) { return a.path.localeCompare(b.path); });
      return out;
    });
  }

  function read(pathOrName, area) {
    var path = normalisePath(pathOrName, area);
    return impl.getRecord(path).then(function (rec) {
      if (!rec) throw new NotFoundError('"' + path + '" was not found');
      return rec;
    });
  }

  // Create or overwrite. Requests persistent storage once on first write.
  function write(pathOrName, content, opts) {
    var area = (opts && opts.area) || DEFAULT_AREA;
    var path = normalisePath(pathOrName, area);
    var rec = makeRecord(path, content);
    return impl.putRecord(rec).then(function () {
      notify("changed", path, rec.area);
      return maybeRequestPersist();
    });
  }

  function rename(oldPathOrName, newPathOrName, area) {
    var oldPath = normalisePath(oldPathOrName, area);
    var newPath = normalisePath(newPathOrName, area);
    if (oldPath === newPath) return Promise.resolve();
    return impl.getRecord(oldPath).then(function (src) {
      if (!src) throw new NotFoundError('"' + oldPath + '" was not found');
      return impl.getRecord(newPath).then(function (clash) {
        if (clash) throw new ConflictError('"' + newPath + '" already exists');
        var moved = makeRecord(newPath, src.content);
        return impl.putRecord(moved).then(function () {
          return impl.deleteRecord(oldPath);
        }).then(function () {
          return reseedIfScriptsEmpty();
        }).then(function () {
          notify("changed", newPath, moved.area);
        });
      });
    });
  }

  function copy(srcPathOrName, destPathOrName, area) {
    var srcPath = normalisePath(srcPathOrName, area);
    var destPath = normalisePath(destPathOrName, area);
    return impl.getRecord(srcPath).then(function (src) {
      if (!src) throw new NotFoundError('"' + srcPath + '" was not found');
      return impl.getRecord(destPath).then(function (clash) {
        if (clash) throw new ConflictError('"' + destPath + '" already exists');
        var dup = makeRecord(destPath, src.content);
        return impl.putRecord(dup).then(function () {
          notify("changed", destPath, dup.area);
        });
      });
    });
  }

  function remove(pathOrName, area) {
    var path = normalisePath(pathOrName, area);
    return impl.getRecord(path).then(function (rec) {
      if (!rec) throw new NotFoundError('"' + path + '" was not found');
      return impl.deleteRecord(path).then(function () {
        return reseedIfScriptsEmpty();
      }).then(function () {
        return fixActiveAfterRemoval(path);
      }).then(function () {
        notify("changed", path, rec.area);
      });
    });
  }

  // If deleting leaves the scripts area empty, re-seed main.py (mirrors the
  // current editor/file-manager "never zero files" behaviour).
  function reseedIfScriptsEmpty() {
    return impl.getAll().then(function (all) {
      var hasScript = all.some(function (r) { return r.area === DEFAULT_AREA; });
      if (hasScript) return;
      return impl.putRecord(makeRecord(DEFAULT_PATH, STARTER));
    });
  }
  // Keep the active pointer valid if the active file was just removed.
  function fixActiveAfterRemoval(removedPath) {
    return impl.getMeta(ACTIVE_KEY).then(function (active) {
      if (active && active !== removedPath) return;
      return impl.getAll().then(function (all) {
        var scripts = all.filter(function (r) { return r.area === DEFAULT_AREA; })
          .map(function (r) { return r.path; }).sort();
        var next = scripts[0] || (all[0] && all[0].path) || DEFAULT_PATH;
        return impl.setMeta(ACTIVE_KEY, next);
      });
    });
  }

  function getActive() {
    return impl.getMeta(ACTIVE_KEY).then(function (v) { return v || DEFAULT_PATH; });
  }
  function setActive(path) {
    return impl.setMeta(ACTIVE_KEY, path).then(function () {
      notify("active", path);
    });
  }

  function onChange(handler) {
    subscribers.push(handler);
    return function unsubscribe() {
      var i = subscribers.indexOf(handler);
      if (i !== -1) subscribers.splice(i, 1);
    };
  }

  // Fire-and-forget: ask for persistent storage once per store lifetime.
  function maybeRequestPersist() {
    if (persistRequested) return Promise.resolve();
    persistRequested = true;
    var p = impl.setMeta(PERSIST_KEY, true).catch(function () {});
    try {
      if (navigator.storage && typeof navigator.storage.persist === "function") {
        navigator.storage.persist();
      }
    } catch (_) { /* unsupported — non-persistent IndexedDB is fine */ }
    return p;
  }

  window.FileStore = {
    init: init,
    isPersistent: isPersistent,
    list: list,
    read: read,
    write: write,
    rename: rename,
    copy: copy,
    remove: remove,
    getActive: getActive,
    setActive: setActive,
    onChange: onChange,
    NotFoundError: NotFoundError,
    ConflictError: ConflictError,
  };
})();

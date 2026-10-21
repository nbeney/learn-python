// snippet-tools.js — adds "Copy" and "Open in editor" buttons under code
// snippets across the cheatsheets. Dependency-free, works offline.
//
// Behaviour:
//   • Every <pre class="code"> gets a toolbar underneath with:
//       📋 Copy            — copies the snippet to the clipboard
//       📝 Open in editor  — hands the code to editor.html (new tab, new file)
//   • Blocks marked <pre class="code norun"> (e.g. "pip install ...") only get
//     the Copy button, since they are not runnable Python.
//   • The Basic cheatsheet builds CodeMirror boxes itself; it calls
//     window.SnippetTools.addToToolbar(...) to place Copy + Open in editor
//     BEFORE its existing ▶ Run button.
//
// Handoff to the editor uses localStorage key "learn-python:editor-incoming":
//     { code: "...", name: "nice-name", ts: 1234567890 }
// The editor consumes and clears it on load, creating a new file.

(function () {
  "use strict";

  var INCOMING_KEY = "learn-python:editor-incoming";

  // ---- One-time CSS, themed to match the pages. ----
  function injectStyle() {
    if (document.getElementById("snippet-tools-style")) return;
    var css =
      ".snippet-tools {" +
      "  display: flex; justify-content: flex-end; gap: .5rem;" +
      "  margin: .4rem 0 0; flex-wrap: wrap;" +
      "}" +
      ".snippet-tools .st-btn {" +
      "  background: var(--card); color: var(--text);" +
      "  border: 1px solid var(--border); border-radius: 8px;" +
      "  font: inherit; font-size: .82rem; font-weight: 600;" +
      "  padding: .3rem .7rem; cursor: pointer; line-height: 1;" +
      "}" +
      ".snippet-tools .st-btn:hover { border-color: var(--accent); }" +
      ".snippet-tools .st-btn.st-open { background: var(--accent); color: #fff; border-color: var(--accent); }" +
      ".snippet-tools .st-btn.ok { border-color: #2da44e; color: #2da44e; }" +
      // Inline buttons live in the Basic page's own .toolbar, next to ▶ Run.
      ".st-inline-btn {" +
      "  border: none; font-weight: 600; font-size: .9rem;" +
      "  padding: .4rem .9rem; border-radius: 8px; cursor: pointer;" +
      "}" +
      ".st-inline-btn.st-copy { background: var(--card); color: var(--text); border: 1px solid var(--border); }" +
      ".st-inline-btn.st-copy:hover { border-color: var(--accent); }" +
      ".st-inline-btn.st-open { background: var(--accent); color: #fff; }" +
      ".st-inline-btn.ok { background: var(--card); border: 1px solid #2da44e; color: #2da44e; }" +
      "@media print { .snippet-tools, .st-inline-btn { display: none !important; } }";
    var style = document.createElement("style");
    style.id = "snippet-tools-style";
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---- Clipboard copy with a fallback for non-secure contexts. ----
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error("copy failed"));
      } catch (e) { reject(e); }
    });
  }

  // Flash a short confirmation on a button, then restore it.
  function flash(btn, msg) {
    var original = btn.textContent;
    btn.textContent = msg;
    btn.classList.add("ok");
    setTimeout(function () {
      btn.textContent = original;
      btn.classList.remove("ok");
    }, 1500);
  }

  // Turn a section title into a tidy .py filename, e.g.
  // "🔁 loops — do it again" -> "loops-do-it-again".
  function slugify(title) {
    var s = (title || "").toLowerCase();
    s = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return s || "snippet";
  }

  // A short per-cheatsheet prefix for generated file names, derived from the
  // page's file name. A few pages use the library name rather than the file
  // name (overrides below), and anything too long is abbreviated.
  var PREFIX_OVERRIDES = {
    "cheatsheet-gui": "guizero",
    "cheatsheet-text-speech": "pyttsx3",
  };
  function pagePrefix() {
    var file = (location.pathname.split("/").pop() || "").replace(/\.html?$/i, "");
    if (PREFIX_OVERRIDES[file]) return PREFIX_OVERRIDES[file];
    // Default: strip a leading "cheatsheet-" and keep the topic (e.g.
    // "cheatsheet-turtle" -> "turtle", "cheatsheet-charts" -> "charts").
    var topic = file.replace(/^cheatsheet-?/, "");
    topic = slugify(topic);
    if (!topic) return "snippet";
    // Keep prefixes short.
    return topic.length > 10 ? topic.slice(0, 10) : topic;
  }

  // Find a human-friendly name for a snippet: "<page-prefix>-<section-title>",
  // e.g. "turtle-draw-a-square", "guizero-choices-checkbox".
  function nameForNode(node) {
    var section = node.closest ? node.closest("section") : null;
    var h2 = section ? section.querySelector("h2") : null;
    var titleSlug = slugify(h2 ? h2.textContent : "");
    var prefix = pagePrefix();
    if (titleSlug === "snippet") return prefix;
    return prefix + "-" + titleSlug;
  }

  // Open the editor in a new tab with the given code loaded into a new file.
  function openInEditor(code, name) {
    try {
      localStorage.setItem(INCOMING_KEY, JSON.stringify({
        code: code, name: name || "from-cheatsheet", ts: Date.now(),
      }));
    } catch (e) { /* storage may be full/blocked; still open the editor */ }
    window.open("editor.html", "_blank");
  }

  // Build a Copy button wired to a getter for the current code.
  function makeCopyBtn(getCode) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "st-btn st-copy";
    btn.textContent = "📋 Copy";
    btn.addEventListener("click", function () {
      copyText(getCode()).then(
        function () { flash(btn, "✅ Copied"); },
        function () { flash(btn, "⚠️ Press Ctrl+C"); }
      );
    });
    return btn;
  }

  // Build an "Open in editor" button wired to a getter + a name getter.
  function makeOpenBtn(getCode, getName) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "st-btn st-open";
    btn.textContent = "📝 Open in editor";
    btn.title = "Open this snippet in the editor (new tab)";
    btn.addEventListener("click", function () {
      openInEditor(getCode(), getName());
    });
    return btn;
  }

  // Public hook for the Basic cheatsheet: add Copy + Open in editor to an
  // existing toolbar, inserted before a reference node (its Run button).
  // getCode() returns the current snippet text; `name` is used for the file.
  function addToToolbar(toolbar, getCode, opts) {
    opts = opts || {};
    injectStyle();
    var getName = function () { return opts.name || nameForNode(toolbar); };
    // Inline variants adopt the host page's .run-btn-style look.
    var copyBtn = makeCopyBtn(getCode);
    copyBtn.className = "st-inline-btn st-copy";
    var openBtn = makeOpenBtn(getCode, getName);
    openBtn.className = "st-inline-btn st-open";
    var before = opts.before || null;
    toolbar.insertBefore(copyBtn, before);
    toolbar.insertBefore(openBtn, before);
    return { copyBtn: copyBtn, openBtn: openBtn };
  }

  // Scan static <pre class="code"> blocks and attach a toolbar underneath.
  function wirePreBlocks() {
    var blocks = document.querySelectorAll("pre.code");
    if (!blocks.length) return;
    injectStyle();
    blocks.forEach(function (pre) {
      if (pre.dataset.snippetWired === "1") return;
      pre.dataset.snippetWired = "1";

      var getCode = function () { return pre.textContent.replace(/\s+$/, ""); };
      var getName = function () { return nameForNode(pre); };

      var bar = document.createElement("div");
      bar.className = "snippet-tools no-print";
      bar.appendChild(makeCopyBtn(getCode));
      if (!pre.classList.contains("norun")) {
        bar.appendChild(makeOpenBtn(getCode, getName));
      }
      pre.insertAdjacentElement("afterend", bar);
    });
  }

  // Expose the hook for module scripts (Basic page) and auto-wire pre blocks.
  window.SnippetTools = {
    addToToolbar: addToToolbar,
    openInEditor: openInEditor,
    copyText: copyText,
    nameForNode: nameForNode,
    INCOMING_KEY: INCOMING_KEY,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wirePreBlocks);
  } else {
    wirePreBlocks();
  }
})();

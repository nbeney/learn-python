// Single entry that re-exports everything the pages need.
// Bundling from one entry guarantees ONE copy of @codemirror/state,
// so extensions never fail instanceof checks.
export { EditorView, basicSetup } from "codemirror";
export { keymap } from "@codemirror/view";
export { indentWithTab } from "@codemirror/commands";
export { Prec } from "@codemirror/state";
export { indentUnit } from "@codemirror/language";
export { python } from "@codemirror/lang-python";
export { oneDark } from "@codemirror/theme-one-dark";

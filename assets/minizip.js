// minizip.js — tiny, dependency-free ZIP reader/writer. Writes STORE (no
// compression); reads STORE + DEFLATE. Handles both text and binary entries
// and works fully offline. Exposes window.MiniZip.
//
//   zip(files):   files = { "name": value, ... } -> Promise<Uint8Array>
//                 each value is a string (UTF-8 encoded), a Uint8Array, or a
//                 Blob (stored as-is). Returns a Promise because Blob entries
//                 are read asynchronously.
//   unzip(bytes): Uint8Array (.zip) -> Promise<{ name: { kind, text?, bytes } }>
//                 every entry carries raw `bytes`; `text` is a best-effort
//                 UTF-8 decode. The CALLER decides text vs binary (the file
//                 manager decides by area), so `kind` is a hint only.
//
// Only the common case is handled: STORE/DEFLATE, UTF-8 names, no encryption,
// no zip64. That covers archives this app produces and typical small imports.

(function () {
  "use strict";

  // ---- CRC-32 (standard polynomial 0xEDB88320), with a cached table. ----
  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  var enc = new TextEncoder();   // UTF-8
  var dec = new TextDecoder("utf-8");

  // Little-endian writers into a growable byte array.
  function pushU16(arr, v) { arr.push(v & 0xFF, (v >>> 8) & 0xFF); }
  function pushU32(arr, v) {
    arr.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF);
  }
  function pushBytes(arr, bytes) { for (var i = 0; i < bytes.length; i++) arr.push(bytes[i]); }

  // Little-endian readers.
  function readU16(b, o) { return b[o] | (b[o + 1] << 8); }
  function readU32(b, o) {
    return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  }

  // Coerce an entry value (string | Uint8Array | Blob | ArrayBuffer) to a
  // Uint8Array. Returns a Promise because Blobs are read asynchronously.
  function toBytes(value) {
    if (value instanceof Uint8Array) return Promise.resolve(value);
    if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) {
      return Promise.resolve(new Uint8Array(value));
    }
    if (typeof Blob !== "undefined" && value instanceof Blob) {
      return value.arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
    }
    return Promise.resolve(enc.encode(String(value)));   // text
  }

  // Build a .zip from { name: string | Uint8Array | Blob }. Async (Blobs).
  function zip(files) {
    var names = Object.keys(files);
    // Read every entry's bytes first (handles async Blob entries), then build.
    return Promise.all(names.map(function (n) { return toBytes(files[n]); }))
      .then(function (datas) { return buildZip(names, datas); });
  }

  // Assemble the archive from parallel name/data arrays.
  function buildZip(names, datas) {
    var out = [];
    var central = [];
    var offset = 0;

    names.forEach(function (name, idx) {
      var nameBytes = enc.encode(name);
      var data = datas[idx];
      var crc = crc32(data);
      var size = data.length;

      // ---- Local file header ----
      var localStart = offset;
      var local = [];
      pushU32(local, 0x04034b50);   // local file header signature
      pushU16(local, 20);           // version needed
      pushU16(local, 0x0800);       // flags: bit 11 = UTF-8 names
      pushU16(local, 0);            // method 0 = STORE
      pushU16(local, 0);            // mod time
      pushU16(local, 0);            // mod date
      pushU32(local, crc);
      pushU32(local, size);         // compressed size (== size for STORE)
      pushU32(local, size);         // uncompressed size
      pushU16(local, nameBytes.length);
      pushU16(local, 0);            // extra length
      pushBytes(local, nameBytes);
      pushBytes(local, data);

      pushBytes(out, local);
      offset += local.length;

      // ---- Central directory record ----
      pushU32(central, 0x02014b50); // central dir signature
      pushU16(central, 20);         // version made by
      pushU16(central, 20);         // version needed
      pushU16(central, 0x0800);     // flags: UTF-8
      pushU16(central, 0);          // method STORE
      pushU16(central, 0);          // mod time
      pushU16(central, 0);          // mod date
      pushU32(central, crc);
      pushU32(central, size);
      pushU32(central, size);
      pushU16(central, nameBytes.length);
      pushU16(central, 0);          // extra length
      pushU16(central, 0);          // comment length
      pushU16(central, 0);          // disk number
      pushU16(central, 0);          // internal attrs
      pushU32(central, 0);          // external attrs
      pushU32(central, localStart); // offset of local header
      pushBytes(central, nameBytes);
    });

    var centralStart = offset;
    pushBytes(out, central);
    var centralSize = central.length;

    // ---- End of central directory ----
    var eocd = [];
    pushU32(eocd, 0x06054b50);
    pushU16(eocd, 0);                 // disk number
    pushU16(eocd, 0);                 // disk with central dir
    pushU16(eocd, names.length);      // entries on this disk
    pushU16(eocd, names.length);      // total entries
    pushU32(eocd, centralSize);
    pushU32(eocd, centralStart);
    pushU16(eocd, 0);                 // comment length
    pushBytes(out, eocd);

    return new Uint8Array(out);
  }

  // Inflate raw DEFLATE bytes using the browser's native DecompressionStream.
  // Returns a Promise<Uint8Array>. Thrown/rejected if unsupported.
  function inflateRaw(bytes) {
    if (typeof DecompressionStream === "undefined") {
      return Promise.reject(new Error(
        "This browser cannot read compressed ZIPs. Re-export without compression."));
    }
    var ds = new DecompressionStream("deflate-raw");
    var writer = ds.writable.getWriter();
    writer.write(bytes);
    writer.close();
    return new Response(ds.readable).arrayBuffer().then(function (buf) {
      return new Uint8Array(buf);
    });
  }

  // Best-effort UTF-8 decode. Returns null if the bytes are not valid UTF-8
  // (so callers can tell "looks like text" from "definitely binary").
  function tryDecodeText(bytes) {
    try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch (_) { return null; }
  }

  // Parse a .zip into { name: { kind, text?, bytes } }. Walks local file
  // headers, decoding STORE (method 0) directly and DEFLATE (method 8) via the
  // browser. Every entry carries raw `bytes`; `text` is the UTF-8 decode when
  // the bytes are valid UTF-8, else omitted. `kind` ("text"|"binary") is a
  // hint; the caller (file manager) makes the final decision by area.
  // Directory entries are skipped. Returns a Promise so DEFLATE can be async.
  function unzip(bytes) {
    var b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var tasks = [];           // array of { name, promise<Uint8Array> }
    var i = 0;
    while (i + 4 <= b.length) {
      var sig = readU32(b, i);
      if (sig !== 0x04034b50) break;   // no more local headers
      var method = readU16(b, i + 8);
      var compSize = readU32(b, i + 18);
      var nameLen = readU16(b, i + 26);
      var extraLen = readU16(b, i + 28);
      var nameStart = i + 30;
      var name = dec.decode(b.subarray(nameStart, nameStart + nameLen));
      var dataStart = nameStart + nameLen + extraLen;
      // Copy out of the shared buffer so each entry owns its bytes.
      var data = b.slice(dataStart, dataStart + compSize);

      if (!/\/$/.test(name)) {   // skip folder entries
        if (method === 0) {
          tasks.push({ name: name, promise: Promise.resolve(data) });
        } else if (method === 8) {
          tasks.push({ name: name, promise: inflateRaw(data) });
        } else {
          return Promise.reject(new Error(
            '"' + name + '" uses an unsupported compression method ' + method + "."));
        }
      }
      i = dataStart + compSize;
    }
    if (!tasks.length) {
      return Promise.reject(new Error("No files found in the archive."));
    }
    return Promise.all(tasks.map(function (t) { return t.promise; }))
      .then(function (datas) {
        var files = {};
        tasks.forEach(function (t, idx) {
          var raw = datas[idx];
          var text = tryDecodeText(raw);
          files[t.name] = text === null
            ? { kind: "binary", bytes: raw }
            : { kind: "text", text: text, bytes: raw };
        });
        return files;
      });
  }

  window.MiniZip = {
    zip: zip, unzip: unzip, inflateRaw: inflateRaw, crc32: crc32, toBytes: toBytes,
  };
})();

// Polyfill for window.storage, used by the components below.
// In Claude.ai artifacts this API is provided by the platform.
// Outside of Claude (e.g. running locally with Vite), we back it with
// localStorage so the same code works unmodified.

function fullKey(key, shared) {
  return `enlata2:${shared ? "shared" : "personal"}:${key}`;
}

if (typeof window !== "undefined" && !window.storage) {
  window.storage = {
    async get(key, shared = false) {
      const raw = localStorage.getItem(fullKey(key, shared));
      if (raw === null) return null;
      return { key, value: raw, shared };
    },
    async set(key, value, shared = false) {
      localStorage.setItem(fullKey(key, shared), value);
      return { key, value, shared };
    },
    async delete(key, shared = false) {
      const existed = localStorage.getItem(fullKey(key, shared)) !== null;
      localStorage.removeItem(fullKey(key, shared));
      return { key, deleted: existed, shared };
    },
    async list(prefix = "", shared = false) {
      const base = fullKey("", shared);
      const keys = Object.keys(localStorage)
        .filter((k) => k.startsWith(base) && k.slice(base.length).startsWith(prefix))
        .map((k) => k.slice(base.length));
      return { keys, prefix, shared };
    },
  };
}

/// <reference types="vitest/globals" />
import "@testing-library/jest-dom/vitest";

// Node ≥ 25 trae un `localStorage`/`sessionStorage` global propio (sin `--localstorage-file` queda a
// medias, sin `clear` ni `getItem`) que tapa al de jsdom. Instalamos un Storage en memoria, igual en
// cualquier versión de Node, y lo vaciamos antes de cada test para que no se filtre estado entre tests.
class MemoryStorage implements Storage {
  private items = new Map<string, string>();

  get length() {
    return this.items.size;
  }
  clear() {
    this.items.clear();
  }
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  key(index: number) {
    return Array.from(this.items.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
  setItem(key: string, value: string) {
    this.items.set(key, String(value));
  }
}

const testStorages = { localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage() };
for (const [name, storage] of Object.entries(testStorages)) {
  for (const target of [globalThis, window]) {
    Object.defineProperty(target, name, { configurable: true, writable: true, value: storage });
  }
}

beforeEach(() => {
  testStorages.localStorage.clear();
  testStorages.sessionStorage.clear();
});

// jsdom no implementa matchMedia; ThemeContext lo usa para resolver la preferencia "system".
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});

// jsdom tampoco implementa IntersectionObserver (lo usan las animaciones de la home) ni scrollTo.
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
Object.defineProperty(window, "IntersectionObserver", { writable: true, value: IntersectionObserverStub });
window.scrollTo = () => {};

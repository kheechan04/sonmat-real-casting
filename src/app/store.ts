// localStorage wrapper for per-viewer settings (camera, rod hand, sliders…). Storage can be
// unavailable (private mode, blocked site data) — then settings simply aren't remembered.

export const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(`sonmat.${key}`);
    } catch {
      return null;
    }
  },
  set(key: string, v: string): void {
    try {
      localStorage.setItem(`sonmat.${key}`, v);
    } catch {
      // storage unavailable
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(`sonmat.${key}`);
    } catch {
      // storage unavailable
    }
  },
};

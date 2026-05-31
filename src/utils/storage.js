import { STORAGE_KEYS } from "../constants";

export const loadStorage = (key, fallback = null) => {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    console.warn("[storage] load failed:", key);
    return fallback;
  }
};

export const saveStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    if (e.name === "QuotaExceededError") {
      alert("ストレージ容量が不足しています。古いデータを削除してください。");
    } else {
      console.warn("[storage] save failed:", key, e);
    }
    return false;
  }
};

export const removeStorage = (key) => {
  try { localStorage.removeItem(key); }
  catch (e) { console.warn("[storage] remove failed:", key, e); }
};

export const clearAllStorage = () => {
  Object.values(STORAGE_KEYS).forEach(removeStorage);
};

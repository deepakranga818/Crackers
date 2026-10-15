import { useEffect, useState, useSyncExternalStore } from "react";
import { SheetStore } from "./store";

// One store per page. It fetches on mount, refreshes about every 60 s while the tab is visible,
// and when the tab becomes visible again after 60 s or more.
export function useSheet() {
  const [store] = useState(() => new SheetStore());
  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);
  const state = useSyncExternalStore(store.subscribe, store.getState);
  return { store, state };
}

"use client";

import { useSyncExternalStore } from "react";
import type { FilledSpot } from "../../lib/wall/model";
import { skey } from "../../lib/wall/saves";
import { Cover } from "./Cover";
import { wallStore } from "./store";

/** §7: the phone sheet's content, the same full view as the inline panel. */
export function SheetContent() {
  const st = useSyncExternalStore(wallStore.subscribe, wallStore.get, wallStore.getServer);
  const s = st.sheetNo ? (st.wall[st.sheetNo - 1] as FilledSpot) : null;
  return s ? <Cover key={s.no} s={s} saved={st.saved.has(skey(s))} /> : null;
}

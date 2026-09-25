/* §11: a save is keyed by story, not spot number, so it survives the spot
   ending and never points at whoever claims that number next. */
export const skey = (s: { no: number; start: number }) => s.no + ":" + Math.round(s.start);

/*
 * Back closes what is open (approved change, phones and tablets): every
 * sheet that comes up (a spot, Finds, Create, Share, Report, Keep my card)
 * gets its own history entry, so the back button or gesture closes the top
 * one instead of leaving the wall. Closing with × or a tap gives the entry
 * back; when another sheet opens straight away, it takes that entry over
 * instead, so the history never jumps.
 */
export function createLayers() {
  const layers: string[] = [];
  let ignorePops = 0,
    releasing = 0,
    releaseT: ReturnType<typeof setTimeout> | undefined;
  return {
    push(name: string, state: object = { layer: name }, url = location.href) {
      layers.push(name);
      try {
        if (releasing > 0) {
          releasing--;
          history.replaceState(state, "", url);
        } else history.pushState(state, "", url);
      } catch {}
    },
    /** Gives back the entries of layers closed on screen (not by Back). */
    release(names: string[]) {
      let n = 0;
      for (const name of names) {
        const i = layers.lastIndexOf(name);
        if (i >= 0) {
          layers.splice(i, 1);
          n++;
        }
      }
      if (!n) return;
      releasing += n;
      clearTimeout(releaseT);
      releaseT = setTimeout(() => {
        if (!releasing) return;
        ignorePops++;
        const k = releasing;
        releasing = 0;
        history.go(-k);
      }, 0);
    },
    /** On popstate: the layer Back closes, or null when the pop was our own (giving entries back). */
    pop(): { top: string | undefined } | null {
      if (ignorePops) {
        ignorePops--;
        return null;
      }
      return { top: layers.pop() };
    },
    stop() {
      clearTimeout(releaseT);
    },
  };
}

/**
 * Reads an image file and scales it to at most `max` px on its longest side,
 * as a JPEG data URL. (The reference assigned `sc` and `c` without declaring
 * them, which only works outside strict mode.)
 */
export function shrink(file: Blob, max = 900): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      const im = new Image();
      im.onerror = reject;
      im.onload = () => {
        const sc = Math.min(1, max / Math.max(im.width, im.height)),
          c = document.createElement("canvas");
        c.width = im.width * sc;
        c.height = im.height * sc;
        c.getContext("2d")!.drawImage(im, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      im.src = fr.result as string;
    };
    fr.readAsDataURL(file);
  });
}

export function readDataURL(file: Blob): Promise<string> {
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.readAsDataURL(file);
  });
}

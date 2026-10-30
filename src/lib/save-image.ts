/**
 * Hands a canvas to the user as a PNG they can keep.
 *
 * On iOS a download lands in the Files app, but banking apps pick a QR to scan
 * from Photos — so iOS gets the share sheet, whose "Save Image" goes to Photos.
 * Everything else, and an iOS too old to share files, gets a plain download.
 *
 * Call it straight from the click handler with no await before it: iOS opens
 * the share sheet only while the tap's user activation is still live.
 */
export function saveCanvasImage(canvas: HTMLCanvasElement, fileName: string): void {
  const dataUrl = canvas.toDataURL("image/png");
  const download = () => {
    const link = document.createElement("a");
    link.download = fileName;
    link.href = dataUrl;
    link.click();
  };

  // iPadOS reports itself as a Mac; the touch screen gives it away.
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
  if (isIOS) {
    const bytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0));
    const file = new File([bytes], fileName, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file] }).catch((e) => {
        // AbortError is the user closing the sheet; any other failure still gets the file out.
        if (e?.name !== "AbortError") download();
      });
      return;
    }
  }
  download();
}

/** Shrink an uploaded photo to a JPEG data URL so it fits in a request and in browser storage. */
export function resizePhoto(file: File, maxSide = 900): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(image.src);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    image.onerror = () => reject(new Error("That file isn't an image we can read."));
    image.src = URL.createObjectURL(file);
  });
}

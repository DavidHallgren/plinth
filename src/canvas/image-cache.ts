export type ImageResource = {
  status: "loading" | "ready" | "error";
  image: HTMLImageElement | null;
  error: string | null;
};

export type ImageFactory = () => HTMLImageElement;

const imageCache = new Map<string, ImageResource>();
const imageLoads = new Map<string, Promise<ImageResource>>();
const imageGenerations = new Map<string, number>();
const cacheListeners = new Set<() => void>();
let cacheVersion = 0;

function notifyCacheChange(): void {
  cacheVersion += 1;
  cacheListeners.forEach((listener) => listener());
}

export function imageResourceState(source: string | null): ImageResource {
  if (!source) return { status: "error", image: null, error: "Asset path is missing." };
  return imageCache.get(source) ?? { status: "loading", image: null, error: null };
}

export function loadImageResource(source: string, imageFactory: ImageFactory = () => new window.Image()): Promise<ImageResource> {
  const cached = imageCache.get(source);
  if (cached) return Promise.resolve(cached);
  const existing = imageLoads.get(source);
  if (existing) return existing;

  const image = imageFactory();
  image.decoding = "async";
  const generation = imageGenerations.get(source) ?? 0;
  let activePromise: Promise<ImageResource>;
  const promise = new Promise<ImageResource>((resolve) => {
    const finish = (next: ImageResource) => {
      if ((imageGenerations.get(source) ?? 0) !== generation) {
        if (imageLoads.get(source) === activePromise) imageLoads.delete(source);
        resolve({ status: "loading", image: null, error: null });
        return;
      }
      imageCache.set(source, next);
      if (imageLoads.get(source) === activePromise) imageLoads.delete(source);
      notifyCacheChange();
      resolve(next);
    };
    image.onload = () => {
      finish({ status: "ready", image, error: null });
    };
    image.onerror = () => {
      finish({ status: "error", image: null, error: "The asset could not be decoded or loaded." });
    };
  });
  activePromise = promise;
  imageLoads.set(source, promise);
  image.src = source;
  return promise;
}

export function subscribeImageCache(listener: () => void): () => void {
  cacheListeners.add(listener);
  return () => cacheListeners.delete(listener);
}

export function imageCacheVersion(): number {
  return cacheVersion;
}

export function clearImageCache(source?: string): void {
  if (source) {
    imageGenerations.set(source, (imageGenerations.get(source) ?? 0) + 1);
    imageCache.delete(source);
    imageLoads.delete(source);
    notifyCacheChange();
    return;
  }
  const sources = new Set([...imageCache.keys(), ...imageLoads.keys()]);
  sources.forEach((key) => imageGenerations.set(key, (imageGenerations.get(key) ?? 0) + 1));
  imageCache.clear();
  imageLoads.clear();
  notifyCacheChange();
}

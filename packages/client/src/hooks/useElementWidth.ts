import { useEffect, useRef, useState } from "react";

/** Ancho actual de un elemento (se actualiza al redimensionar). `fallback` se usa hasta medirlo y donde no hay ResizeObserver. */
export function useElementWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    setWidth(element.clientWidth || fallback);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width) || fallback);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fallback]);

  return { ref, width };
}

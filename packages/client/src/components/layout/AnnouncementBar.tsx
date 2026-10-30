import type { PublicAnnouncement } from "@caracol/shared";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { getPublicAnnouncement } from "@/lib/settingsApi";

const DISMISSED_KEY = "caracol:aviso-cerrado";

function readDismissed(): string | null {
  try {
    return sessionStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

/**
 * El aviso de la tienda (Ajustes → Aviso en la tienda). Se puede cerrar, y queda cerrado durante la
 * visita; si el admin cambia el texto, vuelve a aparecer.
 */
export function AnnouncementBar() {
  const [announcement, setAnnouncement] = useState<PublicAnnouncement | null>(null);
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    let cancelled = false;
    getPublicAnnouncement()
      .then((res) => {
        if (!cancelled) setAnnouncement(res.announcement);
      })
      // Sin aviso no pasa nada: la tienda funciona igual.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!announcement || dismissed === announcement.text) return null;

  function dismiss() {
    if (!announcement) return;
    setDismissed(announcement.text);
    try {
      sessionStorage.setItem(DISMISSED_KEY, announcement.text);
    } catch {
      // Sin storage, se cierra solo en esta pantalla.
    }
  }

  return (
    <div role="status" className="bg-primary text-on-primary">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 sm:px-6">
        <p className="flex-1 text-center text-sm font-medium">{announcement.text}</p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Cerrar aviso"
          className="-mr-1 rounded-full p-1 opacity-80 transition-opacity hover:opacity-100"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

import type { VideoRef } from "@caracol/shared";
import { Film, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { ApiError } from "@/lib/apiClient";
import { signProductImageUpload } from "@/lib/adminProductsApi";
import { uploadToCloudinary } from "@/lib/cloudinaryUpload";
import { videoPoster } from "@/lib/media";

export const MAX_PRODUCT_VIDEOS = 3;
/** Tope del plan gratuito de Cloudinary para un video. */
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

interface ProductVideosEditorProps {
  videos: VideoRef[];
  onChange: (videos: VideoRef[]) => void;
}

/** Videos cortos del producto (los mismos reels que ya se usan en Instagram). Van directo a Cloudinary. */
export function ProductVideosEditor({ videos, onChange }: ProductVideosEditorProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const remaining = MAX_PRODUCT_VIDEOS - videos.length;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);

    const picked = Array.from(files).slice(0, remaining);
    const tooBig = picked.find((f) => f.size > MAX_VIDEO_BYTES);
    if (tooBig) {
      setError(`"${tooBig.name}" pesa más de 100 MB: comprimilo antes de subirlo`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setIsUploading(true);
    try {
      const uploaded: VideoRef[] = [];
      for (const file of picked) {
        const signed = await signProductImageUpload();
        const url = await uploadToCloudinary(file, signed);
        uploaded.push({ url, source: "cloudinary", order: videos.length + uploaded.length });
      }
      onChange([...videos, ...uploaded]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos subir el video");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeAt(index: number) {
    onChange(videos.filter((_, i) => i !== index).map((v, i) => ({ ...v, order: i })));
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-text">Videos</p>

      {videos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {videos.map((video, index) => (
            <div
              key={`${video.url}-${index}`}
              className="group relative aspect-[9/16] max-h-64 overflow-hidden rounded-xl border border-border bg-surface-alt"
            >
              <video
                src={video.url}
                poster={videoPoster(video.url)}
                controls
                preload="metadata"
                playsInline
                className="size-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeAt(index)}
                aria-label="Quitar video"
                className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-primary/70 text-on-primary"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          isLoading={isUploading}
          disabled={remaining <= 0}
          onClick={() => fileInputRef.current?.click()}
        >
          <Film className="size-4" /> Agregar video
        </Button>
        <span className="text-xs text-text-muted">
          {remaining > 0
            ? `Hasta ${MAX_PRODUCT_VIDEOS} videos cortos, de hasta 100 MB cada uno.`
            : `Ya cargaste el máximo (${MAX_PRODUCT_VIDEOS}).`}
        </span>
      </div>
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
    </div>
  );
}

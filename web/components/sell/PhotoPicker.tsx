"use client";

import { useEffect, useId, useMemo } from "react";

export const MAX_PHOTOS = 3;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export interface PhotoPickerProps {
  photos: File[];
  onChange: (photos: File[]) => void;
  error?: string;
  onError: (message: string | undefined) => void;
}

/** 1 to 3 photos, ≤ 5 MB, jpg/png/webp, with previews (03 §5.2). */
export function PhotoPicker({ photos, onChange, error, onError }: PhotoPickerProps) {
  const inputId = useId();
  const previews = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  function add(files: FileList | null) {
    if (!files) return;
    const picked = [...files];
    const bad = picked.find((f) => !PHOTO_TYPES.includes(f.type));
    if (bad) return onError("Las fotos tienen que ser JPG, PNG o WebP.");
    const big = picked.find((f) => f.size > MAX_PHOTO_BYTES);
    if (big) return onError("Cada foto puede pesar hasta 5 MB.");
    const next = [...photos, ...picked].slice(0, MAX_PHOTOS);
    if (photos.length + picked.length > MAX_PHOTOS) onError("Podés subir hasta 3 fotos.");
    else onError(undefined);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-body font-medium text-bone">Fotos</span>
      <div className="grid grid-cols-3 gap-2">
        {previews.map((url, i) => (
          <div key={url} className="relative aspect-square overflow-hidden rounded-xl bg-graphite">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
            <img src={url} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(photos.filter((_, j) => j !== i))}
              className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full bg-vault-black/70 text-bone"
              aria-label={`Sacar la foto ${i + 1}`}
            >
              ×
            </button>
          </div>
        ))}
        {photos.length < MAX_PHOTOS ? (
          <label
            htmlFor={inputId}
            className="flex aspect-square cursor-pointer items-center justify-center rounded-xl border border-dashed border-steel/40 bg-graphite text-steel focus-within:border-ion-blue"
          >
            + Foto
            <input
              id={inputId}
              type="file"
              accept={PHOTO_TYPES.join(",")}
              multiple
              className="sr-only"
              onChange={(e) => {
                add(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        ) : null}
      </div>
      {error ? (
        <p className="text-label text-plasma">{error}</p>
      ) : (
        <p className="text-label text-steel">De 1 a 3 fotos. La primera es la portada.</p>
      )}
    </div>
  );
}

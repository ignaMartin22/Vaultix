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
  const helpId = `${inputId}-help`;
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
      <div className="grid grid-cols-3 gap-3">
        {previews.map((url, i) => (
          <div key={url} className="relative aspect-square overflow-hidden rounded-xl bg-graphite">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
            <img src={url} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
            {i === 0 ? (
              <span className="absolute bottom-2 left-2 rounded bg-vault-black/85 px-1.5 py-0.5 font-mono text-label uppercase text-bone">
                Portada
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => onChange(photos.filter((_, j) => j !== i))}
              className="absolute right-1 top-1 flex size-11 items-center justify-center rounded-full text-bone"
              aria-label={`Sacar la foto ${i + 1}`}
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-vault-black/85 transition-colors hover:bg-vault-black">
                <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
                  <path d="M4 4l8 8M12 4 4 12" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </span>
            </button>
          </div>
        ))}
        {photos.length < MAX_PHOTOS ? (
          <label
            htmlFor={inputId}
            className={`flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-graphite text-label text-steel transition-colors hover:border-steel hover:text-bone focus-within:border-ion-blue focus-within:text-bone ${
              error ? "border-ember" : "border-steel/40"
            }`}
          >
            <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
              <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            Agregá una foto
            <input
              id={inputId}
              type="file"
              accept={PHOTO_TYPES.join(",")}
              multiple
              aria-describedby={helpId}
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
        <p id={helpId} className="text-label text-ember">
          {error}
        </p>
      ) : (
        <p id={helpId} className="text-label text-steel">
          De 1 a 3 fotos. La primera es la portada.
        </p>
      )}
    </div>
  );
}

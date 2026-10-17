"use client";

import type { PieceDetail } from "@nim/types";
import { ImageOff, ImagePlus, Loader2, Trash2, UploadCloud, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ApiError,
  getOfferPieceImageUrl,
  getPieceImageUrl,
  removeOfferPieceImageRequest,
  removePieceImageRequest,
  uploadOfferPieceImageRequest,
  uploadPieceImageRequest,
} from "@/features/auth/auth-client";

const maxImageBytes = 5 * 1024 * 1024;
const maxImageCount = 10;
const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function formatBytes(value: number): string {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} Ko`;
  return `${(value / (1024 * 1024)).toFixed(1)} Mo`;
}

function GalleryImage({
  src,
  alt,
  className,
  loading,
}: {
  src: string;
  alt: string;
  className: string;
  loading?: "eager" | "lazy";
}): React.ReactNode {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        role="img"
        aria-label={`${alt || "Photo"} indisponible`}
        className={`flex flex-col items-center justify-center gap-2 bg-slate-50 px-3 text-center text-xs text-slate-400 ${className}`}
      >
        <ImageOff className="size-5" />
        <span>Image indisponible</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      onError={() => setFailed(true)}
    />
  );
}

export function PieceImageGallery({
  piece,
  canManage,
  offerId,
}: {
  piece: PieceDetail;
  canManage: boolean;
  offerId?: string;
}): React.ReactNode {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(piece.images[0]?.id ?? null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<PieceDetail["images"][number] | null>(null);
  const selected = piece.images.find((image) => image.id === selectedId) ?? piece.images[0] ?? null;
  const canEdit = canManage && piece.status !== "ARCHIVED";

  const refreshImages = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: offerId ? ["offer", offerId, "piece", piece.id] : ["piece", piece.id] }),
      queryClient.invalidateQueries({ queryKey: offerId ? ["offer", offerId, "pieces"] : ["pieces"] }),
    ]);
  };

  const uploadFiles = async (files: File[]): Promise<void> => {
    if (!files.length) return;
    setUploadError(null);
    setUploading(true);
    let uploadedCount = 0;
    try {
      for (const file of files) {
        if (!acceptedTypes.has(file.type))
          throw new Error(`${file.name}: JPEG, PNG ou WebP uniquement.`);
        if (file.size <= 0 || file.size > maxImageBytes)
          throw new Error(`${file.name}: taille maximale de 5 Mo.`);
        await (offerId ? uploadOfferPieceImageRequest(offerId, piece.id, file) : uploadPieceImageRequest(piece.id, file));
        uploadedCount += 1;
      }
      await refreshImages();
      toast.success(
        files.length === 1
          ? "Photo ajoutée à la pièce."
          : `${files.length} photos ajoutées à la pièce.`,
      );
    } catch (error) {
      await refreshImages();
      const message =
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Impossible d’ajouter les photos.";
      const partialMessage =
        uploadedCount > 0 ? `${uploadedCount} photo(s) ajoutée(s). ${message}` : message;
      setUploadError(partialMessage);
      toast.error(partialMessage);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeImage = async (): Promise<void> => {
    if (!removeTarget) return;
    try {
      await (offerId ? removeOfferPieceImageRequest(offerId, piece.id, removeTarget.id) : removePieceImageRequest(piece.id, removeTarget.id));
      await refreshImages();
      setSelectedId(null);
      toast.success("Photo supprimée. L’événement reste conservé dans l’historique.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de supprimer la photo.");
    } finally {
      setRemoveTarget(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-sm">Photos de la pièce</CardTitle>
            <p className="mt-1 text-xs text-slate-500">
              Références visuelles et preuves de fabrication, conservées avec la traçabilité.
            </p>
          </div>
          <span className="shrink-0 text-xs text-slate-400">
            {piece.images.length}/{maxImageCount}
          </span>
        </CardHeader>
        <CardContent>
          {piece.images.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center">
              <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm">
                <ImagePlus className="size-5" />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-700">Aucune photo attachée</p>
              <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
                Ajoutez une ou plusieurs photos de la pièce, de son état ou de sa finition pour
                faciliter le suivi terrain.
              </p>
              {canEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4"
                  onClick={() => inputRef.current?.click()}
                  disabled={uploading}
                >
                  <UploadCloud className="size-4" />
                  Ajouter des photos
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div className="relative overflow-hidden rounded-xl border border-slate-100 bg-slate-950/5">
                {selected ? (
                  <GalleryImage
                    src={offerId ? getOfferPieceImageUrl(offerId, piece.id, selected.id) : getPieceImageUrl(piece.id, selected.id)}
                    alt={`${piece.reference} — ${selected.originalName}`}
                    className="aspect-[16/10] w-full object-contain"
                  />
                ) : null}
                {canEdit && selected ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute right-3 top-3"
                    aria-label={`Supprimer ${selected.originalName}`}
                    onClick={() => setRemoveTarget(selected)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </div>
              <div className="grid grid-cols-3 gap-2 lg:grid-cols-2">
                {piece.images.map((image) => (
                  <button
                    key={image.id}
                    type="button"
                    onClick={() => setSelectedId(image.id)}
                    className={`group relative overflow-hidden rounded-lg border bg-slate-50 text-left transition ${selected?.id === image.id ? "border-nim-red ring-2 ring-nim-red/20" : "border-slate-100 hover:border-slate-300"}`}
                    aria-label={`Afficher ${image.originalName}`}
                  >
                    <GalleryImage
                      src={offerId ? getOfferPieceImageUrl(offerId, piece.id, image.id) : getPieceImageUrl(piece.id, image.id)}
                      alt={`${piece.reference} â€” ${image.originalName}`}
                      className="aspect-square w-full object-cover"
                      loading="lazy"
                    />
                    <span className="absolute inset-x-0 bottom-0 truncate bg-slate-950/65 px-2 py-1 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
                      {image.originalName}
                    </span>
                  </button>
                ))}
                {canEdit && piece.images.length < maxImageCount ? (
                  <button
                    type="button"
                    className="flex aspect-square flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-500 hover:border-slate-400 hover:text-slate-800"
                    onClick={() => inputRef.current?.click()}
                    disabled={uploading}
                  >
                    <ImagePlus className="mb-1 size-4" />
                    Ajouter
                  </button>
                ) : null}
              </div>
            </div>
          )}
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              const remaining = maxImageCount - piece.images.length;
              if (files.length > remaining) {
                setUploadError(`Sélectionnez au maximum ${remaining} photo(s) supplémentaire(s).`);
                event.currentTarget.value = "";
                return;
              }
              void uploadFiles(files);
            }}
          />
          {uploading ? (
            <div
              className="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600"
              role="status"
            >
              <Loader2 className="size-4 animate-spin" />
              Import des photos en cours…
            </div>
          ) : null}
          {uploadError ? (
            <div
              className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-700"
              role="alert"
            >
              <span>{uploadError}</span>
              <button
                type="button"
                aria-label="Fermer l’erreur"
                onClick={() => setUploadError(null)}
              >
                <X className="size-4" />
              </button>
            </div>
          ) : null}
          {piece.images.length > 0 && selected ? (
            <p className="mt-3 truncate text-xs text-slate-400">
              {selected.originalName} · {formatBytes(selected.sizeBytes)}
            </p>
          ) : null}
        </CardContent>
      </Card>
      <AlertDialog
        open={Boolean(removeTarget)}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette photo ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le fichier sera retiré de la pièce. L’action restera visible dans l’historique de
              traçabilité.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => void removeImage()}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

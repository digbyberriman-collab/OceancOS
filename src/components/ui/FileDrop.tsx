"use client";

import { useCallback, useId, useRef, useState } from "react";
import { Upload, File as FileIcon, X, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type UploadedFile = {
  key: string;
  filename: string;
  contentType: string;
  size: number;
};

type Item = {
  id: string;
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
  key?: string;
};

/**
 * Drag-and-drop uploader.
 *
 * Asks the server to authorise each file, then sends it straight to storage.
 * Successful uploads are mirrored into hidden inputs named `name`, so the
 * surrounding server-action form receives them with no client state library.
 */
export function FileDrop({
  projectId,
  resource,
  resourceId,
  name = "attachments",
  maxBytes = 10 * 1024 * 1024,
  hint,
  onChange,
}: {
  projectId: string;
  resource: string;
  resourceId: string;
  name?: string;
  maxBytes?: number;
  hint?: string;
  onChange?: (files: UploadedFile[]) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const patch = useCallback((id: string, next: Partial<Item>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...next } : i)));
  }, []);

  const upload = useCallback(
    async (item: Item) => {
      patch(item.id, { status: "uploading", error: undefined });
      try {
        const signRes = await fetch("/api/uploads/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            resource,
            resourceId,
            filename: item.file.name,
            contentType: item.file.type || "application/octet-stream",
            size: item.file.size,
          }),
        });

        if (!signRes.ok) {
          const body = await signRes.json().catch(() => ({}));
          throw new Error(body.error ?? `Upload refused (${signRes.status})`);
        }

        const signed = await signRes.json();
        const putRes = await fetch(signed.url, {
          method: "PUT",
          headers: signed.headers,
          body: item.file,
        });
        if (!putRes.ok) throw new Error(`Storage rejected the file (${putRes.status})`);

        patch(item.id, { status: "done", key: signed.key });
      } catch (err) {
        patch(item.id, {
          status: "error",
          error: err instanceof Error ? err.message : "Upload failed",
        });
      }
    },
    [patch, projectId, resource, resourceId]
  );

  const add = useCallback(
    (files: FileList | null) => {
      if (!files?.length) return;
      const next: Item[] = [];
      for (const file of Array.from(files)) {
        const id = `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`;
        next.push(
          file.size > maxBytes
            ? {
                id,
                file,
                status: "error",
                error: `Larger than ${Math.round(maxBytes / 1024 / 1024)} MB`,
              }
            : { id, file, status: "pending" }
        );
      }
      setItems((prev) => [...prev, ...next]);
      next.filter((i) => i.status === "pending").forEach(upload);
    },
    [maxBytes, upload]
  );

  const remove = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const done = items.filter((i) => i.status === "done");
  // Report upward whenever the completed set changes.
  const doneKeys = done.map((i) => i.key).join(",");
  const lastReported = useRef("");
  if (onChange && doneKeys !== lastReported.current) {
    lastReported.current = doneKeys;
    onChange(
      done.map((i) => ({
        key: i.key!,
        filename: i.file.name,
        contentType: i.file.type || "application/octet-stream",
        size: i.file.size,
      }))
    );
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-xl border border-dashed px-4 py-6 text-center transition-colors",
          dragging ? "border-marine bg-marine/5" : "border-line-strong bg-ink-950/40"
        )}
      >
        <Upload className="mx-auto mb-2 h-5 w-5 text-faint" aria-hidden />
        <p className="text-sm text-muted">
          Drop files here, or{" "}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="font-medium text-accent-bright underline-offset-2 hover:underline"
          >
            browse
          </button>
        </p>
        <p className="mt-1 text-xs text-faint">
          {hint ?? `Photos, drawings and documents up to ${Math.round(maxBytes / 1024 / 1024)} MB each`}
        </p>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-2.5 rounded-lg border border-line-soft bg-ink-850/50 px-3 py-2 text-sm"
            >
              {item.status === "done" ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-ok" aria-hidden />
              ) : item.status === "error" ? (
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-bad" aria-hidden />
              ) : (
                <FileIcon className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden />
              )}

              <span className="min-w-0 flex-1 truncate text-white">{item.file.name}</span>

              <span className="shrink-0 text-xs text-faint tnum">
                {item.status === "uploading"
                  ? "Uploading…"
                  : item.status === "error"
                    ? item.error
                    : formatBytes(item.file.size)}
              </span>

              <button
                type="button"
                onClick={() => remove(item.id)}
                aria-label={`Remove ${item.file.name}`}
                className="shrink-0 rounded p-0.5 text-faint transition-colors hover:text-white"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>

              {item.status === "done" && item.key && (
                <input
                  type="hidden"
                  name={name}
                  value={JSON.stringify({
                    key: item.key,
                    filename: item.file.name,
                    contentType: item.file.type || "application/octet-stream",
                    size: item.file.size,
                  })}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

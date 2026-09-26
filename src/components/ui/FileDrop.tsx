"use client";

import { useCallback, useId, useRef, useState } from "react";
import { Upload, File as FileIcon, X, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// Selecting a folder's worth of drawings used to fire every upload at once —
// dozens of simultaneous PUTs racing the same connection pool and the same
// per-tab bandwidth (ACTION_PLAN.md G4.8, performance [uploads], Medium).
// Queued past this limit instead; each finished upload pulls the next one in.
const MAX_CONCURRENT_UPLOADS = 3;

export type UploadedFile = {
  key: string;
  filename: string;
  contentType: string;
  size: number;
};

type Item = {
  id: string;
  /** The live File, when this item is being uploaded in this session — the
   * only thing the upload request itself needs. Absent for an item
   * re-hydrated from `initialFiles`: the actual bytes are already in
   * storage, and every other field below is what's needed to display and
   * re-post it. */
  file?: File;
  filename: string;
  contentType: string;
  size: number;
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
  label = "Attachments",
  hint,
  onChange,
  initialFiles,
}: {
  projectId: string;
  resource: string;
  resourceId: string;
  name?: string;
  maxBytes?: number;
  /**
   * Accessible name for the file input. FileDrop renders several labelable
   * controls of its own (the file input, the browse button, a remove button
   * per file), so it can't rely on being implicitly wrapped in a single
   * surrounding <label> the way Input/Select/Textarea can — it names itself
   * instead (ACTION_PLAN.md G5.4).
   */
  label?: string;
  hint?: string;
  onChange?: (files: UploadedFile[]) => void;
  /**
   * Files already uploaded and referenced by this exact key in a previous
   * render — a validation failure elsewhere on the form redirected before
   * the create/comment that would have attached them, so this re-populates
   * the list (and the hidden inputs the server action reads) instead of
   * orphaning them (ACTION_PLAN.md G3.6). See lib/formFlash.ts.
   */
  initialFiles?: UploadedFile[];
}) {
  const [items, setItems] = useState<Item[]>(() =>
    (initialFiles ?? []).map((f) => ({
      id: f.key,
      filename: f.filename,
      contentType: f.contentType,
      size: f.size,
      status: "done" as const,
      key: f.key,
    }))
  );
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  // Nothing about an upload's progress or outcome was announced — a
  // screen-reader user who drops a file that turns out to be too large gets
  // no signal at all, and may submit believing it attached (ACTION_PLAN.md
  // G5.5, WCAG 4.1.3). `statusMsg` reports success through a polite live
  // region; `alertMsg` reports failure through an assertive one — kept as
  // two regions rather than switching one region's role, since role="alert"
  // already implies assertive delivery and mixing it with aria-live="polite"
  // on the same element is itself an anti-pattern found elsewhere in the app.
  const [statusMsg, setStatusMsg] = useState("");
  const [alertMsg, setAlertMsg] = useState("");

  const patch = useCallback((id: string, next: Partial<Item>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...next } : i)));
  }, []);

  const upload = useCallback(
    async (item: Item) => {
      const file = item.file!;
      patch(item.id, { status: "uploading", error: undefined });
      try {
        const signRes = await fetch("/api/uploads/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            resource,
            resourceId,
            filename: item.filename,
            contentType: item.contentType,
            size: item.size,
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
          body: file,
        });
        if (!putRes.ok) throw new Error(`Storage rejected the file (${putRes.status})`);

        patch(item.id, { status: "done", key: signed.key });
        setStatusMsg(`${item.filename} uploaded`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        patch(item.id, { status: "error", error: message });
        setAlertMsg(`${item.filename} rejected: ${message}`);
      }
    },
    [patch, projectId, resource, resourceId]
  );

  // A dropped folder can select dozens of files at once; only this many
  // upload in parallel; the rest wait in `queue` and each finished slot pulls
  // the next one in.
  const queue = useRef<Item[]>([]);
  const active = useRef(0);

  const drain = useCallback(() => {
    while (active.current < MAX_CONCURRENT_UPLOADS && queue.current.length > 0) {
      const item = queue.current.shift()!;
      active.current++;
      void upload(item).finally(() => {
        active.current--;
        drain();
      });
    }
  }, [upload]);

  const add = useCallback(
    (files: FileList | null) => {
      if (!files?.length) return;
      const next: Item[] = [];
      for (const file of Array.from(files)) {
        const id = `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`;
        const contentType = file.type || "application/octet-stream";
        next.push(
          file.size > maxBytes
            ? {
                id,
                file,
                filename: file.name,
                contentType,
                size: file.size,
                status: "error",
                error: `Larger than ${Math.round(maxBytes / 1024 / 1024)} MB`,
              }
            : { id, file, filename: file.name, contentType, size: file.size, status: "pending" }
        );
      }
      setItems((prev) => [...prev, ...next]);

      const oversized = next.filter((i) => i.status === "error");
      if (oversized.length) {
        setAlertMsg(oversized.map((i) => `${i.filename} rejected: ${i.error}`).join(". "));
      }

      queue.current.push(...next.filter((i) => i.status === "pending"));
      drain();
    },
    [maxBytes, drain]
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
        filename: i.filename,
        contentType: i.contentType,
        size: i.size,
      }))
    );
  }

  return (
    <div>
      <div role="status" aria-live="polite" className="sr-only">
        {statusMsg}
      </div>
      <div role="alert" className="sr-only">
        {alertMsg}
      </div>
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
          aria-label={label}
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

              <span className="min-w-0 flex-1 truncate text-white">{item.filename}</span>

              <span className="shrink-0 text-xs text-faint tnum">
                {item.status === "uploading"
                  ? "Uploading…"
                  : item.status === "error"
                    ? item.error
                    : formatBytes(item.size)}
              </span>

              <button
                type="button"
                onClick={() => remove(item.id)}
                aria-label={`Remove ${item.filename}`}
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
                    filename: item.filename,
                    contentType: item.contentType,
                    size: item.size,
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

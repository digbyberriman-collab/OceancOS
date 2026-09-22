import { cn } from "@/lib/utils";

export function Field({
  label,
  hint,
  error,
  children,
  className,
  as = "label",
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
  /**
   * "label" (default) implicitly associates `label` with the single
   * labelable control inside `children` — correct for Input/Select/Textarea,
   * but invalid HTML (and confusing to a screen reader) for something like
   * FileDrop that renders several labelable controls of its own (the file
   * input, the browse button, a remove button per file). Those pass
   * "fieldset": `label` becomes a <legend> grouping the controls instead of
   * a <label> wrapping them, and the control itself is responsible for its
   * own accessible name (ACTION_PLAN.md G5.4).
   */
  as?: "label" | "fieldset";
}) {
  const bodyContent = (
    <>
      {children}
      {hint && !error && <span className="text-xs text-muted mt-1 block">{hint}</span>}
      {error && <span className="text-xs text-bad mt-1 block">{error}</span>}
    </>
  );

  if (as === "fieldset") {
    return (
      <fieldset className={cn("block border-0 p-0 m-0 min-w-0", className)}>
        <legend className="label-base px-0">{label}</legend>
        {bodyContent}
      </fieldset>
    );
  }

  return (
    <label className={cn("block", className)}>
      <span className="label-base">{label}</span>
      {bodyContent}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("input-base", props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn("input-base min-h-[100px]", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn("input-base", props.className)} />;
}

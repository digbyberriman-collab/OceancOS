import { cloneElement, isValidElement, useId, type ReactElement } from "react";
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
  // ACTION_PLAN.md G5.5: hint and error used to render *inside* the <label>,
  // so they were concatenated into the control's accessible name instead of
  // exposed as a description or an error — a 30-word hint became the field's
  // entire name. Now they sit outside the label and reach the control only
  // through aria-describedby, and a validation error also sets
  // aria-invalid and gets role="alert" so it's announced as a validation
  // failure rather than silently changing the name.
  const hintId = useId();
  const errorId = useId();
  const describedBy = error ? errorId : hint ? hintId : undefined;

  const control =
    as === "label" && isValidElement(children)
      ? cloneElement(children as ReactElement<Record<string, unknown>>, {
          "aria-describedby": describedBy,
          "aria-invalid": error ? true : undefined,
        })
      : children;

  const description = (
    <>
      {hint && !error && (
        <span id={hintId} className="text-xs text-muted mt-1 block">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} role="alert" className="text-xs text-bad mt-1 block">
          {error}
        </span>
      )}
    </>
  );

  if (as === "fieldset") {
    return (
      <fieldset
        aria-describedby={describedBy}
        className={cn("block border-0 p-0 m-0 min-w-0", className)}
      >
        <legend className="label-base px-0">{label}</legend>
        {children}
        {description}
      </fieldset>
    );
  }

  return (
    <div className={cn("block", className)}>
      <label className="block">
        <span className="label-base">{label}</span>
        {control}
      </label>
      {description}
    </div>
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

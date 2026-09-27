"use client";

import { useFormStatus } from "react-dom";

/**
 * Every submit button in the app was a plain `<button type="submit">` with
 * no pending state (AUDIT_REPORT.md T7, forms-validation's [DOUBLE-SUBMIT]
 * finding) — the button stayed live and un-greyed for the whole round trip,
 * so a double click posted the form twice: two comments, two change orders
 * each with a full approval chain, two acceptance-code emails with the
 * first silently invalidated. ACTION_PLAN.md G3.3 made the sequence
 * allocator and a few other writes safe to race (a conflict or a no-op
 * rather than a duplicate or a crash), but the better fix is not letting
 * the second click happen at all — this is that fix, applied to every
 * server-action form in the app.
 *
 * `useFormStatus` only reports its form's pending state from a component
 * rendered *inside* that `<form>`, not from the component that renders the
 * `<form>` tag itself — hence this being its own component rather than a
 * hook called next to the form.
 */
export function SubmitButton({
  children,
  pendingText,
  className,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending || disabled}
      aria-busy={pending}
      {...props}
    >
      {pending ? (pendingText ?? children) : children}
    </button>
  );
}

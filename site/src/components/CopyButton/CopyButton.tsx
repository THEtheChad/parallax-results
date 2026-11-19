// A copy button that says it worked: "Copied ✓" for two seconds, announced to screen readers.

import { useEffect, useRef, useState } from "react";

export function CopyButton(props: { text: () => string; label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const settle = (s: "copied" | "failed") => {
    setState(s);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  };
  return (
    <>
      <button
        type="button"
        className={props.className ?? "btn small"}
        onClick={() => {
          const write = navigator.clipboard?.writeText(props.text());
          if (!write) return settle("failed");
          write.then(() => settle("copied"), () => settle("failed"));
        }}
      >
        {state === "copied" ? "Copied ✓" : state === "failed" ? "Select and copy" : (props.label ?? "Copy")}
      </button>
      <span className="sr-only" aria-live="polite">
        {state === "copied" ? "Copied" : state === "failed" ? "Could not copy; select the text instead" : ""}
      </span>
    </>
  );
}

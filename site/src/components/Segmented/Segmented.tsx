// Up to five choices as one row of roomy buttons (a segmented control), not a select: every choice
// is visible, and the current one is lit.

import { useId } from "react";

export interface Choice<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>(props: { label: string; value: T; choices: Choice<T>[]; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <div className="field">
      <span className="field-label" id={id}>
        {props.label}
      </span>
      <div className="segmented" role="group" aria-labelledby={id}>
        {props.choices.map((c) => (
          <button key={c.value} type="button" aria-pressed={c.value === props.value} onClick={() => props.onChange(c.value)}>
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

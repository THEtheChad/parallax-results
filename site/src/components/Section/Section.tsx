// A section in the house style: a numbered rule with a neon script word, like the profile's
// "01 — about". The word is the section's h2; script never carries numbers or controls.

import type { ReactNode } from "react";

export function Section(props: { n: string; word: string; aside?: ReactNode; sub?: ReactNode; id?: string; children: ReactNode }) {
  return (
    <section className="section" id={props.id} aria-labelledby={props.id ? `${props.id}-h` : undefined}>
      <header className="sec-head">
        <span className="n">{props.n}</span>
        <span className="dash" aria-hidden="true" />
        <h2 id={props.id ? `${props.id}-h` : undefined}>{props.word}</h2>
        <span className="rule" aria-hidden="true" />
        {props.aside ? <span className="aside">{props.aside}</span> : null}
      </header>
      {props.sub ? <p className="sec-sub">{props.sub}</p> : null}
      {props.children}
    </section>
  );
}

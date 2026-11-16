import { useEffect, useRef, useState } from "react";

type StepRef = { id: string; title: string };

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Scrolls to a section of the scenario editor and moves keyboard focus into it. */
export function jumpTo(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
  const field = target.querySelector<HTMLElement>("input, select, textarea");
  // Focus without a second scroll; the smooth scroll above already positions the section.
  (field ?? target).focus({ preventScroll: true });
}

export const stepAnchor = (stepId: string) => `step-${stepId}`;

/**
 * Sticky in-page navigation for the long scenario form: definition, steps, and one chip per step.
 * The current section is highlighted from scroll position.
 */
export function EditorNav({ steps }: { steps: StepRef[] }) {
  const [active, setActive] = useState("editor-definition");
  const ids = ["editor-definition", ...steps.map((s) => stepAnchor(s.id))];
  const key = ids.join("|");
  // After a click the chosen section stays current while the page scrolls (short pages cannot scroll it to the top).
  const lockedUntil = useRef(0);
  const go = (id: string) => {
    lockedUntil.current = Date.now() + 900;
    setActive(id);
    jumpTo(id);
  };

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      if (Date.now() < lockedUntil.current) return;
      // The current section is the last one whose top edge has passed the sticky navigation.
      let current = "editor-definition";
      for (const id of key.split("|")) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 140) current = id;
      }
      setActive(current);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    // Capture phase so scrolling inside any container (the page shell or the window) is seen.
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [key]);

  return (
    <nav className="editor-nav" aria-label="أقسام المحرر">
      <button type="button" aria-current={active === "editor-definition" ? "true" : undefined} onClick={() => go("editor-definition")}>
        تعريف الاختبار
      </button>
      <span className="editor-nav-label" aria-hidden="true">
        الخطوات
      </span>
      <ol>
        {steps.map((step, index) => {
          const anchor = stepAnchor(step.id);
          return (
            <li key={step.id}>
              <button type="button" aria-current={active === anchor ? "true" : undefined} aria-label={`الانتقال إلى الخطوة ${index + 1}${step.title ? `: ${step.title}` : ""}`} title={step.title || `الخطوة ${index + 1}`} onClick={() => go(anchor)}>
                {index + 1}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { toggleGroup, useGSAP } from "../motion";

/**
 * Progressive-disclosure group: collapsed by default, expands with a short
 * height tween (instant under reduced motion). Content is unmounted when closed.
 */
export function Disclosure({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const scope = useRef<HTMLDivElement>(null);
  const { contextSafe } = useGSAP({ scope });
  useGSAP(() => {
    if (open && body.current) return toggleGroup(body.current, true);
  }, { scope, dependencies: [open] });
  const toggle = contextSafe(() => {
    if (!open) {
      setMounted(true);
      setOpen(true);
    } else {
      setOpen(false);
      if (body.current) toggleGroup(body.current, false, () => setMounted(false));
      else setMounted(false);
    }
  });
  return (
    <div ref={scope} className="disclosure">
      <button type="button" className="disclosure-toggle" aria-expanded={open} onClick={toggle}>
        <ChevronDown size={17} aria-hidden className={open ? "open" : ""} />
        <span>{title}{hint && <small>{hint}</small>}</span>
      </button>
      {mounted && <div ref={body} className="disclosure-body">{children}</div>}
    </div>
  );
}

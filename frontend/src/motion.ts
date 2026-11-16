import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

/** Offsets follow the reading direction: RTL content enters from the right. */
const dir = () => (document.documentElement.dir === "rtl" ? 1 : -1);
const mobile = "(max-width: 767px)";
const calm = "(prefers-reduced-motion: reduce)";

export function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia(calm).matches;
}

/**
 * Fade + a small RTL-aware slide for a freshly rendered block. Content is
 * visible before this runs; under reduced motion nothing is moved or faded.
 */
export function enterBlock(target: gsap.TweenTarget, onDone?: () => void) {
  const mm = gsap.matchMedia();
  mm.add(
    { motion: `(prefers-reduced-motion: no-preference)`, small: mobile },
    (context) => {
      const { small } = context.conditions as { small: boolean };
      gsap.fromTo(
        target,
        { opacity: 0, x: dir() * (small ? 8 : 16) },
        { opacity: 1, x: 0, duration: small ? 0.16 : 0.2, ease: "power2.out", clearProps: "transform,opacity", onComplete: onDone },
      );
    },
  );
  mm.add(calm, () => {
    onDone?.();
  });
  return () => mm.revert();
}

/** Slide a side panel in from the inline end (the left edge in RTL). */
export function enterPanel(panel: Element, backdrop?: Element | null) {
  const mm = gsap.matchMedia();
  mm.add(
    { motion: "(prefers-reduced-motion: no-preference)", small: mobile },
    (context) => {
      const { small } = context.conditions as { small: boolean };
      if (backdrop) gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.18, clearProps: "opacity" });
      gsap.fromTo(
        panel,
        small ? { yPercent: 8, opacity: 0 } : { xPercent: -dir() * 6, opacity: 0 },
        { xPercent: 0, yPercent: 0, opacity: 1, duration: 0.22, ease: "power2.out", clearProps: "transform,opacity" },
      );
    },
  );
  return () => mm.revert();
}

/** Short confirmation pulse for a saved/imported state. */
export function confirmPulse(target: gsap.TweenTarget) {
  const mm = gsap.matchMedia();
  mm.add("(prefers-reduced-motion: no-preference)", () => {
    gsap.fromTo(target, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.2, ease: "power2.out", clearProps: "transform,opacity" });
  });
  return () => mm.revert();
}

/** Smooth width change for a progress bar fill. */
export function tweenProgress(target: gsap.TweenTarget, percent: number) {
  const mm = gsap.matchMedia();
  mm.add("(prefers-reduced-motion: no-preference)", () => {
    gsap.to(target, { width: `${percent}%`, duration: 0.24, ease: "power1.out" });
  });
  mm.add(calm, () => {
    gsap.set(target, { width: `${percent}%` });
  });
  return () => mm.revert();
}

/** Open/close a group of advanced fields with a height tween. */
export function toggleGroup(content: HTMLElement, open: boolean, done?: () => void) {
  const mm = gsap.matchMedia();
  mm.add("(prefers-reduced-motion: no-preference)", () => {
    if (open) {
      gsap.fromTo(content, { height: 0, opacity: 0 }, { height: "auto", opacity: 1, duration: 0.2, ease: "power1.out", clearProps: "height,opacity", onComplete: done });
    } else {
      gsap.to(content, { height: 0, opacity: 0, duration: 0.16, ease: "power1.in", onComplete: done });
    }
  });
  mm.add(calm, () => done?.());
  return () => mm.revert();
}

export { gsap, useGSAP };

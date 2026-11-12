/*
 * Thmanyah typefaces (ثمانية) — the project's primary fonts. The owner confirmed
 * on 2026-11-12 that TestPilot is permitted to use and include them; the licence
 * text shipped inside the font files is kept next to them (LICENSE-thmanyah.txt).
 * Files live in src/assets/fonts/thmanyah/ and Vite bundles them with hashed
 * names. The glob keeps the app working (Noto Sans Arabic fallback) if a file is
 * ever missing.
 */
const files = import.meta.glob<string>("./assets/fonts/thmanyah/*.woff2", {
  eager: true,
  query: "?url",
  import: "default",
});

type Face = { family: string; weight: number; file: string };

// Weights verified from each file's OS/2 usWeightClass (thmanyah fonts v1.003).
const faces: Face[] = [
  { family: "Thmanyah Sans", weight: 300, file: "thmanyahsans-Light.woff2" },
  { family: "Thmanyah Sans", weight: 400, file: "thmanyahsans-Regular.woff2" },
  { family: "Thmanyah Sans", weight: 500, file: "thmanyahsans-Medium.woff2" },
  { family: "Thmanyah Sans", weight: 700, file: "thmanyahsans-Bold.woff2" },
  { family: "Thmanyah Sans", weight: 900, file: "thmanyahsans-Black.woff2" },
  { family: "Thmanyah Serif Display", weight: 700, file: "thmanyahserifdisplay-Bold.woff2" },
  { family: "Thmanyah Serif Display", weight: 900, file: "thmanyahserifdisplay-Black.woff2" },
];

const urlFor = (file: string) => files[`./assets/fonts/thmanyah/${file}`];

const css = faces
  .filter((face) => urlFor(face.file))
  .map(
    (face) =>
      `@font-face{font-family:"${face.family}";src:url("${urlFor(face.file)}") format("woff2");font-weight:${face.weight};font-style:normal;font-display:swap;}`,
  )
  .join("\n");

export const brandFontsAvailable = css !== "";

if (brandFontsAvailable && !document.getElementById("testpilot-fonts")) {
  const style = document.createElement("style");
  style.id = "testpilot-fonts";
  style.textContent = css;
  document.head.prepend(style);
}
document.documentElement.dataset.fonts = brandFontsAvailable ? "thmanyah" : "fallback";

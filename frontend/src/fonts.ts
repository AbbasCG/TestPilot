/*
 * Thmanyah typefaces (ثمانية). Licence: embedding in web applications is allowed
 * only as part of a bundled product; redistributing or hosting the font files
 * (including in a public Git repository) is not. The .woff2 files therefore live
 * in the git-ignored folder src/assets/fonts/thmanyah/ on each licensed machine
 * (download them from https://font.thmanyah.com). Vite bundles them with hashed
 * names at build time. When the folder is empty the glob below returns nothing
 * and the interface falls back to the bundled Noto Sans Arabic (OFL).
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

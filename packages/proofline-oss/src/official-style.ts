const OFFICIAL_STYLE_ATTRIBUTE = "data-auraone-official-style";

export function installOfficialStyleSheet(
  url: string | null | undefined,
  documentRef: Document | undefined = typeof document === "undefined"
    ? undefined
    : document,
): HTMLLinkElement | null {
  const normalizedUrl = url?.trim();
  if (!normalizedUrl || !documentRef) return null;

  const existing = documentRef.head.querySelector<HTMLLinkElement>(
    `link[${OFFICIAL_STYLE_ATTRIBUTE}]`,
  );
  if (existing) return existing;

  const link = documentRef.createElement("link");
  link.rel = "stylesheet";
  link.href = normalizedUrl;
  link.crossOrigin = "anonymous";
  link.setAttribute(OFFICIAL_STYLE_ATTRIBUTE, "pending");

  link.addEventListener(
    "load",
    () => {
      link.setAttribute(OFFICIAL_STYLE_ATTRIBUTE, "loaded");
      documentRef.documentElement.dataset.auraoneOfficialStyle = "loaded";
    },
    { once: true },
  );
  link.addEventListener(
    "error",
    () => {
      link.setAttribute(OFFICIAL_STYLE_ATTRIBUTE, "failed");
      documentRef.documentElement.dataset.auraoneOfficialStyle = "failed";
    },
    { once: true },
  );

  documentRef.head.append(link);
  return link;
}

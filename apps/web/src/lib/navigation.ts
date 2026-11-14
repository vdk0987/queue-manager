export interface RedirectLocation {
  pathname: string;
  search?: string;
  hash?: string;
}

/** Prevents open redirects and loops back into the auth screens. */
export function getSafeRedirect(from?: RedirectLocation | null): string {
  if (!from || !from.pathname.startsWith("/")) {
    return "/";
  }

  if (from.pathname === "/login" || from.pathname === "/register") {
    return "/";
  }

  return `${from.pathname}${from.search ?? ""}${from.hash ?? ""}`;
}

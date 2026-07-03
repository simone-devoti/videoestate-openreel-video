import { useState, useEffect, useCallback, useMemo } from "react";

export type AppRoute =
  | "welcome"
  | "editor"
  | "new"
  | "templates"
  | "recent"
  | "share";

export interface RouteParams {
  dimensions?: string;
  preset?: string;
  width?: string;
  height?: string;
  fps?: string;
  tab?: string;
  shareId?: string;
  mediaUrl?: string;
}

export interface RouterState {
  route: AppRoute;
  params: RouteParams;
}

const VALID_ROUTES: AppRoute[] = [
  "welcome",
  "editor",
  "new",
  "templates",
  "recent",
  "share",
];

function isRouteParam(key: string): key is keyof RouteParams {
  return [
    "dimensions",
    "preset",
    "width",
    "height",
    "fps",
    "tab",
    "shareId",
    "mediaUrl",
  ].includes(key);
}

function parseQueryString(queryString: string): RouteParams {
  const params: RouteParams = {};
  if (!queryString) return params;

  const searchParams = new URLSearchParams(queryString);
  searchParams.forEach((value, key) => {
    if (isRouteParam(key)) {
      params[key] = value;
    }
  });
  return params;
}

function mergeRouteParams(
  ...sources: RouteParams[]
): RouteParams {
  return Object.assign({}, ...sources);
}

function parseHash(hash: string): RouterState {
  const cleanHash = hash.replace(/^#\/?/, "");
  const queryIndex = cleanHash.indexOf("?");
  const path = queryIndex === -1 ? cleanHash : cleanHash.slice(0, queryIndex);
  const queryString =
    queryIndex === -1 ? "" : cleanHash.slice(queryIndex + 1);

  const params = parseQueryString(queryString);

  const pathParts = path.split("/");
  let route: AppRoute = (pathParts[0] || "welcome") as AppRoute;

  if (route === "share" && pathParts[1]) {
    params.shareId = pathParts[1];
  }

  return {
    route: VALID_ROUTES.includes(route) ? route : "welcome",
    params,
  };
}

/** Parse hash route plus `?query` on the page URL (before `#`). */
export function parseAppLocation(
  location: Pick<Location, "hash" | "search" | "pathname"> = window.location,
): RouterState {
  const hashState = parseHash(location.hash);
  const searchParams = parseQueryString(location.search.replace(/^\?/, ""));

  const pathnameSegment = location.pathname.replace(/^\/+/, "").split("/")[0];
  const pathnameRoute = VALID_ROUTES.includes(pathnameSegment as AppRoute)
    ? (pathnameSegment as AppRoute)
    : null;

  // Hash route wins when set; pathname hints apply when hash is empty/welcome.
  let route = hashState.route;
  if (
    pathnameRoute &&
    (hashState.route === "welcome" || !location.hash.replace(/^#\/?/, ""))
  ) {
    route = pathnameRoute;
  }

  const params = mergeRouteParams(hashState.params, searchParams);

  return { route, params };
}

export function pathnameImpliesNewProject(
  location: Pick<Location, "pathname"> = window.location,
): boolean {
  const segment = location.pathname.replace(/^\/+/, "").split("/")[0];
  return segment === "new";
}

function buildHash(route: AppRoute, params?: RouteParams): string {
  let hash = `#/${route}`;

  if (params && Object.keys(params).length > 0) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.set(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      hash += `?${queryString}`;
    }
  }

  return hash;
}

export function useRouter() {
  const [state, setState] = useState<RouterState>(() => {
    if (typeof window !== "undefined") {
      return parseAppLocation();
    }
    return { route: "welcome", params: {} };
  });

  useEffect(() => {
    const syncLocation = () => {
      setState(parseAppLocation());
    };

    window.addEventListener("hashchange", syncLocation);
    window.addEventListener("popstate", syncLocation);
    return () => {
      window.removeEventListener("hashchange", syncLocation);
      window.removeEventListener("popstate", syncLocation);
    };
  }, []);

  const navigate = useCallback((route: AppRoute, params?: RouteParams) => {
    const hash = buildHash(route, params);
    const searchParams = new URLSearchParams(window.location.search);
    if (params) {
      for (const key of Object.keys(params) as (keyof RouteParams)[]) {
        searchParams.delete(key);
      }
    }
    const search = searchParams.toString();
    const path =
      window.location.pathname.replace(/^\/+/, "").split("/")[0] === "new"
        ? "/"
        : window.location.pathname;
    const url = `${path}${search ? `?${search}` : ""}${hash}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== url) {
      window.history.replaceState(null, "", url);
    } else {
      window.location.hash = hash;
    }
    setState(parseAppLocation());
  }, []);

  const updateParams = useCallback(
    (newParams: Partial<RouteParams>) => {
      const hash = buildHash(state.route, { ...state.params, ...newParams });
      window.location.hash = hash;
    },
    [state.route, state.params],
  );

  const clearParams = useCallback(() => {
    const hash = buildHash(state.route);
    window.location.hash = hash;
  }, [state.route]);

  const parsedDimensions = useMemo(() => {
    const { dimensions, width, height } = state.params;

    if (dimensions) {
      const match = dimensions.match(/^(\d+)x(\d+)$/i);
      if (match) {
        return {
          width: parseInt(match[1], 10),
          height: parseInt(match[2], 10),
        };
      }
    }

    if (width && height) {
      return { width: parseInt(width, 10), height: parseInt(height, 10) };
    }

    return null;
  }, [state.params]);

  const fps = useMemo(() => {
    const { fps } = state.params;
    if (fps) {
      const parsed = parseInt(fps, 10);
      if (!isNaN(parsed) && parsed > 0 && parsed <= 120) {
        return parsed;
      }
    }
    return 30;
  }, [state.params]);

  return {
    route: state.route,
    params: state.params,
    navigate,
    updateParams,
    clearParams,
    parsedDimensions,
    fps,
  };
}

/** Read `mediaUrl` from hash query or page `?query` (decoded). */
export function getMediaUrlFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  return parseAppLocation().params.mediaUrl?.trim() || null;
}

/** @deprecated Use getMediaUrlFromLocation */
export function getMediaUrlFromHash(): string | null {
  return getMediaUrlFromLocation();
}

export { parseHash };

/** Remove a single query param from hash and page search. */
export function clearRouteParam(key: keyof RouteParams): void {
  const { route, params } = parseAppLocation();
  const nextParams = { ...params };
  delete nextParams[key];

  const searchParams = new URLSearchParams(window.location.search);
  searchParams.delete(key);
  const search = searchParams.toString();

  const path =
    window.location.pathname.replace(/^\/+/, "").split("/")[0] === "new"
      ? "/"
      : window.location.pathname;
  const hash = buildHash(
    route,
    Object.keys(nextParams).length > 0 ? nextParams : undefined,
  );
  window.history.replaceState(null, "", `${path}${search ? `?${search}` : ""}${hash}`);
}

export function generateShareableLink(
  route: AppRoute,
  params?: RouteParams,
): string {
  const baseUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}`
      : "";
  return `${baseUrl}${buildHash(route, params)}`;
}

export function generateNewProjectLink(options: {
  width?: number;
  height?: number;
  preset?: string;
  fps?: number;
}): string {
  const params: RouteParams = {};

  if (options.preset) {
    params.preset = options.preset;
  } else if (options.width && options.height) {
    params.dimensions = `${options.width}x${options.height}`;
  }

  if (options.fps && options.fps !== 30) {
    params.fps = String(options.fps);
  }

  return generateShareableLink("new", params);
}

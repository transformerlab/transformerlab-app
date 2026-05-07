import endpointsJson from './allEndpoints.json';

// Resolve the API base URL. Always returns a string ending with '/'.
//
// Order of resolution:
//   1. process.env.TL_API_URL (build-time, baked in by webpack). May be a full
//      URL ('https://api.example.com/') or a path-only prefix ('/lab/').
//   2. window.location-derived default — same origin as the frontend, with
//      the SPA mount sub-path preserved (e.g. served at /tlab/ → /tlab/),
//      so reverse-proxy path-prefix deployments work without TL_API_URL.
//      Local dev (localhost / 127.0.0.1 / port 1212) falls back to :8338.
//
// Sub-path preservation relies on HashRouter — pathname stays at the original
// SPA mount and only the hash changes during client-side navigation.
export function deriveApiBaseUrl(): string {
  const envUrl = process.env?.TL_API_URL;
  if (envUrl && envUrl !== 'default' && envUrl.trim() !== '') {
    let url = envUrl.trim();
    if (!url.endsWith('/')) url += '/';
    return url;
  }

  const { protocol, hostname, port, pathname } = window.location;

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:8338/`;
  }
  if (port === '1212') {
    return `${protocol}//${hostname}:8338/`;
  }

  // Trim pathname back to the last '/' so /tlab/index.html and /tlab/ both
  // resolve to /tlab/, and / stays /. HashRouter never modifies pathname,
  // so this captures the SPA mount even after in-app navigation.
  const lastSlash = pathname.lastIndexOf('/');
  const basePath = lastSlash >= 0 ? pathname.slice(0, lastSlash + 1) : '/';

  const isDefaultHttpPort = port === '' || port === '80';
  const isDefaultHttpsPort = port === '' || port === '443';
  const isDefaultPort =
    (protocol === 'http:' && isDefaultHttpPort) ||
    (protocol === 'https:' && isDefaultHttpsPort);

  const host = isDefaultPort ? hostname : `${hostname}:${port}`;
  return `${protocol}//${host}${basePath}`;
}

export function API_URL() {
  const raw = (window as any).TransformerLab?.API_URL || null;
  if (!raw) return null;
  let base = String(raw);
  // Strip any hash fragments (e.g., from HashRouter URLs)
  if (base.includes('#')) base = base.split('#')[0];
  // Ensure trailing slash for safe concatenation
  if (!base.endsWith('/')) base = base + '/';
  return base;
}

export function INFERENCE_SERVER_URL() {
  return window.TransformerLab?.inferenceServerURL || API_URL();
}

export function FULL_PATH(path: string) {
  if (API_URL() === null) {
    return null;
  }
  return API_URL() + path;
}

type Endpoint = {
  method: string;
  path: string;
};

type Endpoints = {
  [key: string]: {
    [key: string]: Endpoint;
  };
};

const endpoints: Endpoints = endpointsJson;

// A function that takes a major entity (e.g. "experiment"),
// and a path array (e.g. ["tasks", "apple"]),
// and returns the full path (e.g. "tasks/1/anystring/apple")
// based on the definition of the path in the endpoints.json file.
export function getPath(
  majorEntity: string,
  pathArray: string[],
  params: Record<string, any>,
): string {
  // Step 1: Get major entity from the endpoints object:
  const majorEntityObject = endpoints[majorEntity];
  if (!majorEntityObject) {
    throw new Error(`Major entity ${majorEntity} not found`);
  }

  // Step 2: Traverse the pathArray to find the path:
  let endpoint: any = majorEntityObject;
  endpoint = pathArray.reduce((current, key) => {
    if (!current[key]) {
      throw new Error(`Path ${pathArray.join('/')} not found`);
    }
    return current[key];
  }, endpoint);

  // Step 3: Replace placeholders in the path with values from params:
  let { path } = endpoint;
  Object.entries(params).forEach(([key, value]) => {
    // Convert boolean values to lowercase strings for FastAPI compatibility
    const stringValue =
      typeof value === 'boolean' ? String(value).toLowerCase() : String(value);
    path = path.replace(`{${key}}`, stringValue);
  });

  // Step 4: Return the full path:
  return `${path}`;
}

export function getAPIFullPath(
  majorEntity: string,
  pathArray: string[],
  params: Record<string, any>,
): string {
  const base = API_URL();
  if (!base) {
    // Defer until API base is known; callers like useSWR accept nulls
    return null as any;
  }
  const path = getPath(majorEntity, pathArray, params);
  return `${base}${path}`;
}

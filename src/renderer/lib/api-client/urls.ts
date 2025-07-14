import endpointsJson from './allEndpoints.json';

export function API_URL() {
  return window.TransformerLab?.API_URL || null;
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
function getPath(
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
    path = path.replace(`{${key}}`, value);
  });

  // Step 4: Return the full path:
  return `${path}`;
}

export function getAPIFullPath(
  majorEntity: string,
  pathArray: string[],
  params: Record<string, any>,
): string {
  const path = getPath(majorEntity, pathArray, params);
  return `${API_URL()}${path}`;
}

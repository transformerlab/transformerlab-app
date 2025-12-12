// Extracted from src/renderer/lib/api-client/urls.ts for CLI use
import endpointsJson from '../../src/renderer/lib/api-client/allEndpoints.json';

type Endpoint = {
  method: string;
  path: string;
};

type Endpoints = {
  [key: string]: {
    [key: string]: Endpoint;
  };
};

const endpoints: Endpoints = endpointsJson as any;

export function getPath(
  majorEntity: string,
  pathArray: string[],
  params: Record<string, any>,
): string {
  const majorEntityObject = endpoints[majorEntity];
  if (!majorEntityObject) {
    throw new Error(`Major entity ${majorEntity} not found`);
  }

  let endpoint: any = majorEntityObject;
  endpoint = pathArray.reduce((current, key) => {
    if (!current[key]) {
      throw new Error(`Path ${pathArray.join('/')} not found`);
    }
    return current[key];
  }, endpoint);

  let { path } = endpoint;
  Object.entries(params).forEach(([key, value]) => {
    path = path.replace(`{${key}}`, value);
  });

  return `${path}`;
}

export function handleError(error: any): { message: string; detail?: string } {
  if (error.response?.data) {
    const data = error.response.data;
    return {
      message: data.message || data.info?.message || 'Unknown Error',
      detail: data.detail || data.info?.detail,
    };
  }

  if (error.message) {
    return { message: error.message };
  }

  return { message: String(error) };
}

import endpointsJson from './endpoints.json';
import useSWR from 'swr';

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

const apiUrl = 'http://localhost:3000/api';

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

function getFullPath(
  majorEntity: string,
  pathArray: string[],
  params: Record<string, any>,
): string {
  const path = getPath(majorEntity, pathArray, params);
  return `${apiUrl}${path}`;
}

// Test the function
// console.log(getPath('tasks', ['fake'], { id: 1, anything: 'apple' })); // Should log: tasks/1/anystring/apple
// console.log(getPath('tasks', ['get'], { id: 1, anything: 'apple' })); // Should log: tasks/1/anystring/apple
// console.log(getPath('tasks', ['getAll'], {})); // Should log: tasks/list
// console.log(getPath('tasks', ['create'], {})); // Should log: tasks
// // console.log(getPath('monkey', ['delete'], { id: 1 })); // Should throw an error: Major entity monkey not found
// console.log(getFullPath('tasks', ['get'], { id: 1, anything: 'apple' })); // Should log: http://localhost:3000/api/tasks/1/anystring/apple
// console.log(getFullPath('tasks', ['getAll'], {})); // Should log: http://localhost:3000/api/tasks/list

// Now generate a useSWR function that takes a major entity and a path array,
// and returns a useSWR function that fetches the data from the API
// and returns the data, error, and isLoading state.
// The function should also take an optional params object that will be passed to the getPath function
// and used to generate the path.
// The function should use it's own fetcher function to fetch the data from the API.

export default function useAPI(
  majorEntity: string,
  pathArray: string[],
  params: Record<string, any> = {},
  options: any = {},
) {
  const path = getFullPath(majorEntity, pathArray, params);
  const fetcher = (url: string) => fetch(url).then((res) => res.json());

  const { data, error, isValidating } = useSWR(path, fetcher, {
    ...options,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  return {
    data,
    error,
    isLoading: !error && !data && isValidating,
  };
}

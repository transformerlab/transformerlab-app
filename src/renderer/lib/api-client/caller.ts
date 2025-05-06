import endpointsJson from './endpoints.json';

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
console.log(getPath('tasks', ['fake'], { id: 1, anything: 'apple' })); // Should log: tasks/1/anystring/apple
console.log(getPath('tasks', ['get'], { id: 1, anything: 'apple' })); // Should log: tasks/1/anystring/apple
console.log(getPath('tasks', ['getAll'], {})); // Should log: tasks/list
console.log(getPath('tasks', ['create'], {})); // Should log: tasks
// console.log(getPath('monkey', ['delete'], { id: 1 })); // Should throw an error: Major entity monkey not found
console.log(getFullPath('tasks', ['get'], { id: 1, anything: 'apple' })); // Should log: http://localhost:3000/api/tasks/1/anystring/apple
console.log(getFullPath('tasks', ['getAll'], {})); // Should log: http://localhost:3000/api/tasks/list

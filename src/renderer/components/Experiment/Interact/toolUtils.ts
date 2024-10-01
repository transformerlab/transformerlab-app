/**
 * callTool - calls the Tools API and returns the result
 * TODO: Move to the SDK?
 *
 * @param function_name String with name of tool to call
 * @param arguments Object with named arguments to be passed to tool
 * @returns A JSON object with fields status, error and data.
 */
export async function callTool(
  function_name: String,
  function_args: Object = {}
) {
  const arg_string = JSON.stringify(function_args);
  console.log(`Calling Function: ${function_name}`);
  console.log(`with arguments ${arg_string}`);

  const response = await fetch(
    chatAPI.Endpoints.Tools.Call(function_name, arg_string)
  );
  const result = await response.json();
  console.log(result);
  return result;
}

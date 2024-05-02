export const Steps = [
  'CHECK_IF_INSTALLED',
  'CHECK_VERSION',
  'CHECK_IF_CONDA_INSTALLED',
  'CHECK_IF_CONDA_ENVIRONMENT_EXISTS',
  'CHECK_IF_PYTHON_DEPENDENCIES_INSTALLED',
  'CHECK_IF_SERVER_RUNNING_ON_PORT_8000',
  'CHECK_FOR_IMPORTANT_PLUGINS',
] as const;
export type Step = (typeof Steps)[number];

export function isStep(value: any): value is Step {
  return Steps.includes(value as Step);
}

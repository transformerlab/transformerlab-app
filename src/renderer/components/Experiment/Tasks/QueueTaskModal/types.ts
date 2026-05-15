export type ParameterType =
  | 'int'
  | 'integer'
  | 'float'
  | 'number'
  | 'bool'
  | 'boolean'
  | 'enum'
  | 'string';

type UIWidgetType =
  | 'slider'
  | 'range'
  | 'switch'
  | 'radio'
  | 'password'
  | 'select'
  | 'lab_model_select'
  | 'lab_dataset_select';

export interface ParameterSchema {
  type?: ParameterType;
  default?: any;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  enum?: string[];
  ui_widget?: UIWidgetType;
  title?: string;
  required?: boolean;
}

export interface ProcessedParameter {
  key: string;
  value: any;
  schema: ParameterSchema | null;
  isShorthand: boolean;
}

export type ProviderResourceGroup = {
  id: string;
  name: string;
  cpus?: string;
  memory?: string;
  disk_space?: string;
  accelerators?: string;
  num_nodes?: string;
};

export type SlurmFlag = { id: string; value: string };

export interface ResourceInputs {
  cpus: string;
  memory: string;
  diskSpace: string;
  accelerators: string;
  numNodes: string;
  minutesRequested: string;
}

export interface TriggerConfig {
  trigger_type: string;
  is_enabled: boolean;
}

export interface TriggerBlueprint {
  trigger_type: string;
  name: string;
  description: string;
}

export interface Workflow {
  id: string;
  name: string;
  status?: string;
  config?: string;
  trigger_configs?: TriggerConfig[];
  experiment_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface WorkflowDetails extends Workflow {
  trigger_configs: TriggerConfig[];
} 
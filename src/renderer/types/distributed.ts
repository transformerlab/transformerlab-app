export interface Machine {
  id: string;
  name: string;
  host: string;
  port: number;
  status: 'online' | 'offline' | 'busy';
  capabilities: {
    gpu_count: number;
    gpu_memory: number;
    cpu_count: number;
    memory: number;
    disk_space: number;
  };
  current_load: {
    cpu_usage: number;
    memory_usage: number;
    gpu_usage: number[];
  };
}

export interface DistributedTrainingConfig {
  plugin_name: string;
  config: any; // existing training config
  resource_requirements: {
    num_machines: number;
    gpus_per_machine?: number;
    min_gpu_memory?: number;
  };
  machine_selection: 'auto' | 'manual';
  selected_machines?: string[]; // machine IDs if manual selection
}

export interface DistributedJobStatus {
  job_id: string;
  status: 'planning' | 'dispatching' | 'running' | 'completed' | 'failed';
  world_size: number;
  nodes: {
    machine_id: string;
    rank: number;
    status: 'pending' | 'running' | 'completed' | 'failed';
    start_time?: string;
    end_time?: string;
    progress?: number;
  }[];
  master_addr: string;
  master_port: number;
}

export interface DistributedPreferences {
  preferred_machines: string[];
  default_num_machines: number;
  default_gpus_per_machine: number;
  auto_machine_selection: boolean;
}

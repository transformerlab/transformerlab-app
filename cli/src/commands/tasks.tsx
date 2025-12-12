import { useState, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { api } from '../api';
import { getGitContext, loadLabConfig, LabConfig } from '../utils';
import { Loading, ErrorMsg, SuccessMsg, Logo, Panel } from '../ui';
import { GenericList } from './list_commands';

export const TaskList = () => (
  <GenericList
    fetcher={() => api.listTasks()}
    columns={['id', 'name', 'type']}
    labelMap={{ id: 'ID', name: 'Name', type: 'Type' }}
    noTruncate={['id']}
  />
);
export const TaskGallery = () => (
  <GenericList
    fetcher={() => api.getTaskGallery()}
    columns={['id', 'name', 'description']}
    labelMap={{ id: 'ID', name: 'Task', description: 'Desc' }}
  />
);

export const TaskInfo = ({ taskId }: { taskId: string }) => {
  const { exit } = useApp();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    let isMounted = true;
    api.getTask(taskId).then((d) => {
      if (isMounted) {
        setData(d);
        exit();
      }
    });
    return () => {
      isMounted = false;
    };
  }, [taskId, exit]);

  if (!data) return <Loading text="Fetching details..." />;
  return (
    <Box flexDirection="column">
      <Panel title={`Task: ${data.name}`}>
        <Text>Repo: {data.repo}</Text>
        <Text>
          Branch: {data.branch} @ {data.commit}
        </Text>
      </Panel>
      <Text dimColor>{JSON.stringify(data, null, 2)}</Text>
    </Box>
  );
};

interface TaskAddProps {
  path?: string;
  repo?: string;
  branch?: string;
}

type AddStep =
  | 'INIT'
  | 'DIRTY_CHECK'
  | 'CONFIRM_CONTEXT'
  | 'EXPERIMENT_SELECT'
  | 'SUBTYPE_SELECT'
  | 'PROVIDER_SELECT'
  | 'SUBMITTING'
  | 'SUCCESS'
  | 'ERROR';

export const TaskAdd = ({ path: targetPath, repo, branch }: TaskAddProps) => {
  const { exit } = useApp();
  const [step, setStep] = useState<AddStep>('INIT');

  const [git, setGit] = useState<any>(null);
  const [config, setConfig] = useState<LabConfig | null>(null);
  const [providers, setProviders] = useState<any[]>([]);
  const [experiments, setExperiments] = useState<any[]>([]);

  const [selectedExperiment, setSelectedExperiment] =
    useState<string>('global');
  const [selectedSubtype, setSelectedSubtype] = useState<string>('generic');
  const [selectedProvider, setSelectedProvider] = useState<string>('');

  const [error, setError] = useState<string | null>(null);
  const [privateRepoWarn, setPrivateRepoWarn] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const analyzeContext = async () => {
      try {
        const gitContext = await getGitContext(targetPath || '.');
        const provs = await api.listProviders();
        const exps = await api.listExperiments();
        const labConfig = loadLabConfig(targetPath || '.');

        if (!isMounted) return;

        setConfig(labConfig);

        if (repo) gitContext.repo = repo;
        if (branch) gitContext.branch = branch;
        setGit(gitContext);

        if (
          gitContext.repo &&
          (gitContext.repo.startsWith('git@') ||
            !gitContext.repo.includes('github.com'))
        ) {
          setPrivateRepoWarn(true);
        }

        setProviders(provs || []);
        setExperiments(Array.isArray(exps) ? exps : (exps as any)?.data || []);

        if (provs && provs.length > 0) {
          setSelectedProvider(provs[0].id);
        }

        if (gitContext.dirty) {
          setStep('DIRTY_CHECK');
        } else {
          setStep('CONFIRM_CONTEXT');
        }
      } catch (e: any) {
        if (!isMounted) return;
        setError(e.message);
        setStep('ERROR');
      }
    };

    analyzeContext();

    return () => {
      isMounted = false;
    };
  }, [targetPath, repo, branch]);

  const submitTask = async () => {
    setStep('SUBMITTING');
    try {
      const taskName =
        config?.name ||
        git.repo.split('/').pop().replace('.git', '') ||
        'my-task';
      const taskId = taskName.toLowerCase().replace(/[^a-z0-9-_]/g, '-');

      // FIX: Cast to 'any' to avoid TS errors for properties missing in LabConfig interface
      const taskConfig = (config?.config || {}) as any;

      // 1. Construct Nested Config (Resources & Provider)
      const selectedProviderName =
        providers.find((p) => p.id === selectedProvider)?.name || '';

      const backendConfig = {
        cluster_name: taskConfig.cluster_name || '',
        command: taskConfig.command || '',
        cpus: taskConfig.cpus ? String(taskConfig.cpus) : undefined,
        memory: taskConfig.memory ? String(taskConfig.memory) : undefined,
        disk_space: taskConfig.disk_space
          ? String(taskConfig.disk_space)
          : undefined,
        accelerators:
          taskConfig.accelerators || taskConfig.gpu_count
            ? String(taskConfig.accelerators || taskConfig.gpu_count)
            : undefined,
        num_nodes: taskConfig.num_nodes || undefined,
        setup: taskConfig.setup || undefined,
        env_vars: taskConfig.env_vars || undefined,
        file_mounts: taskConfig.file_mounts || undefined,
        provider_id: selectedProvider,
        provider_name: selectedProviderName,
        subtype: selectedSubtype,
      };

      // 2. Construct Full Payload matching 'Remote Orchestrator' schema
      const payload = {
        name: taskName,
        type: 'REMOTE', // Required
        inputs: {}, // Required
        outputs: {}, // Required
        plugin: 'remote_orchestrator', // Required
        remote_task: true,
        experiment_id: selectedExperiment,

        config: backendConfig, // Nested Config

        repo: git.repo,
        branch: git.branch,
        commit: git.sha, // Backend expects 'commit' for SHA

        // Extra metadata that might be useful
        git_repo_dir: git.dir,
        parameters: config?.parameters || {},
      };

      await api.createTask(taskId, taskName, payload);
      setStep('SUCCESS');
      setTimeout(() => exit(), 2000);
    } catch (e: any) {
      setError(api.handleError(e).message);
      setStep('ERROR');
    }
  };

  if (step === 'INIT') return <Loading text="Analyzing directory..." />;

  if (step === 'DIRTY_CHECK') {
    return (
      <Box flexDirection="column">
        <Panel title="⚠️  Uncommitted Changes Detected" color="yellow">
          <Text>
            You have changes to the current branch that you haven't pushed.
          </Text>
          <Text>
            Proceeding will run the task against the last committed SHA.
          </Text>
        </Panel>
        <Text bold>Continue? </Text>
        <SelectInput
          items={[
            { label: 'Yes, use last commit', value: 'yes' },
            { label: 'No, cancel', value: 'no' },
          ]}
          onSelect={(item) =>
            item.value === 'yes' ? setStep('CONFIRM_CONTEXT') : exit()
          }
        />
      </Box>
    );
  }

  if (step === 'CONFIRM_CONTEXT') {
    return (
      <Box flexDirection="column">
        <Panel title="Verify Task Context" color="blue">
          <Text>Repo: {git.repo || 'Local (No Remote)'}</Text>
          <Text>
            Branch: {git.branch} @ {git.sha.slice(0, 7)}
          </Text>
          <Text>
            Config: {config ? 'Found lab.json' : 'None (Using defaults)'}
          </Text>
        </Panel>
        {privateRepoWarn && (
          <Text color="yellow">
            ⚠ Private Repo: Ensure server has Git keys.
          </Text>
        )}
        <Text bold>Register this task?</Text>
        <SelectInput
          items={[
            { label: 'Yes', value: 'yes' },
            { label: 'No', value: 'no' },
          ]}
          onSelect={(item) =>
            item.value === 'yes' ? setStep('EXPERIMENT_SELECT') : exit()
          }
        />
      </Box>
    );
  }

  if (step === 'EXPERIMENT_SELECT') {
    const items = experiments.map((e: any) => ({ label: e.name, value: e.id }));
    items.unshift({ label: 'Global (No Experiment)', value: 'global' });

    return (
      <Box flexDirection="column">
        <Text bold>Select Experiment:</Text>
        <SelectInput
          items={items}
          onSelect={(item) => {
            setSelectedExperiment(item.value);
            setStep('SUBTYPE_SELECT');
          }}
        />
      </Box>
    );
  }

  if (step === 'SUBTYPE_SELECT') {
    const items = [
      { label: 'Generic (General Tasks tab)', value: 'generic' },
      { label: 'Training (Training tab)', value: 'train' },
      { label: 'Evaluation (Evaluation tab)', value: 'eval' },
      { label: 'Generation (Generation tab)', value: 'generate' },
    ];

    return (
      <Box flexDirection="column">
        <Text bold>Select Task Type:</Text>
        <SelectInput
          items={items}
          onSelect={(item) => {
            setSelectedSubtype(item.value);
            setStep('PROVIDER_SELECT');
          }}
        />
      </Box>
    );
  }

  if (step === 'PROVIDER_SELECT') {
    if (providers.length === 0)
      return (
        <Box flexDirection="column">
          <ErrorMsg
            text="No Providers"
            detail="Configure a compute provider in settings."
          />
        </Box>
      );

    const items = providers.map((p: any) => ({ label: p.name, value: p.id }));

    return (
      <Box flexDirection="column">
        <Text bold>Select Default Compute Provider:</Text>
        <SelectInput
          items={items}
          onSelect={(item) => {
            setSelectedProvider(item.value);
            submitTask();
          }}
        />
      </Box>
    );
  }

  if (step === 'SUBMITTING') return <Loading text="Registering task..." />;

  if (step === 'SUCCESS') {
    const displayName =
      config?.name ||
      git.repo.split('/').pop()?.replace('.git', '') ||
      'new-task';
    return (
      <Box flexDirection="column">
        <SuccessMsg text="Task successfully added!" />
        <Text>
          ID: <Text bold>{displayName}</Text>
        </Text>
      </Box>
    );
  }

  if (step === 'ERROR') return <ErrorMsg text="Error" detail={error || ''} />;

  return null;
};

interface TaskRunProps {
  taskName: string;
  cliParams: Record<string, any>;
}

export const TaskRun = ({ taskName, cliParams }: TaskRunProps) => {
  const { exit } = useApp();
  const [status, setStatus] = useState<
    'FETCHING' | 'VALIDATING' | 'RUNNING' | 'SUCCESS' | 'ERROR'
  >('FETCHING');

  const [errorObj, setErrorObj] = useState<{
    message: string;
    detail?: string;
  } | null>(null);
  const [jobId, setJobId] = useState<string>('');

  useEffect(() => {
    let isMounted = true;

    const executeRun = async () => {
      try {
        const task = await api.getTask(taskName);
        if (!isMounted) return;

        if (!task) throw new Error(`Task '${taskName}' not found.`);

        const definedParams = task.parameters || {};
        const finalParams: Record<string, any> = {};

        if (isMounted) setStatus('VALIDATING');

        for (const [key, schema] of Object.entries(definedParams) as [
          string,
          any,
        ][]) {
          const userValue = cliParams[key];

          if (userValue === undefined) {
            if (schema.default !== undefined) {
              finalParams[key] = schema.default;
            } else {
              throw new Error(`Missing required parameter: --${key}`);
            }
          } else {
            if (schema.type === 'integer' && isNaN(parseInt(userValue, 10))) {
              throw new Error(`Parameter --${key} must be an integer.`);
            }
            finalParams[key] = userValue;
          }
        }

        if (isMounted) setStatus('RUNNING');
        const result: any = await api.queueTask(taskName, finalParams);

        if (!isMounted) return;

        if (result.status === 'success') {
          setJobId(result.job_id);
          setStatus('SUCCESS');
          setTimeout(() => {
            if (isMounted) exit();
          }, 2500);
        } else {
          throw new Error(result.message || 'Failed to queue job.');
        }
      } catch (e: any) {
        if (!isMounted) return;
        const err = api.handleError(e);
        setErrorObj(err);
        setStatus('ERROR');
      }
    };

    executeRun();

    return () => {
      isMounted = false;
    };
  }, [taskName, cliParams, exit]);

  if (status === 'FETCHING')
    return <Loading text={`Looking up task '${taskName}'...`} />;
  if (status === 'VALIDATING')
    return <Loading text="Validating parameters..." />;
  if (status === 'RUNNING') return <Loading text="Triggering run..." />;

  if (status === 'SUCCESS') {
    return (
      <Box flexDirection="column">
        <SuccessMsg text="Job Queued Successfully!" />
        <Text>
          Job ID:{' '}
          <Text bold color="cyan">
            {jobId}
          </Text>
        </Text>
        <Text dimColor>Monitor with: lab job info {jobId}</Text>
      </Box>
    );
  }

  if (status === 'ERROR') {
    return (
      <Box flexDirection="column">
        <ErrorMsg text="Run Failed" />
        <Panel title="Error Details" color="red">
          <Text bold color="white">
            {errorObj?.message}
          </Text>
          {errorObj?.detail && (
            <Box marginTop={1}>
              <Text>{errorObj.detail}</Text>
            </Box>
          )}
        </Panel>
        <Box marginTop={1}>
          <Text dimColor>
            Tip: Verify your Compute Provider ID and API URL.
          </Text>
        </Box>
      </Box>
    );
  }

  return null;
};

export const TaskDelete = ({ taskId }: { taskId?: string }) => {
  const { exit } = useApp();
  const [input, setInput] = useState(taskId || '');
  const [step, setStep] = useState<
    'INPUT' | 'CONFIRM' | 'CONFIRM_ALL' | 'DELETING' | 'SUCCESS' | 'ERROR'
  >('INPUT');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (taskId) {
      if (taskId === '.') setStep('CONFIRM_ALL');
      else setStep('CONFIRM');
    }
  }, [taskId]);

  const handleDelete = async () => {
    setStep('DELETING');
    try {
      if (input === '.') {
        await api.deleteAllTasks();
      } else {
        await api.deleteTask(input);
      }
      setStep('SUCCESS');
      setTimeout(() => exit(), 2000);
    } catch (e: any) {
      setError(api.handleError(e).message);
      setStep('ERROR');
      setTimeout(() => exit(), 3000);
    }
  };

  const handleInputSubmit = (val: string) => {
    if (val === '.') setStep('CONFIRM_ALL');
    else setStep('CONFIRM');
  };

  if (step === 'INPUT') {
    return (
      <Box flexDirection="column">
        <Text bold color="red">
          Delete Task
        </Text>
        <Text>
          Enter Task ID (or <Text bold> . </Text> to delete all):
        </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={() => handleInputSubmit(input)}
        />
      </Box>
    );
  }

  if (step === 'CONFIRM') {
    const items = [
      { label: 'No, Cancel', value: 'no' },
      { label: 'Yes, Delete Task', value: 'yes' },
    ];
    return (
      <Box flexDirection="column">
        <Panel title="Confirm Delete" color="red">
          <Text>
            Delete task: <Text bold>{input}</Text>?
          </Text>
        </Panel>
        <SelectInput
          items={items}
          onSelect={(item) => {
            if (item.value === 'yes') handleDelete();
            else exit();
          }}
        />
      </Box>
    );
  }

  if (step === 'CONFIRM_ALL') {
    const items = [
      { label: 'No, Cancel', value: 'no' },
      { label: 'Yes, DELETE ALL', value: 'yes' },
    ];
    return (
      <Box flexDirection="column">
        <Panel title="⚠️  DANGER ZONE ⚠️" color="red">
          <Text bold>You are about to delete ALL tasks.</Text>
          <Text>This cannot be undone.</Text>
        </Panel>
        <SelectInput
          items={items}
          onSelect={(item) => {
            if (item.value === 'yes') handleDelete();
            else exit();
          }}
        />
      </Box>
    );
  }

  if (step === 'DELETING')
    return (
      <Loading
        text={input === '.' ? 'Deleting all tasks...' : 'Deleting task...'}
      />
    );

  if (step === 'SUCCESS') {
    const msg =
      input === '.' ? 'All tasks deleted.' : 'Task deleted successfully.';
    return (
      <Box flexDirection="column">
        <SuccessMsg text={msg} />
      </Box>
    );
  }

  if (step === 'ERROR') return <ErrorMsg text="Delete Failed" detail={error} />;

  return null;
};

export const InstallFromGallery = () => {
  const { exit } = useApp();
  const [items, setItems] = useState<any[]>([]);
  const [step, setStep] = useState<
    'LOADING_LIST' | 'SELECT' | 'INSTALLING' | 'SUCCESS' | 'ERROR'
  >('LOADING_LIST');
  const [error, setError] = useState<string>('');
  const [selectedName, setSelectedName] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    api
      .getTaskGallery()
      .then((data) => {
        if (!isMounted) return;
        const galleryItems = (
          Array.isArray(data) ? data : (data as any).data || []
        ).map((t: any) => ({
          label: `${t.name} - ${t.description?.slice(0, 40)}...`,
          value: t.id || t.name,
        }));

        if (galleryItems.length === 0) {
          setError('No items found in the public gallery.');
          setStep('ERROR');
        } else {
          setItems(galleryItems);
          setStep('SELECT');
        }
      })
      .catch((e) => {
        if (!isMounted) return;
        setError(api.handleError(e).message);
        setStep('ERROR');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleInstall = async (item: any) => {
    setSelectedName(item.label);
    setStep('INSTALLING');
    try {
      await api.installTaskFromGallery(item.value);
      setStep('SUCCESS');
      setTimeout(() => exit(), 2000);
    } catch (e: any) {
      setError(api.handleError(e).message);
      setStep('ERROR');
    }
  };

  if (step === 'LOADING_LIST') return <Loading text="Fetching Gallery..." />;

  if (step === 'SELECT') {
    return (
      <Box flexDirection="column">
        <Text bold>Select a Task to Install:</Text>
        <SelectInput items={items} onSelect={handleInstall} limit={10} />
      </Box>
    );
  }

  if (step === 'INSTALLING')
    return <Loading text={`Installing ${selectedName}...`} />;
  if (step === 'SUCCESS')
    return (
      <Box flexDirection="column">
        <SuccessMsg text="Task installed to your library." />
      </Box>
    );
  if (step === 'ERROR')
    return <ErrorMsg text="Install Failed" detail={error} />;

  return null;
};

export const ExportToGallery = () => {
  const { exit } = useApp();
  const [tasks, setTasks] = useState<any[]>([]);
  const [step, setStep] = useState<
    'LOADING_LIST' | 'SELECT' | 'EXPORTING' | 'SUCCESS' | 'ERROR'
  >('LOADING_LIST');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    api
      .listTasks()
      .then((data) => {
        if (!isMounted) return;
        const taskList = (
          Array.isArray(data) ? data : (data as any).data || []
        ).map((t: any) => ({
          label: t.name,
          value: t.id,
        }));

        if (taskList.length === 0) {
          setError('No local tasks found to export.');
          setStep('ERROR');
        } else {
          setTasks(taskList);
          setStep('SELECT');
        }
      })
      .catch((e) => {
        if (!isMounted) return;
        setError(api.handleError(e).message);
        setStep('ERROR');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleExport = async (item: any) => {
    setStep('EXPORTING');
    try {
      await api.exportTaskToGallery(item.value);
      setStep('SUCCESS');
      setTimeout(() => exit(), 2000);
    } catch (e: any) {
      setError(api.handleError(e).message);
      setStep('ERROR');
    }
  };

  if (step === 'LOADING_LIST') return <Loading text="Loading your tasks..." />;

  if (step === 'SELECT') {
    return (
      <Box flexDirection="column">
        <Text bold>Select a Task to Export to Local Gallery:</Text>
        <SelectInput items={tasks} onSelect={handleExport} limit={10} />
      </Box>
    );
  }

  if (step === 'EXPORTING') return <Loading text="Exporting..." />;
  if (step === 'SUCCESS')
    return (
      <Box flexDirection="column">
        <SuccessMsg text="Task exported successfully." />
      </Box>
    );
  if (step === 'ERROR') return <ErrorMsg text="Export Failed" detail={error} />;

  return null;
};

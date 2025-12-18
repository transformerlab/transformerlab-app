import { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { api } from '../lib/api';
import { Loading, ErrorMsg, Panel } from '../components/ui';
import { GenericList } from './list_commands';
import Table from '../ink-table';

export const TaskList = () => (
  <GenericList
    fetcher={() => api.listTasks()}
    columns={['id', 'name', 'type']}
    labelMap={{ id: 'ID', name: 'Name', type: 'Type' }}
    noTruncate={['id']}
  />
);

export const TaskGallery = () => {
  const [items, setItems] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getTaskGallery()
      .then((res) => {
        const raw = Array.isArray(res) ? res : (res as any).data || [];

        const mapped = raw.map((t: any) => ({
          Task: t.title,

          // Description
          Desc: t.description
            ? t.description.length > 50
              ? t.description.substring(0, 47) + '...'
              : t.description
            : '',
        }));
        setItems(mapped);
      })
      .catch((e) => {
        setError(e.message);
      });
  }, []);

  if (error) return <ErrorMsg text="Gallery Error" detail={error} />;
  if (!items) return <Loading text="Fetching Task Gallery..." />;

  if (items.length === 0) {
    return (
      <Box flexDirection="column">
        <Text>No tasks found in gallery.</Text>
      </Box>
    );
  }

  return (
    <>
      <Text bold color="cyan">
        Task Gallery
      </Text>

      <Table data={items} />
      {/* <Text dimColor>
        To install a task run:{' '}
        <Text bold color="white">
          lab task install [ID]
        </Text>
      </Text> */}
    </>
  );
};

export const TaskInfo = ({ taskId }: { taskId: string }) => {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    api.getTask(taskId).then((d) => {
      setData(d);
    });
  }, [taskId]);

  if (!data)
    return <Loading text={`Fetching task details for task ${taskId}`} />;

  const repo = data.repo || data.config?.github_repo_url || 'Local / N/A';

  const branch = data.branch || data.config?.github_branch || 'HEAD'; // Defaults to HEAD if not stored

  const commit =
    data.commit || data.config?.commit || data.config?.github_sha || '';

  return (
    <Box flexDirection="column">
      <Panel title={`Task: ${data.name}`}>
        <Text>
          Repo: <Text color="green">{repo}</Text>
        </Text>
        <Text>
          Branch: <Text color="yellow">{branch}</Text>{' '}
          {commit ? `@ ${commit.slice(0, 7)}` : ''}
        </Text>
        {/* Show Directory if it exists and isn't root */}
        {data.config?.github_directory && (
          <Text>Dir: {data.config.github_directory}</Text>
        )}
      </Panel>
      <Text dimColor>{JSON.stringify(data, null, 2)}</Text>
    </Box>
  );
};

// interface GitContext {
//   repo?: string;
//   branch?: string;
//   sha?: string;
//   dirty?: boolean;
//   dir?: string; // Absolute path to git root
// }

// interface TaskAddProps {
//   path?: string;
//   repo?: string;
//   branch?: string;
// }

// // Helper function to normalize GitHub URLs to HTTPS format
// function normalizeGitHubUrl(repoUrl: string): string {
//   if (!repoUrl) return '';

//   // Convert SSH format to HTTPS
//   // git@github.com:user/repo.git -> https://github.com/user/repo
//   if (repoUrl.startsWith('git@github.com:')) {
//     return repoUrl
//       .replace('git@github.com:', 'https://github.com/')
//       .replace(/\.git$/, '');
//   }

//   // Remove .git suffix from HTTPS URLs
//   if (repoUrl.startsWith('https://github.com/')) {
//     return repoUrl.replace(/\.git$/, '');
//   }

//   return repoUrl;
// }

// export const TaskAdd = ({
//   path: targetPath = '.',
//   repo: repoArg,
//   branch: branchArg,
// }: TaskAddProps) => {
//   const { exit } = useApp();
//   const [step, setStep] = useState<string>('INIT');

//   const [git, setGit] = useState<GitContext>({});
//   const [config, setConfig] = useState<any>(null);
//   const [providers, setProviders] = useState<any[]>([]);
//   const [experiments, setExperiments] = useState<any[]>([]);

//   const [subDirectory, setSubDirectory] = useState<string>('');
//   const [selectedExperiment, setSelectedExperiment] =
//     useState<string>('global');
//   const [selectedSubtype, setSelectedSubtype] = useState<string>('generic');
//   const [selectedProvider, setSelectedProvider] = useState<string>('');

//   const [error, setError] = useState<string | null>(null);
//   const [privateRepoWarn, setPrivateRepoWarn] = useState(false);

//   useEffect(() => {
//     let isMounted = true;

//     const analyzeContext = async () => {
//       try {
//         // 1. Resolve Target Path
//         const resolvedPath = path.resolve(process.cwd(), targetPath);

//         // 2. Fetch Data
//         const [gitContext, provs, exps] = await Promise.all([
//           getGitContext(resolvedPath),
//           api.listProviders(),
//           api.listExperiments(),
//         ]);

//         const labConfig = loadLTaskConfig(resolvedPath);

//         if (!isMounted) return;

//         setConfig(labConfig);

//         const finalGit = { ...gitContext };
//         if (repoArg) finalGit.repo = repoArg;
//         if (branchArg) finalGit.branch = branchArg;

//         // Calculate subdirectory relative to git root
//         let relativeDir = '';
//         if (finalGit.dir) {
//           // getGitContext may return an incorrect dir, so let's find the actual git root
//           let gitRoot = finalGit.dir;

//           // Walk up from the resolved path to find .git directory
//           let currentPath = resolvedPath;
//           while (currentPath !== path.dirname(currentPath)) {
//             if (fs.existsSync(path.join(currentPath, '.git'))) {
//               gitRoot = currentPath;
//               break;
//             }
//             currentPath = path.dirname(currentPath);
//           }

//           const targetDir = path.resolve(resolvedPath);
//           relativeDir = path.relative(gitRoot, targetDir);

//           // Normalize to use forward slashes for consistency
//           relativeDir = relativeDir.split(path.sep).join('/');

//           // Only clear if it's explicitly the current directory marker
//           if (relativeDir === '.') {
//             relativeDir = '';
//           }

//           // If path goes backwards, something is wrong
//           if (relativeDir.startsWith('..')) {
//             relativeDir = '';
//           }
//         }

//         setSubDirectory(relativeDir);
//         setGit(finalGit);

//         if (
//           finalGit.repo &&
//           (finalGit.repo.startsWith('git@') ||
//             !finalGit.repo.includes('github.com'))
//         ) {
//           setPrivateRepoWarn(true);
//         }

//         setProviders(provs || []);
//         setExperiments(Array.isArray(exps) ? exps : (exps as any)?.data || []);

//         if (provs && provs.length > 0) {
//           setSelectedProvider(provs[0].id);
//         }

//         if (finalGit.dirty) {
//           setStep('DIRTY_CHECK');
//         } else {
//           setStep('CONFIRM_CONTEXT');
//         }
//       } catch (e: any) {
//         if (!isMounted) return;
//         setError(e.message || 'Unknown error');
//         setStep('ERROR');
//       }
//     };

//     analyzeContext();

//     return () => {
//       isMounted = false;
//     };
//   }, [targetPath, repoArg, branchArg]);

//   const submitTask = async () => {
//     setStep('SUBMITTING');
//     try {
//       // Determine Task Name
//       const taskName =
//         config?.name ||
//         (subDirectory ? subDirectory.split('/').pop() : null) ||
//         (git.repo ? git.repo.split('/').pop()?.replace('.git', '') : null) ||
//         'my-task';

//       const taskId = taskName.toLowerCase().replace(/[^a-z0-9-_]/g, '-');

//       // Extract config from labConfig - it can be at root level or nested
//       const userConfig = config?.config || config || {};

//       const selectedProviderObj = providers.find(
//         (p) => p.id === selectedProvider,
//       );

//       // Construct backend config from user's task.json
//       const backendConfig = {
//         cluster_name: userConfig.cluster_name || taskId,
//         command: userConfig.command || '',
//         cpus: userConfig.cpus ? String(userConfig.cpus) : undefined,
//         memory: userConfig.memory ? String(userConfig.memory) : undefined,
//         disk_space: userConfig.disk_space
//           ? String(userConfig.disk_space)
//           : undefined,
//         accelerators:
//           userConfig.accelerators || userConfig.gpu_count
//             ? String(userConfig.accelerators || userConfig.gpu_count)
//             : undefined,
//         num_nodes: userConfig.num_nodes || undefined,
//         setup: userConfig.setup || undefined,
//         env_vars: userConfig.env_vars || undefined,
//         provider_id: selectedProvider,
//         provider_name: selectedProviderObj?.name || 'rig',
//         github_enabled: true,
//         github_repo_url: normalizeGitHubUrl(git.repo || ''),
//         github_directory: subDirectory || undefined,
//       };

//       const payload = {
//         name: taskName,
//         type: 'REMOTE',
//         inputs: {},
//         outputs: {},
//         plugin: 'remote_orchestrator',
//         remote_task: true,
//         experiment_id: selectedExperiment,
//         config: backendConfig,
//       };

//       await api.createTask(taskId, taskName, payload);
//       setStep('SUCCESS');
//       setTimeout(() => exit(), 2000);
//     } catch (e: any) {
//       setError(api.handleError(e).message);
//       setStep('ERROR');
//     }
//   };

//   // --- RENDER ---
//   if (step === 'INIT') return <Loading text="Analyzing directory..." />;

//   if (step === 'DIRTY_CHECK') {
//     return (
//       <Box flexDirection="column">
//         <Panel title="⚠️  Uncommitted Changes Detected" color="yellow">
//           <Text>Changes detected. Using last commit:</Text>
//           <Text dimColor>SHA: {git.sha?.slice(0, 7)}</Text>
//         </Panel>
//         <Text bold>Continue? </Text>
//         <SelectInput
//           items={[
//             { label: 'Yes', value: 'yes' },
//             { label: 'No', value: 'no' },
//           ]}
//           onSelect={(item) =>
//             item.value === 'yes' ? setStep('CONFIRM_CONTEXT') : exit()
//           }
//         />
//       </Box>
//     );
//   }

//   if (step === 'CONFIRM_CONTEXT') {
//     const isRepoMissing = !git.repo;
//     const displayDir = subDirectory ? subDirectory : './ (Root)';

//     return (
//       <Box flexDirection="column">
//         <Panel title="Verify Task Context" color="blue">
//           <Box flexDirection="column">
//             <Text>
//               Repo:{' '}
//               <Text color={isRepoMissing ? 'red' : 'green'}>
//                 {git.repo || 'MISSING'}
//               </Text>
//             </Text>
//             <Text>
//               Branch: <Text color="green">{git.branch || 'HEAD'}</Text>
//             </Text>
//             <Text>
//               Dir:{' '}
//               <Text color="green" bold>
//                 {displayDir}
//               </Text>
//             </Text>
//             <Text>
//               Config: {config ? 'Found config' : 'None (Using defaults)'}
//             </Text>
//           </Box>
//         </Panel>

//         {privateRepoWarn && (
//           <Text color="yellow">
//             ⚠ Private Repo: Ensure cluster has git credentials.
//           </Text>
//         )}

//         {isRepoMissing && (
//           <Text color="red" bold>
//             Warning: No remote repository detected.
//           </Text>
//         )}

//         <Text bold>Register this task?</Text>
//         <SelectInput
//           items={[
//             { label: 'Yes', value: 'yes' },
//             { label: 'No', value: 'no' },
//           ]}
//           onSelect={(item) =>
//             item.value === 'yes' ? setStep('EXPERIMENT_SELECT') : exit()
//           }
//         />
//       </Box>
//     );
//   }

//   if (step === 'EXPERIMENT_SELECT') {
//     const items = experiments.map((e: any) => ({ label: e.name, value: e.id }));
//     items.unshift({ label: 'Global (No Experiment)', value: 'global' });
//     return (
//       <Box flexDirection="column">
//         <Text bold>Select Experiment:</Text>
//         <SelectInput
//           items={items}
//           onSelect={(item) => {
//             setSelectedExperiment(item.value);
//             setStep('SUBTYPE_SELECT');
//           }}
//         />
//       </Box>
//     );
//   }

//   if (step === 'SUBTYPE_SELECT') {
//     const items = [
//       { label: 'Generic (General Tasks tab)', value: 'generic' },
//       { label: 'Training (Training tab)', value: 'train' },
//       { label: 'Evaluation (Evaluation tab)', value: 'eval' },
//       { label: 'Generation (Generation tab)', value: 'generate' },
//     ];
//     return (
//       <Box flexDirection="column">
//         <Text bold>Select Task Type:</Text>
//         <SelectInput
//           items={items}
//           onSelect={(item) => {
//             setSelectedSubtype(item.value);
//             setStep('PROVIDER_SELECT');
//           }}
//         />
//       </Box>
//     );
//   }

//   if (step === 'PROVIDER_SELECT') {
//     if (providers.length === 0)
//       return (
//         <ErrorMsg text="No Providers" detail="Configure a provider first." />
//       );
//     return (
//       <Box flexDirection="column">
//         <Text bold>Select Compute Provider:</Text>
//         <SelectInput
//           items={providers.map((p: any) => ({ label: p.name, value: p.id }))}
//           onSelect={(item) => {
//             setSelectedProvider(item.value);
//             submitTask();
//           }}
//         />
//       </Box>
//     );
//   }

//   if (step === 'SUBMITTING') return <Loading text="Registering task..." />;
//   if (step === 'SUCCESS') return <SuccessMsg text="Task successfully added!" />;
//   if (step === 'ERROR') return <ErrorMsg text="Error" detail={error || ''} />;

//   return null;
// };

// interface TaskRunProps {
//   taskName: string;
//   cliParams: Record<string, any>;
// }

// export const TaskRun = ({ taskName, cliParams }: TaskRunProps) => {
//   const { exit } = useApp();

//   const [step, setStep] = useState<
//     'INIT' | 'SELECT_PROVIDER' | 'RUNNING' | 'SUCCESS' | 'ERROR'
//   >('INIT');

//   const [loadingMsg, setLoadingMsg] = useState('Initializing...');
//   const [errorObj, setErrorObj] = useState<{
//     message: string;
//     detail?: string;
//   } | null>(null);

//   const [task, setTask] = useState<any>(null);
//   const [providers, setProviders] = useState<any[]>([]);
//   const [jobId, setJobId] = useState<string>('');

//   useEffect(() => {
//     let isMounted = true;

//     const initRun = async () => {
//       try {
//         setLoadingMsg(`Fetching task '${taskName}'...`);
//         const taskData = await api.getTask(taskName);
//         if (!isMounted) return;

//         if (!taskData) throw new Error(`Task '${taskName}' not found.`);
//         setTask(taskData);

//         if (taskData.type === 'REMOTE' || taskData.remote_task) {
//           setLoadingMsg('Fetching compute providers...');
//           const provs = await api.listProviders();

//           if (!isMounted) return;
//           if (!provs || provs.length === 0) {
//             throw new Error(
//               'No compute providers found. Please configure one in Settings first.',
//             );
//           }

//           setProviders(provs);
//           setStep('SELECT_PROVIDER');
//         } else {
//           await runLocalTask(taskData);
//         }
//       } catch (e: any) {
//         if (!isMounted) return;
//         const err = api.handleError(e);
//         setErrorObj(err);
//         setStep('ERROR');
//       }
//     };

//     initRun();
//     return () => {
//       isMounted = false;
//     };
//   }, []);

//   const prepareCommandWithOverrides = (baseCommand: string, params: any) => {
//     let cmd = baseCommand || '';
//     if (params && Object.keys(params).length > 0) {
//       const flags = Object.entries(params)
//         .map(([k, v]) => `--${k}=${v}`)
//         .join(' ');
//       cmd = `${cmd} ${flags}`;
//     }
//     return cmd;
//   };

//   const runLocalTask = async (taskData: any) => {
//     setLoadingMsg('Queuing local task...');
//     setStep('RUNNING');

//     const result: any = await api.queueTask(
//       taskData.name || taskName,
//       cliParams,
//     );

//     if (result.status === 'success' || result.job_id) {
//       setJobId(result.job_id);
//       setStep('SUCCESS');
//       setTimeout(() => exit(), 2500);
//     } else {
//       throw new Error(result.message || 'Failed to queue job.');
//     }
//   };

//   const handleProviderSelect = async (item: any) => {
//     const provider = providers.find((p) => p.id === item.value);
//     if (!provider) return;

//     setStep('RUNNING');
//     setLoadingMsg(`Launching on ${provider.name}...`);

//     try {
//       const config = task.config || {};
//       const cmd = prepareCommandWithOverrides(config.command, cliParams);

//       const payload = {
//         experiment_id: task.experiment_id || 'global',
//         task_name: task.name,
//         cluster_name: config.cluster_name || `cluster-${task.name}`,
//         command: cmd,
//         subtype: config.subtype || 'generic',
//         cpus: config.cpus ? String(config.cpus) : undefined,
//         memory: config.memory ? String(config.memory) : undefined,
//         disk_space: config.disk_space ? String(config.disk_space) : undefined,
//         accelerators:
//           config.accelerators || config.gpu_count
//             ? String(config.accelerators || config.gpu_count)
//             : undefined,
//         num_nodes: config.num_nodes || 1,
//         setup: config.setup,
//         env_vars: config.env_vars || {},
//         file_mounts: config.file_mounts || {},

//         provider_name: provider.name,

//         github_enabled: true,
//         github_repo_url: task.repo || task.git_repo_url,
//         github_branch: task.branch || task.git_branch,
//         github_sha: task.commit || task.git_sha,
//         github_directory: task.git_repo_dir || config.git_repo_dir,
//       };

//       const res: any = await api.launchTask(provider.id, payload);

//       if (res.job_id) {
//         setJobId(res.job_id);
//         setStep('SUCCESS');
//         setTimeout(() => exit(), 2500);
//       } else {
//         throw new Error('Launch successful but no Job ID returned.');
//       }
//     } catch (e: any) {
//       const err = api.handleError(e);
//       setErrorObj(err);
//       setStep('ERROR');
//     }
//   };

//   if (step === 'INIT' || step === 'RUNNING') {
//     return <Loading text={loadingMsg} />;
//   }

//   if (step === 'SELECT_PROVIDER') {
//     const items = providers.map((p) => ({
//       label: `${p.name} (${p.type})`,
//       value: p.id,
//     }));

//     return (
//       <Box flexDirection="column">
//         <Panel title="Remote Task Launch" color="blue">
//           <Text>
//             Task: <Text bold>{task.name}</Text>
//           </Text>
//           <Text>Command: {task.config?.command}</Text>
//           <Text>Repo: {task.repo || 'N/A'}</Text>
//         </Panel>
//         <Text bold>Select Compute Provider:</Text>
//         <SelectInput items={items} onSelect={handleProviderSelect} />
//       </Box>
//     );
//   }

//   if (step === 'SUCCESS') {
//     return (
//       <Box flexDirection="column">
//         <SuccessMsg text="Job Launched Successfully!" />
//         <Text>
//           Job ID:{' '}
//           <Text bold color="cyan">
//             {jobId}
//           </Text>
//         </Text>
//         <Text dimColor>Monitor with: lab job info {jobId}</Text>
//       </Box>
//     );
//   }

//   if (step === 'ERROR') {
//     return (
//       <Box flexDirection="column">
//         <ErrorMsg text="Run Failed" />
//         <Panel title="Error Details" color="red">
//           <Text bold color="white">
//             {errorObj?.message}
//           </Text>
//           {errorObj?.detail && (
//             <Box marginTop={1}>
//               <Text>{errorObj.detail}</Text>
//             </Box>
//           )}
//         </Panel>
//       </Box>
//     );
//   }

//   return null;
// };

// export const TaskDelete = ({ taskId }: { taskId?: string }) => {
//   const { exit } = useApp();
//   const [input, setInput] = useState(taskId || '');
//   const [step, setStep] = useState<
//     'INPUT' | 'CONFIRM' | 'CONFIRM_ALL' | 'DELETING' | 'SUCCESS' | 'ERROR'
//   >('INPUT');
//   const [error, setError] = useState<string>('');

//   useEffect(() => {
//     if (taskId) {
//       if (taskId === '.') setStep('CONFIRM_ALL');
//       else setStep('CONFIRM');
//     }
//   }, [taskId]);

//   const handleDelete = async () => {
//     setStep('DELETING');
//     try {
//       if (input === '.') {
//         await api.deleteAllTasks();
//       } else {
//         await api.deleteTask(input);
//       }
//       setStep('SUCCESS');
//       setTimeout(() => exit(), 2000);
//     } catch (e: any) {
//       setError(api.handleError(e).message);
//       setStep('ERROR');
//       setTimeout(() => exit(), 3000);
//     }
//   };

//   const handleInputSubmit = (val: string) => {
//     if (val === '.') setStep('CONFIRM_ALL');
//     else setStep('CONFIRM');
//   };

//   if (step === 'INPUT') {
//     return (
//       <Box flexDirection="column">
//         <Text bold color="red">
//           Delete Task
//         </Text>
//         <Text>
//           Enter Task ID (or <Text bold> . </Text> to delete all):
//         </Text>
//         <TextInput
//           value={input}
//           onChange={setInput}
//           onSubmit={() => handleInputSubmit(input)}
//         />
//       </Box>
//     );
//   }

//   if (step === 'CONFIRM') {
//     const items = [
//       { label: 'No, Cancel', value: 'no' },
//       { label: 'Yes, Delete Task', value: 'yes' },
//     ];
//     return (
//       <Box flexDirection="column">
//         <Panel title="Confirm Delete" color="red">
//           <Text>
//             Delete task: <Text bold>{input}</Text>?
//           </Text>
//         </Panel>
//         <SelectInput
//           items={items}
//           onSelect={(item) => {
//             if (item.value === 'yes') handleDelete();
//             else exit();
//           }}
//         />
//       </Box>
//     );
//   }

//   if (step === 'CONFIRM_ALL') {
//     const items = [
//       { label: 'No, Cancel', value: 'no' },
//       { label: 'Yes, DELETE ALL', value: 'yes' },
//     ];
//     return (
//       <Box flexDirection="column">
//         <Panel title="⚠️  DANGER ZONE ⚠️" color="red">
//           <Text bold>You are about to delete ALL tasks.</Text>
//           <Text>This cannot be undone.</Text>
//         </Panel>
//         <SelectInput
//           items={items}
//           onSelect={(item) => {
//             if (item.value === 'yes') handleDelete();
//             else exit();
//           }}
//         />
//       </Box>
//     );
//   }

//   if (step === 'DELETING')
//     return (
//       <Loading
//         text={input === '.' ? 'Deleting all tasks...' : 'Deleting task...'}
//       />
//     );

//   if (step === 'SUCCESS') {
//     const msg =
//       input === '.' ? 'All tasks deleted.' : 'Task deleted successfully.';
//     return (
//       <Box flexDirection="column">
//         <SuccessMsg text={msg} />
//       </Box>
//     );
//   }

//   if (step === 'ERROR') return <ErrorMsg text="Delete Failed" detail={error} />;

//   return null;
// };

// export const InstallFromGallery = () => {
//   const { exit } = useApp();
//   const [items, setItems] = useState<any[]>([]);
//   const [step, setStep] = useState<
//     'LOADING_LIST' | 'SELECT' | 'INSTALLING' | 'SUCCESS' | 'ERROR'
//   >('LOADING_LIST');
//   const [error, setError] = useState<string>('');
//   const [selectedName, setSelectedName] = useState<string>('');

//   useEffect(() => {
//     let isMounted = true;
//     api
//       .getTaskGallery()
//       .then((data) => {
//         if (!isMounted) return;
//         const galleryItems = (
//           Array.isArray(data) ? data : (data as any).data || []
//         ).map((t: any) => ({
//           label: `${t.name} - ${t.description?.slice(0, 40)}...`,
//           value: t.id || t.name,
//         }));

//         if (galleryItems.length === 0) {
//           setError('No items found in the public gallery.');
//           setStep('ERROR');
//         } else {
//           setItems(galleryItems);
//           setStep('SELECT');
//         }
//       })
//       .catch((e) => {
//         if (!isMounted) return;
//         setError(api.handleError(e).message);
//         setStep('ERROR');
//       });

//     return () => {
//       isMounted = false;
//     };
//   }, []);

//   const handleInstall = async (item: any) => {
//     setSelectedName(item.label);
//     setStep('INSTALLING');
//     try {
//       await api.installTaskFromGallery(item.value);
//       setStep('SUCCESS');
//       setTimeout(() => exit(), 2000);
//     } catch (e: any) {
//       setError(api.handleError(e).message);
//       setStep('ERROR');
//     }
//   };

//   if (step === 'LOADING_LIST') return <Loading text="Fetching Gallery..." />;

//   if (step === 'SELECT') {
//     return (
//       <Box flexDirection="column">
//         <Text bold>Select a Task to Install:</Text>
//         <SelectInput items={items} onSelect={handleInstall} limit={10} />
//       </Box>
//     );
//   }

//   if (step === 'INSTALLING')
//     return <Loading text={`Installing ${selectedName}...`} />;
//   if (step === 'SUCCESS')
//     return (
//       <Box flexDirection="column">
//         <SuccessMsg text="Task installed to your library." />
//       </Box>
//     );
//   if (step === 'ERROR')
//     return <ErrorMsg text="Install Failed" detail={error} />;

//   return null;
// };

// export const ExportToGallery = () => {
//   const { exit } = useApp();
//   const [tasks, setTasks] = useState<any[]>([]);
//   const [step, setStep] = useState<
//     'LOADING_LIST' | 'SELECT' | 'EXPORTING' | 'SUCCESS' | 'ERROR'
//   >('LOADING_LIST');
//   const [error, setError] = useState<string>('');

//   useEffect(() => {
//     let isMounted = true;
//     api
//       .listTasks()
//       .then((data) => {
//         if (!isMounted) return;
//         const taskList = (
//           Array.isArray(data) ? data : (data as any).data || []
//         ).map((t: any) => ({
//           label: t.name,
//           value: t.id,
//         }));

//         if (taskList.length === 0) {
//           setError('No local tasks found to export.');
//           setStep('ERROR');
//         } else {
//           setTasks(taskList);
//           setStep('SELECT');
//         }
//       })
//       .catch((e) => {
//         if (!isMounted) return;
//         setError(api.handleError(e).message);
//         setStep('ERROR');
//       });

//     return () => {
//       isMounted = false;
//     };
//   }, []);

//   const handleExport = async (item: any) => {
//     setStep('EXPORTING');
//     try {
//       await api.exportTaskToGallery(item.value);
//       setStep('SUCCESS');
//       setTimeout(() => exit(), 2000);
//     } catch (e: any) {
//       setError(api.handleError(e).message);
//       setStep('ERROR');
//     }
//   };

//   if (step === 'LOADING_LIST') return <Loading text="Loading your tasks..." />;

//   if (step === 'SELECT') {
//     return (
//       <Box flexDirection="column">
//         <Text bold>Select a Task to Export to Local Gallery:</Text>
//         <SelectInput items={tasks} onSelect={handleExport} limit={10} />
//       </Box>
//     );
//   }

//   if (step === 'EXPORTING') return <Loading text="Exporting..." />;
//   if (step === 'SUCCESS')
//     return (
//       <Box flexDirection="column">
//         <SuccessMsg text="Task exported successfully." />
//       </Box>
//     );
//   if (step === 'ERROR') return <ErrorMsg text="Export Failed" detail={error} />;

//   return null;
// };

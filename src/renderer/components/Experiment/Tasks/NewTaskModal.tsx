import * as React from 'react';
import { useRef } from 'react';
import Modal from '@mui/joy/Modal';
import DialogTitle from '@mui/joy/DialogTitle';
import DialogContent from '@mui/joy/DialogContent';
import DialogActions from '@mui/joy/DialogActions';
import Button from '@mui/joy/Button';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import Input from '@mui/joy/Input';
import Select from '@mui/joy/Select';
import Option from '@mui/joy/Option';
import { FormHelperText, ModalClose, ModalDialog, Divider } from '@mui/joy';
import { Editor } from '@monaco-editor/react';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useNotification } from 'renderer/components/Shared/NotificationSystem';
import DirectoryUpload from './DirectoryUpload';
import fairyflossTheme from '../../Shared/fairyfloss.tmTheme.js';

const { parseTmTheme } = require('monaco-themes');

function setTheme(editor: any, monaco: any) {
  const themeData = parseTmTheme(fairyflossTheme);

  monaco.editor.defineTheme('my-theme', themeData);
  monaco.editor.setTheme('my-theme');
}

type NewTaskModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    cluster_name: string;
    command: string;
    cpus?: string;
    memory?: string;
    disk_space?: string;
    accelerators?: string;
    num_nodes?: number;
    setup?: string;
    uploaded_dir_path?: string;
    local_upload_copy?: string;
    region?: string;
    zone?: string;
  }) => void;
  isSubmitting?: boolean;
};

interface Template {
  id: string;
  name: string;
  description: string;
  resources_json: {
    cpus?: string;
    memory?: string;
    accelerators?: string;
    disk_space?: string;
    region?: string;
    zone?: string;
  };
}

export default function NewTaskModal({
  open,
  onClose,
  onSubmit,
  isSubmitting = false,
}: NewTaskModalProps) {
  const { addNotification } = useNotification();

  const [title, setTitle] = React.useState('');
  const [clusterName, setClusterName] = React.useState('');
  const [command, setCommand] = React.useState('');
  const [cpus, setCpus] = React.useState('');
  const [memory, setMemory] = React.useState('');
  const [diskSpace, setDiskSpace] = React.useState('');
  const [accelerators, setAccelerators] = React.useState('');
  const [numNodes, setNumNodes] = React.useState('');
  const [setup, setSetup] = React.useState('');
  const [uploadedDirPath, setUploadedDirPath] = React.useState('');
  const [localUploadCopy, setLocalUploadCopy] = React.useState('');
  const [region, setRegion] = React.useState('');
  const [zone, setZone] = React.useState('');
  const [templates, setTemplates] = React.useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] =
    React.useState<string>('');
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [loadingTemplates, setLoadingTemplates] = React.useState(false);

  // keep separate refs for the two Monaco editors
  const setupEditorRef = useRef<any>(null);
  const commandEditorRef = useRef<any>(null);

  const fetchTemplates = React.useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const response = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Jobs.GetTemplates(),
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success' && data.data?.templates) {
          setTemplates(data.data.templates);
        } else {
          // No templates available or error, but that's okay
          setTemplates([]);
        }
      } else {
        // Error fetching templates, but that's okay - user can still use advanced mode
        setTemplates([]);
      }
    } catch (error) {
      // Error fetching templates - user can still use advanced mode
      setTemplates([]);
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  // Fetch templates when modal opens
  React.useEffect(() => {
    if (open) {
      fetchTemplates();
      // Reset form state when modal opens
      setTitle('');
      setClusterName('');
      setCommand('');
      setCpus('');
      setMemory('');
      setDiskSpace('');
      setAccelerators('');
      setNumNodes('');
      setSetup('');
      setUploadedDirPath('');
      setRegion('');
      setZone('');
      setSelectedTemplateId('');
      setShowAdvanced(false); // Hide advanced settings by default when templates are available
      try {
        setupEditorRef?.current?.setValue?.('');
        commandEditorRef?.current?.setValue?.('');
      } catch (err) {
        // ignore
      }
    }
  }, [open, fetchTemplates]);

  // Update showAdvanced when templates are loaded - hide advanced if templates are available
  React.useEffect(() => {
    if (templates.length > 0 && !selectedTemplateId) {
      setShowAdvanced(false); // Hide advanced settings if templates are available
    } else if (templates.length === 0) {
      setShowAdvanced(true); // Show advanced settings if no templates available
    }
  }, [templates.length, selectedTemplateId]);

  const handleTemplateChange = (templateId: string | null) => {
    if (!templateId) {
      setSelectedTemplateId('');
      // Clear all template-populated fields when template is cleared
      setCpus('');
      setMemory('');
      setDiskSpace('');
      setAccelerators('');
      setRegion('');
      setZone('');
      // If templates are available, keep advanced hidden when template is cleared
      // If no templates, show advanced
      setShowAdvanced(templates.length === 0);
      return;
    }

    setSelectedTemplateId(templateId);
    setShowAdvanced(false); // Hide fields when template is selected

    // First clear all template fields to avoid carrying over values from previous template
    setCpus('');
    setMemory('');
    setDiskSpace('');
    setAccelerators('');
    setRegion('');
    setZone('');

    // Then populate from the new template
    const template = templates.find((t) => t.id === templateId);
    if (template && template.resources_json) {
      const resources = template.resources_json;
      // Only populate fields that are in resources_json
      if (resources.cpus) setCpus(resources.cpus);
      if (resources.memory) {
        // Memory might come as "16GB", extract just the number part
        const memoryValue = resources.memory.replace(/GB$/i, '').trim();
        setMemory(memoryValue);
      }
      if (resources.disk_space) {
        // Disk space might come as "100GB", extract just the number part
        const diskValue = resources.disk_space.replace(/GB$/i, '').trim();
        setDiskSpace(diskValue);
      }
      if (resources.accelerators) setAccelerators(resources.accelerators);
      if (resources.region) setRegion(resources.region);
      if (resources.zone) setZone(resources.zone);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // read editor values (fallback to state if editor not mounted)
    const setupValue =
      setupEditorRef?.current?.getValue?.() ?? (setup || undefined);
    const commandValue =
      commandEditorRef?.current?.getValue?.() ?? (command || undefined);

    if (!commandValue) {
      addNotification({ type: 'warning', message: 'Command is required' });
      return;
    }

    onSubmit({
      title,
      cluster_name: clusterName,
      command: commandValue,
      cpus: cpus || undefined,
      memory: memory || undefined,
      disk_space: diskSpace || undefined,
      accelerators: accelerators || undefined,
      num_nodes: numNodes ? parseInt(numNodes, 10) : undefined,
      setup: setupValue,
      uploaded_dir_path: uploadedDirPath || undefined,
      local_upload_copy: localUploadCopy || undefined,
      region: region || undefined,
      zone: zone || undefined,
    });
  };

  function handleSetupEditorDidMount(editor: any, monaco: any) {
    setupEditorRef.current = editor;
    setTheme(editor, monaco);
  }

  function handleCommandEditorDidMount(editor: any, monaco: any) {
    commandEditorRef.current = editor;
    setTheme(editor, monaco);
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{ maxHeight: '90vh', width: '70vw', overflow: 'hidden' }}
      >
        <ModalClose />
        <DialogTitle>New Task</DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent sx={{ maxHeight: '70vh', overflow: 'auto' }}>
            <FormControl required>
              <FormLabel>Title</FormLabel>
              <Input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setClusterName(`${e.target.value}-instance`);
                }}
                placeholder="Task title"
                autoFocus
              />
            </FormControl>

            {/* Template Selector - only show if templates are available */}
            {templates.length > 0 && (
              <FormControl sx={{ mt: 2 }}>
                <FormLabel>Template (Optional)</FormLabel>
                <Select
                  value={selectedTemplateId}
                  onChange={(_, value) => handleTemplateChange(value)}
                  placeholder="Select a template to pre-fill resource fields"
                  disabled={loadingTemplates}
                >
                  <Option value="">None - Use Advanced Settings</Option>
                  {templates.map((template) => (
                    <Option key={template.id} value={template.id}>
                      {template.name}
                      {template.description && ` - ${template.description}`}
                    </Option>
                  ))}
                </Select>
                <FormHelperText>
                  Select a template to automatically fill resource fields, or
                  use Advanced settings below
                </FormHelperText>
              </FormControl>
            )}

            {/* Number of Nodes - always visible, not part of template */}
            <FormControl sx={{ mt: 2 }}>
              <FormLabel>Number of Nodes</FormLabel>
              <Input
                type="number"
                value={numNodes}
                onChange={(e) => setNumNodes(e.target.value)}
                placeholder="e.g. 1"
              />
            </FormControl>

            {/* Advanced Button - show when templates are available or template is selected */}
            {(templates.length > 0 || selectedTemplateId) && (
              <div style={{ marginTop: '16px', marginBottom: '8px' }}>
                <Button
                  variant="outlined"
                  size="sm"
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                >
                  {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
                </Button>
                {!showAdvanced && templates.length > 0 && (
                  <FormHelperText sx={{ mt: 1 }}>
                    {selectedTemplateId
                      ? 'Template selected. Click above to view/edit resource settings.'
                      : 'Templates available. Select a template or click above to configure resources manually.'}
                  </FormHelperText>
                )}
              </div>
            )}

            {/* Advanced Resource Fields - show when showAdvanced is true or no templates available */}
            {(showAdvanced || templates.length === 0) && (
              <>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '16px',
                    marginTop: '16px',
                  }}
                >
                  <FormControl
                    sx={{ flex: '1 1 calc(33.333% - 16px)', minWidth: '150px' }}
                  >
                    <FormLabel>CPUs</FormLabel>
                    <Input
                      value={cpus}
                      onChange={(e) => setCpus(e.target.value)}
                      placeholder="e.g. 2"
                    />
                  </FormControl>

                  <FormControl
                    sx={{ flex: '1 1 calc(33.333% - 16px)', minWidth: '150px' }}
                  >
                    <FormLabel>Memory (in GB)</FormLabel>
                    <Input
                      value={memory}
                      onChange={(e) => setMemory(e.target.value)}
                      placeholder="e.g. 4"
                    />
                  </FormControl>

                  <FormControl
                    sx={{ flex: '1 1 calc(33.333% - 16px)', minWidth: '150px' }}
                  >
                    <FormLabel>Disk Space (in GB)</FormLabel>
                    <Input
                      value={diskSpace}
                      onChange={(e) => setDiskSpace(e.target.value)}
                      placeholder="e.g. 20"
                    />
                  </FormControl>
                </div>

                <FormControl sx={{ mt: 2 }}>
                  <FormLabel>Accelerators per Node</FormLabel>
                  <Input
                    value={accelerators}
                    onChange={(e) => setAccelerators(e.target.value)}
                    placeholder="e.g. RTX3090:1 or H100:8"
                  />
                </FormControl>

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '16px',
                    marginTop: '16px',
                  }}
                >
                  <FormControl
                    sx={{ flex: '1 1 calc(50% - 16px)', minWidth: '150px' }}
                  >
                    <FormLabel>Region</FormLabel>
                    <Input
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      placeholder="e.g. us-west-2"
                    />
                  </FormControl>

                  <FormControl
                    sx={{ flex: '1 1 calc(50% - 16px)', minWidth: '150px' }}
                  >
                    <FormLabel>Zone</FormLabel>
                    <Input
                      value={zone}
                      onChange={(e) => setZone(e.target.value)}
                      placeholder="e.g. us-west-2a"
                    />
                  </FormControl>
                </div>
              </>
            )}

            <FormControl sx={{ mt: 2 }}>
              <FormLabel>Setup Command</FormLabel>
              {/* <Textarea
                minRows={2}
                value={setup}
                onChange={(e) => setSetup(e.target.value)}
                placeholder="Setup commands (optional) that runs before task is run. e.g. pip install -r requirements.txt"
              /> */}

              <Editor
                defaultLanguage="shell"
                theme="my-theme"
                height="6rem"
                options={{
                  minimap: {
                    enabled: false,
                  },
                  fontSize: 18,
                  cursorStyle: 'block',
                  wordWrap: 'on',
                }}
                onMount={handleSetupEditorDidMount}
              />
              <FormHelperText>
                e.g. <code>pip install -r requirements.txt</code>
              </FormHelperText>
            </FormControl>

            <FormControl required sx={{ mt: 2, mb: 2 }}>
              <FormLabel>Command</FormLabel>
              {/* <Textarea
                minRows={4}
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="e.g. python train.py --epochs 10"
              /> */}

              <Editor
                defaultLanguage="shell"
                theme="my-theme"
                height="8rem"
                options={{
                  minimap: {
                    enabled: false,
                  },
                  fontSize: 18,
                  cursorStyle: 'block',
                  wordWrap: 'on',
                }}
                onMount={handleCommandEditorDidMount}
              />
              <FormHelperText>
                e.g. <code>python train.py --epochs 10</code>
              </FormHelperText>
            </FormControl>

            <DirectoryUpload
              onUploadComplete={(path, localPath) => {
                setUploadedDirPath(path);
                if (localPath) {
                  setLocalUploadCopy(localPath);
                }
              }}
              onUploadError={() => {
                // Error handled by DirectoryUpload component
              }}
              disabled={isSubmitting}
            />
          </DialogContent>
          <DialogActions>
            <Button
              variant="plain"
              color="neutral"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="solid" loading={isSubmitting}>
              Create Task
            </Button>
          </DialogActions>
        </form>
      </ModalDialog>
    </Modal>
  );
}

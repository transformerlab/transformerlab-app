import * as React from 'react';
import {
  Alert,
  Chip,
  Divider,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Option,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Switch,
  Typography,
} from '@mui/joy';
import {
  AlertTriangleIcon,
  ChevronDownIcon,
  CheckCircleIcon,
} from 'lucide-react';
import type { ProviderResourceGroup, ResourceInputs } from './types';

type ResourceField = keyof ResourceInputs;

export type SkypilotOverrides = {
  dockerImage: string;
  region: string;
  useSpot: boolean;
};

type ResourceValidation = {
  issues: Array<{
    type: 'error' | 'warning';
    label: string;
    required: string;
    available: string;
  }>;
  hasErrors: boolean;
  hasWarnings: boolean;
  isCompatible: boolean;
};

interface ResourceOverridesSectionProps {
  show: boolean;
  onToggle: () => void;
  containerRef: React.Ref<HTMLDivElement>;
  isSubmitting: boolean;

  resources: ResourceInputs;
  onResourceChange: (field: ResourceField, value: string) => void;

  resourceOverrideMode: 'manual' | 'group';
  onResourceOverrideModeChange: (mode: 'manual' | 'group') => void;

  providerResourceGroups: ProviderResourceGroup[];
  selectedResourceGroupId: string;
  onSelectResourceGroup: (groupId: string) => void;
  resourceGroupCustomized: boolean;

  // Provider-specific config
  providerType: 'local' | 'slurm' | 'skypilot' | 'dstack' | 'other' | null;
  skypilotOverrides: SkypilotOverrides;
  onSkypilotOverridesChange: (next: SkypilotOverrides) => void;
  jobDstackFleetName: string;
  onJobDstackFleetNameChange: (value: string) => void;

  // Incompatibility warning (null when compatible or not applicable)
  incompatibilityAccelerators: string | null;
  resourceValidation: ResourceValidation | null;
}

export default function ResourceOverridesSection({
  show,
  onToggle,
  containerRef,
  isSubmitting,
  resources,
  onResourceChange,
  resourceOverrideMode,
  onResourceOverrideModeChange,
  providerResourceGroups,
  selectedResourceGroupId,
  onSelectResourceGroup,
  resourceGroupCustomized,
  providerType,
  skypilotOverrides,
  onSkypilotOverridesChange,
  jobDstackFleetName,
  onJobDstackFleetNameChange,
  incompatibilityAccelerators,
  resourceValidation,
}: ResourceOverridesSectionProps) {
  const isSkypilotProvider = providerType === 'skypilot';
  const isDstackProvider = providerType === 'dstack';
  const isLocalProvider = providerType === 'local';
  return (
    <Stack spacing={1}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ cursor: isSubmitting ? 'default' : 'pointer' }}
        onClick={() => {
          if (!isSubmitting) onToggle();
        }}
      >
        <Typography level="title-sm">Optional resource overrides</Typography>
        <ChevronDownIcon
          size={18}
          style={{
            transform: show ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        />
      </Stack>
      {show && (
        <div ref={containerRef}>
          <Stack spacing={2}>
            <FormControl>
              <FormLabel>Override mode</FormLabel>
              <RadioGroup
                orientation="horizontal"
                value={resourceOverrideMode}
                onChange={(event) => {
                  onResourceOverrideModeChange(
                    event.target.value as 'manual' | 'group',
                  );
                }}
              >
                <Radio value="manual" label="Manual resources" />
                <Radio
                  value="group"
                  label="Use saved group"
                  disabled={providerResourceGroups.length === 0}
                />
              </RadioGroup>
              {resourceOverrideMode === 'group' && (
                <FormHelperText>
                  {providerResourceGroups.length === 0
                    ? 'No saved groups are defined for this provider yet.'
                    : 'Select a saved group to prefill resource values.'}
                </FormHelperText>
              )}
            </FormControl>

            {resourceOverrideMode === 'group' && (
              <FormControl>
                <FormLabel>Saved resource group</FormLabel>
                <Select
                  placeholder="Select a resource group"
                  value={selectedResourceGroupId || null}
                  disabled={isSubmitting || providerResourceGroups.length === 0}
                  onChange={(_, value) =>
                    onSelectResourceGroup(String(value || ''))
                  }
                >
                  {providerResourceGroups.map((group) => (
                    <Option key={group.id} value={group.id}>
                      {group.name}
                    </Option>
                  ))}
                </Select>
                {selectedResourceGroupId && (
                  <FormHelperText>
                    {resourceGroupCustomized
                      ? 'Custom override active: one or more fields have been edited.'
                      : 'Using saved group values. Editing any field will switch to custom override.'}
                  </FormHelperText>
                )}
              </FormControl>
            )}

            <Stack direction="row" spacing={2}>
              <FormControl sx={{ flex: 1 }}>
                <FormLabel>CPUs</FormLabel>
                <Input
                  placeholder="e.g. 4"
                  value={resources.cpus}
                  onChange={(e) => onResourceChange('cpus', e.target.value)}
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormControl sx={{ flex: 1 }}>
                <FormLabel>Memory</FormLabel>
                <Input
                  placeholder="e.g. 16GB"
                  value={resources.memory}
                  onChange={(e) => onResourceChange('memory', e.target.value)}
                  disabled={isSubmitting}
                />
              </FormControl>
            </Stack>
            <Stack direction="row" spacing={2}>
              <FormControl sx={{ flex: 1 }}>
                <FormLabel>Disk space</FormLabel>
                <Input
                  placeholder="e.g. 100 or 100GB"
                  value={resources.diskSpace}
                  onChange={(e) =>
                    onResourceChange('diskSpace', e.target.value)
                  }
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormControl sx={{ flex: 1 }}>
                <FormLabel>Accelerators</FormLabel>
                <Input
                  placeholder="e.g. A100:1, RTX3090:2, 1"
                  value={resources.accelerators}
                  onChange={(e) =>
                    onResourceChange('accelerators', e.target.value)
                  }
                  disabled={isSubmitting}
                />
              </FormControl>
            </Stack>
            <Stack direction="row" spacing={2}>
              <FormControl sx={{ flex: 1 }}>
                <FormLabel>Num nodes</FormLabel>
                <Input
                  placeholder="e.g. 1"
                  value={resources.numNodes}
                  onChange={(e) => onResourceChange('numNodes', e.target.value)}
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormControl sx={{ flex: 1 }}>
                <FormLabel>Minutes requested</FormLabel>
                <Input
                  type="number"
                  placeholder="e.g. 60"
                  value={resources.minutesRequested}
                  onChange={(e) =>
                    onResourceChange('minutesRequested', e.target.value)
                  }
                  disabled={isSubmitting}
                />
              </FormControl>
            </Stack>
            <FormHelperText>
              These values override the template&apos;s resource requirements
              for this run only. Leave a field empty to use the template
              default.
            </FormHelperText>

            {isSkypilotProvider && (
              <>
                <Divider />
                <Typography level="title-sm">SkyPilot Job Overrides</Typography>
                <FormControl>
                  <FormLabel>Docker Image (optional)</FormLabel>
                  <Input
                    value={skypilotOverrides.dockerImage}
                    onChange={(e) =>
                      onSkypilotOverridesChange({
                        ...skypilotOverrides,
                        dockerImage: e.target.value,
                      })
                    }
                    placeholder="docker:nvcr.io/nvidia/pytorch:23.10-py3"
                    sx={{ fontFamily: 'monospace', fontSize: 'sm' }}
                    disabled={isSubmitting}
                  />
                  <FormHelperText>
                    Prefix with &quot;docker:&quot; to run inside a container.
                    Defaults to the provider&apos;s global setting.
                  </FormHelperText>
                </FormControl>
                <FormControl>
                  <FormLabel>Region (optional)</FormLabel>
                  <Input
                    value={skypilotOverrides.region}
                    onChange={(e) =>
                      onSkypilotOverridesChange({
                        ...skypilotOverrides,
                        region: e.target.value,
                      })
                    }
                    placeholder="e.g. us-east-1"
                    disabled={isSubmitting}
                  />
                </FormControl>
                <FormControl
                  sx={{ flexDirection: 'row', alignItems: 'center' }}
                >
                  <Switch
                    checked={skypilotOverrides.useSpot}
                    onChange={(e) =>
                      onSkypilotOverridesChange({
                        ...skypilotOverrides,
                        useSpot: e.target.checked,
                      })
                    }
                    disabled={isSubmitting}
                    sx={{ mr: 1 }}
                  />
                  <FormLabel sx={{ m: 0 }}>
                    Use Spot / Preemptible Instances
                  </FormLabel>
                </FormControl>
              </>
            )}

            {isDstackProvider && (
              <>
                <Divider />
                <Typography level="title-sm">dstack Job Overrides</Typography>
                <FormControl>
                  <FormLabel>Fleet Name (optional)</FormLabel>
                  <Input
                    value={jobDstackFleetName}
                    onChange={(e) => onJobDstackFleetNameChange(e.target.value)}
                    placeholder="my-fleet"
                    disabled={isSubmitting}
                  />
                  <FormHelperText>
                    If set, this run is scheduled on the specified dstack fleet.
                    Leave empty to use resource-based scheduling.
                  </FormHelperText>
                </FormControl>
              </>
            )}

            {incompatibilityAccelerators && (
              <Alert
                variant="soft"
                color="warning"
                startDecorator={<AlertTriangleIcon size={18} />}
                sx={{ mt: 1 }}
              >
                <Typography level="body-sm">
                  This provider may not support the requested accelerators (
                  <strong>{incompatibilityAccelerators}</strong>).
                </Typography>
              </Alert>
            )}

            {isLocalProvider &&
              resourceValidation &&
              !resourceValidation.isCompatible && (
                <Alert
                  variant="soft"
                  color={resourceValidation.hasErrors ? 'danger' : 'warning'}
                  startDecorator={<AlertTriangleIcon size={18} />}
                  sx={{ mt: 1 }}
                >
                  <Stack spacing={1}>
                    <Typography
                      level="title-sm"
                      color={
                        resourceValidation.hasErrors ? 'danger' : 'warning'
                      }
                    >
                      {resourceValidation.hasErrors
                        ? 'Local provider cannot meet task requirements'
                        : 'Local provider may not meet task requirements'}
                    </Typography>
                    <Stack spacing={0.5}>
                      {resourceValidation.issues.map((issue) => (
                        <Stack
                          key={`${issue.type}-${issue.label}`}
                          direction="row"
                          spacing={1}
                          alignItems="center"
                        >
                          <Chip
                            size="sm"
                            variant="solid"
                            color={
                              issue.type === 'error' ? 'danger' : 'warning'
                            }
                          >
                            {issue.label}
                          </Chip>
                          <Typography level="body-xs">
                            Required: <strong>{issue.required}</strong>,
                            Available: <strong>{issue.available}</strong>
                          </Typography>
                        </Stack>
                      ))}
                    </Stack>
                    {resourceValidation.hasErrors && (
                      <Typography level="body-xs" color="danger">
                        Consider selecting a different provider with the
                        required resources.
                      </Typography>
                    )}
                  </Stack>
                </Alert>
              )}

            {isLocalProvider && resourceValidation?.isCompatible && (
              <Alert
                variant="soft"
                color="success"
                startDecorator={<CheckCircleIcon size={18} />}
                sx={{ mt: 1 }}
              >
                <Typography level="body-sm" color="success">
                  Local provider meets the task resource requirements.
                </Typography>
              </Alert>
            )}
          </Stack>
        </div>
      )}
    </Stack>
  );
}

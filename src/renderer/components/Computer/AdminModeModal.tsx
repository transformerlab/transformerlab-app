import React from 'react';
import {
  Button,
  Card,
  Divider,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalClose,
  ModalDialog,
  Stack,
  Switch,
  Typography,
  Select,
  Option,
} from '@mui/joy';
import { Settings, Shield, RotateCcw } from 'lucide-react';

interface QuotaConfig {
  host_identifier: string;
  time_period: string;
  minutes_limit: number;
  warning_threshold_percent: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface AdminQuotaConfig {
  host_identifier: string;
  time_period: string;
  minutes_limit: number;
  warning_threshold_percent: number;
  is_active: boolean;
}

interface AdminHostData {
  configs: QuotaConfig[];
  usage: any[];
}

interface AdminModeModalProps {
  open: boolean;
  onClose: () => void;
  isAdminMode: boolean;
  setIsAdminMode: (value: boolean) => void;
  adminQuotaData: { data: { [key: string]: AdminHostData } } | null;
  quotaConfigForm: AdminQuotaConfig[];
  setQuotaConfigForm: React.Dispatch<React.SetStateAction<AdminQuotaConfig[]>>;
  selectedHostForEdit: string;
  setSelectedHostForEdit: (value: string) => void;
  isAdminSubmitting: boolean;
  handleAdminQuotaConfigSave: (config: AdminQuotaConfig) => void;
  handleAdminQuotaReset: (hostIdentifier: string) => void;
}

export default function AdminModeModal({
  open,
  onClose,
  isAdminMode,
  setIsAdminMode,
  adminQuotaData,
  quotaConfigForm,
  setQuotaConfigForm,
  selectedHostForEdit,
  setSelectedHostForEdit,
  isAdminSubmitting,
  handleAdminQuotaConfigSave,
  handleAdminQuotaReset,
}: AdminModeModalProps) {
  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        size="lg"
        sx={{
          width: { xs: '95vw', sm: '90vw', md: '800px' },
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        <ModalClose />
        <Typography level="h4" sx={{ mb: 2 }}>
          Admin Mode - Quota Management
        </Typography>

        <Stack spacing={2}>
          <Button
            variant={isAdminMode ? 'soft' : 'outlined'}
            color="primary"
            onClick={() => setIsAdminMode(true)}
            startDecorator={<Settings />}
            fullWidth
          >
            Enable Admin Mode
          </Button>
          <Button
            variant={!isAdminMode ? 'soft' : 'outlined'}
            color="neutral"
            onClick={() => setIsAdminMode(false)}
            startDecorator={<Shield />}
            fullWidth
          >
            Disable Admin Mode
          </Button>

          {isAdminMode && (
            <>
              <Divider sx={{ my: 2 }} />

              <Typography level="body-md" fontWeight="md">
                Host Quota Configurations
              </Typography>
              <Typography level="body-sm" color="neutral">
                Configure quotas for available hosts
              </Typography>

              {adminQuotaData?.data &&
              Object.keys(adminQuotaData.data).length > 0 ? (
                <Stack spacing={2}>
                  {Object.entries(adminQuotaData.data).map(
                    ([hostIdentifier, hostData]) => {
                      const typedHostData = hostData as AdminHostData;
                      const isEditing = selectedHostForEdit === hostIdentifier;
                      return (
                        <Card
                          key={hostIdentifier}
                          variant="outlined"
                          sx={{
                            p: 2,
                            borderColor:
                              isEditing && isAdminMode
                                ? 'primary.main'
                                : 'divider',
                          }}
                        >
                          <Stack spacing={1}>
                            <Stack
                              direction="row"
                              justifyContent="space-between"
                              alignItems="center"
                            >
                              <Typography level="title-sm">
                                {hostIdentifier}
                              </Typography>
                              <Stack direction="row" spacing={1}>
                                <Button
                                  variant="outlined"
                                  size="sm"
                                  onClick={() => {
                                    if (isEditing) {
                                      // Save changes
                                      const updatedConfig =
                                        quotaConfigForm.find(
                                          (config) =>
                                            config.host_identifier ===
                                            hostIdentifier,
                                        );
                                      if (updatedConfig) {
                                        handleAdminQuotaConfigSave(
                                          updatedConfig,
                                        );
                                      }
                                    } else {
                                      // Edit mode - ensure config is in form
                                      setSelectedHostForEdit(hostIdentifier);
                                      const existingFormConfig =
                                        quotaConfigForm.find(
                                          (config) =>
                                            config.host_identifier ===
                                            hostIdentifier,
                                        );
                                      if (
                                        !existingFormConfig &&
                                        typedHostData.configs?.[0]
                                      ) {
                                        setQuotaConfigForm((prev) => [
                                          ...prev,
                                          {
                                            host_identifier: hostIdentifier,
                                            time_period:
                                              typedHostData.configs?.[0]
                                                ?.time_period,
                                            minutes_limit:
                                              typedHostData.configs?.[0]
                                                ?.minutes_limit,
                                            warning_threshold_percent:
                                              typedHostData.configs?.[0]
                                                ?.warning_threshold_percent,
                                            is_active:
                                              typedHostData.configs?.[0]
                                                ?.is_active,
                                          },
                                        ]);
                                      }
                                    }
                                  }}
                                >
                                  {isEditing ? 'Save' : 'Edit'}
                                </Button>

                                {!isEditing && (
                                  <Button
                                    variant="outlined"
                                    size="sm"
                                    color="warning"
                                    startDecorator={<RotateCcw />}
                                    onClick={() =>
                                      handleAdminQuotaReset(hostIdentifier)
                                    }
                                    disabled={isAdminSubmitting}
                                  >
                                    Reset Quota
                                  </Button>
                                )}
                              </Stack>
                            </Stack>

                            {isEditing ? (
                              <Stack spacing={1}>
                                <FormControl>
                                  <FormLabel>Time Period</FormLabel>
                                  <Select
                                    value={
                                      quotaConfigForm.find(
                                        (config) =>
                                          config.host_identifier ===
                                          hostIdentifier,
                                      )?.time_period || ''
                                    }
                                    onChange={(_, value) => {
                                      if (value) {
                                        setQuotaConfigForm((prev) =>
                                          prev.map((config) =>
                                            config.host_identifier ===
                                            hostIdentifier
                                              ? {
                                                  ...config,
                                                  time_period: value as string,
                                                }
                                              : config,
                                          ),
                                        );
                                      }
                                    }}
                                  >
                                    <Option value="daily">Daily</Option>
                                    <Option value="weekly">Weekly</Option>
                                    <Option value="monthly">Monthly</Option>
                                  </Select>
                                </FormControl>

                                <FormControl>
                                  <FormLabel>Minutes Limit</FormLabel>
                                  <Input
                                    type="number"
                                    value={
                                      quotaConfigForm.find(
                                        (config) =>
                                          config.host_identifier ===
                                          hostIdentifier,
                                      )?.minutes_limit || 0
                                    }
                                    onChange={(e) => {
                                      const newLimit = parseInt(
                                        e.target.value,
                                        10,
                                      );
                                      setQuotaConfigForm((prev) =>
                                        prev.map((config) =>
                                          config.host_identifier ===
                                          hostIdentifier
                                            ? {
                                                ...config,
                                                minutes_limit: newLimit,
                                              }
                                            : config,
                                        ),
                                      );
                                    }}
                                  />
                                </FormControl>

                                <FormControl>
                                  <FormLabel>Warning Threshold (%)</FormLabel>
                                  <Input
                                    type="number"
                                    value={
                                      quotaConfigForm.find(
                                        (config) =>
                                          config.host_identifier ===
                                          hostIdentifier,
                                      )?.warning_threshold_percent || 0
                                    }
                                    onChange={(e) => {
                                      const newThreshold = parseInt(
                                        e.target.value,
                                        10,
                                      );
                                      setQuotaConfigForm((prev) =>
                                        prev.map((config) =>
                                          config.host_identifier ===
                                          hostIdentifier
                                            ? {
                                                ...config,
                                                warning_threshold_percent:
                                                  newThreshold,
                                              }
                                            : config,
                                        ),
                                      );
                                    }}
                                  />
                                </FormControl>

                                <FormControl>
                                  <FormLabel>Active</FormLabel>
                                  <Switch
                                    checked={
                                      quotaConfigForm.find(
                                        (config) =>
                                          config.host_identifier ===
                                          hostIdentifier,
                                      )?.is_active || false
                                    }
                                    onChange={(e) => {
                                      const isActive = e.target.checked;
                                      setQuotaConfigForm((prev) =>
                                        prev.map((config) =>
                                          config.host_identifier ===
                                          hostIdentifier
                                            ? {
                                                ...config,
                                                is_active: isActive,
                                              }
                                            : config,
                                        ),
                                      );
                                    }}
                                  />
                                </FormControl>
                              </Stack>
                            ) : (
                              <Stack spacing={1}>
                                <Typography level="body-sm" color="neutral">
                                  Time Period:{' '}
                                  {typedHostData.configs?.[0]?.time_period ||
                                    'Not set'}
                                </Typography>
                                <Typography level="body-sm" color="neutral">
                                  Minutes Limit:{' '}
                                  {typedHostData.configs?.[0]?.minutes_limit ||
                                    'Not set'}
                                </Typography>
                                <Typography level="body-sm" color="neutral">
                                  Warning Threshold:{' '}
                                  {typedHostData.configs?.[0]
                                    ?.warning_threshold_percent || 'Not set'}
                                  %
                                </Typography>
                                <Typography level="body-sm" color="neutral">
                                  Active:{' '}
                                  {typedHostData.configs?.[0]?.is_active
                                    ? 'Yes'
                                    : 'No'}
                                </Typography>
                              </Stack>
                            )}
                          </Stack>
                        </Card>
                      );
                    },
                  )}
                </Stack>
              ) : (
                <Typography level="body-sm" color="neutral">
                  No quota configurations found for any hosts.
                </Typography>
              )}
            </>
          )}
        </Stack>
      </ModalDialog>
    </Modal>
  );
}

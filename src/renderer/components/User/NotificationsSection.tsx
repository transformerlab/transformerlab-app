import * as React from 'react';
import {
  Box,
  Button,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Stack,
  Switch,
  Typography,
} from '@mui/joy';
import { useAuth } from 'renderer/lib/authContext';
import { getAPIFullPath } from 'renderer/lib/api-client/urls';
import { useNotification } from '../Shared/NotificationSystem';

export default function NotificationsSection() {
  const { fetchWithAuth } = useAuth();
  const { addNotification } = useNotification();
  const [enabled, setEnabled] = React.useState(false);
  const [webhookUrl, setWebhookUrl] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);

  // Load saved settings on mount
  React.useEffect(() => {
    const load = async () => {
      try {
        const [enabledRes, urlRes] = await Promise.all([
          fetchWithAuth(
            getAPIFullPath('config', ['get'], { key: 'notification_enabled' }),
          ),
          fetchWithAuth(
            getAPIFullPath('config', ['get'], {
              key: 'notification_webhook_url',
            }),
          ),
        ]);
        const enabledVal = await enabledRes.json();
        const urlVal = await urlRes.json();
        setEnabled(enabledVal === 'true');
        setWebhookUrl(urlVal || '');
      } catch (err) {
        console.error('Failed to load notification settings', err);
      }
    };
    load();
  }, [fetchWithAuth]);

  const saveConfig = async (key: string, value: string) => {
    await fetchWithAuth(
      getAPIFullPath('config', ['set'], {
        key,
        value,
        team_wide: 'false',
      }),
    );
  };

  const handleToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setEnabled(checked);
    await saveConfig('notification_enabled', checked ? 'true' : 'false');
  };

  const handleSave = async () => {
    if (!enabled) return;
    setSaving(true);
    try {
      await saveConfig('notification_webhook_url', webhookUrl);
      addNotification({
        type: 'success',
        message: 'Notification settings saved.',
      });
    } catch (err) {
      console.error('Failed to save notification settings', err);
      addNotification({
        type: 'danger',
        message: 'Failed to save notification settings.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const response = await fetchWithAuth('config/test-notification-webhook', {
        method: 'POST',
      });
      const data = await response.json();
      if (data.ok) {
        addNotification({
          type: 'success',
          message: 'Test notification sent successfully!',
        });
      } else {
        addNotification({
          type: 'danger',
          message: `Test failed: ${data.error}`,
        });
      }
    } catch (err) {
      addNotification({
        type: 'danger',
        message: 'Failed to send test notification.',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Box mt={2}>
      <Typography level="title-lg" mb={2}>
        Job Notifications
      </Typography>
      <Stack gap={3} maxWidth={500}>
        <FormControl>
          <FormLabel>Enable job notifications</FormLabel>
          <Switch
            checked={enabled}
            onChange={handleToggle}
            color={enabled ? 'success' : 'neutral'}
            sx={{ alignSelf: 'flex-start' }}
          />
          <FormHelperText>
            Receive a notification when a job completes, fails, or stops.
          </FormHelperText>
        </FormControl>

        <FormControl disabled={!enabled}>
          <FormLabel>Webhook URL</FormLabel>
          <Stack direction="row" gap={1}>
            <Input
              placeholder="https://hooks.slack.com/..."
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              disabled={!enabled}
              sx={{ flex: 1 }}
            />
            <Button
              variant="solid"
              onClick={handleSave}
              loading={saving}
              disabled={!enabled}
            >
              Save
            </Button>
            <Button
              variant="soft"
              onClick={handleTest}
              loading={testing}
              disabled={!enabled || !webhookUrl}
            >
              Test
            </Button>
          </Stack>
          <FormHelperText>
            Works with Slack, Discord, Microsoft Teams, or any HTTP endpoint. A
            POST is sent when a job completes, fails, or stops.
          </FormHelperText>
        </FormControl>
      </Stack>
    </Box>
  );
}


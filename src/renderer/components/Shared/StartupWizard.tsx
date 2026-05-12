import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Modal,
  ModalDialog,
  ModalClose,
  DialogTitle,
  DialogContent,
  Box,
  Button,
  Chip,
  Input,
  FormControl,
  FormLabel,
  Alert,
  Typography,
  Stack,
} from '@mui/joy';
import { useAuth } from 'renderer/lib/authContext';
import { API_URL } from 'renderer/lib/api-client/urls';

const SPECIAL_SECRETS = {
  _HF_TOKEN: 'HuggingFace Token',
  _GITHUB_PAT_TOKEN: 'GitHub Personal Access Token',
  _WANDB_API_KEY: 'Weights & Biases API Key',
  _NGROK_AUTH_TOKEN: 'ngrok Auth Token',
} as const;

type SecretKey = keyof typeof SPECIAL_SECRETS;

function wizardKey(userId: string): string {
  return `startup_wizard_shown_${userId}`;
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
      {Array.from({ length: total }, (_, i) => {
        const stepNum = i + 1;
        const done = stepNum < current;
        const active = stepNum === current;
        return (
          <Box
            key={stepNum}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              flex: stepNum < total ? 1 : 'none',
            }}
          >
            <Box
              sx={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 700,
                flexShrink: 0,
                bgcolor: done
                  ? 'success.500'
                  : active
                    ? 'primary.500'
                    : 'neutral.700',
                color: done || active ? '#fff' : 'neutral.400',
              }}
            >
              {done ? '✓' : stepNum}
            </Box>
            {stepNum < total && (
              <Box
                sx={{
                  flex: 1,
                  height: '2px',
                  bgcolor: done ? 'success.500' : 'neutral.outlinedBorder',
                  borderRadius: 1,
                }}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
}

type ExistingSecrets = Partial<
  Record<SecretKey, { exists: boolean; masked_value: string | null }>
>;

function Step1({
  secrets,
  setSecrets,
  hasTeamSecrets,
  existingUserSecrets,
}: {
  secrets: Partial<Record<SecretKey, string>>;
  setSecrets: React.Dispatch<
    React.SetStateAction<Partial<Record<SecretKey, string>>>
  >;
  hasTeamSecrets: boolean;
  existingUserSecrets: ExistingSecrets;
}) {
  return (
    <Stack gap={1.5}>
      <Typography level="body-sm" color="neutral">
        Add tokens for external services. Fill in whichever ones you use; you
        can always update these later in User Settings.
      </Typography>
      {hasTeamSecrets && (
        <Alert color="primary" variant="soft">
          Some secrets are already configured at the team level; you can skip
          this step.
        </Alert>
      )}
      {(Object.entries(SPECIAL_SECRETS) as [SecretKey, string][]).map(
        ([key, label]) => {
          const existing = existingUserSecrets[key];
          const isSet = existing?.exists === true;
          return (
            <FormControl key={key}>
              <Stack direction="row" alignItems="center" gap={1}>
                <FormLabel sx={{ mb: 0 }}>{label}</FormLabel>
                {isSet && (
                  <Chip size="sm" color="success" variant="soft">
                    Already set ···{existing?.masked_value}
                  </Chip>
                )}
              </Stack>
              <Input
                type="password"
                placeholder={isSet ? 'Enter new value to update' : label}
                value={secrets[key] ?? ''}
                onChange={(e) =>
                  setSecrets((prev) => ({ ...prev, [key]: e.target.value }))
                }
                slotProps={{ input: { autoComplete: 'new-password' } }}
              />
            </FormControl>
          );
        },
      )}
    </Stack>
  );
}

function Step2({
  isDefaultPassword,
  onNavigate,
}: {
  isDefaultPassword: boolean;
  onNavigate: (path: string) => void;
}) {
  return (
    <Stack gap={2}>
      <Typography level="body-sm" color="neutral">
        A few more things; these can be done anytime. We just want to make sure
        you know about them.
      </Typography>

      <Box
        sx={{
          border: '1px solid',
          borderColor: 'primary.outlinedBorder',
          borderRadius: 'md',
          p: 2,
          bgcolor: 'primary.softBg',
        }}
      >
        <Typography level="title-sm" mb={0.5}>
          🖥️ Add a Compute Provider
        </Typography>
        <Typography level="body-sm" color="neutral" mb={1}>
          Connect a SLURM cluster or cloud GPU provider to run training jobs
          beyond your local machine.
        </Typography>
        <Button
          size="sm"
          variant="soft"
          color="primary"
          onClick={() => onNavigate('/compute')}
        >
          Open Compute Settings
        </Button>
      </Box>

      {isDefaultPassword ? (
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'danger.outlinedBorder',
            borderRadius: 'md',
            p: 2,
            bgcolor: 'danger.softBg',
          }}
        >
          <Typography level="title-sm" color="danger" mb={0.5}>
            ⚠️ Insecure Password
          </Typography>
          <Typography level="body-sm" color="neutral" mb={1}>
            You are still using the default password. Change it to keep your
            account secure.
          </Typography>
          <Button
            size="sm"
            variant="soft"
            color="danger"
            onClick={() => onNavigate('/user/profile')}
          >
            Open User Settings
          </Button>
        </Box>
      ) : (
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'success.outlinedBorder',
            borderRadius: 'md',
            p: 2,
            bgcolor: 'success.softBg',
          }}
        >
          <Typography level="title-sm" color="success" mb={0.5}>
            ✅ Password is Secure
          </Typography>
          <Typography level="body-sm" color="neutral">
            Your password has been changed from the default. You&apos;re good to
            go.
          </Typography>
        </Box>
      )}
    </Stack>
  );
}

export default function StartupWizard() {
  const { user, isDefaultPassword, fetchWithAuth, team } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [secrets, setSecrets] = useState<Partial<Record<SecretKey, string>>>(
    {},
  );
  const [saving, setSaving] = useState(false);
  const [hasTeamSecrets, setHasTeamSecrets] = useState(false);
  const [existingUserSecrets, setExistingUserSecrets] =
    useState<ExistingSecrets>({});

  useEffect(() => {
    if (!user?.id) return;
    if (!localStorage.getItem(wizardKey(user.id))) {
      setOpen(true);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!open) return;
    if (team?.id) {
      fetchWithAuth(`${API_URL()}teams/${team.id}/special_secrets`)
        .then((res) => (res.ok ? res.json() : { special_secrets: {} }))
        .then((data) => {
          const anyExists = Object.values(data.special_secrets ?? {}).some(
            (s: any) => s.exists,
          );
          setHasTeamSecrets(anyExists);
        })
        .catch(() => {});
    }
    fetchWithAuth(`${API_URL()}users/me/special_secrets`)
      .then((res) => (res.ok ? res.json() : { special_secrets: {} }))
      .then((data) => setExistingUserSecrets(data.special_secrets ?? {}))
      .catch(() => {});
  }, [open, team?.id, fetchWithAuth]);

  const dismiss = () => {
    if (user?.id) localStorage.setItem(wizardKey(user.id), 'shown');
    setOpen(false);
  };

  const handleNext = async () => {
    setSaving(true);
    try {
      for (const [key, value] of Object.entries(secrets) as [
        SecretKey,
        string,
      ][]) {
        if (value?.trim()) {
          await fetchWithAuth(`${API_URL()}users/me/special_secrets`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ secret_type: key, value: value.trim() }),
          });
        }
      }
    } finally {
      setSaving(false);
    }
    setStep(2);
  };

  const handleNavigate = (path: string) => {
    dismiss();
    navigate(path);
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={dismiss}>
      <ModalDialog sx={{ minWidth: 480, maxWidth: 560 }}>
        <ModalClose />
        <DialogTitle>Welcome to Transformer Lab</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <StepIndicator current={step} total={2} />
          {step === 1 && (
            <Step1
              secrets={secrets}
              setSecrets={setSecrets}
              hasTeamSecrets={hasTeamSecrets}
              existingUserSecrets={existingUserSecrets}
            />
          )}
          {step === 2 && (
            <Step2
              isDefaultPassword={isDefaultPassword}
              onNavigate={handleNavigate}
            />
          )}
        </DialogContent>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            px: 2,
            pb: 2,
          }}
        >
          {step === 1 && (
            <>
              <Button
                variant="plain"
                color="neutral"
                onClick={() => setStep(2)}
              >
                Skip
              </Button>
              <Button loading={saving} onClick={handleNext}>
                Next
              </Button>
            </>
          )}
          {step === 2 && (
            <Button sx={{ ml: 'auto' }} onClick={dismiss}>
              Finish setup
            </Button>
          )}
        </Box>
      </ModalDialog>
    </Modal>
  );
}

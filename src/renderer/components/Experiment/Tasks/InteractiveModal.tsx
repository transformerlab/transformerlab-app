import React from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Link,
  Modal,
  ModalClose,
  ModalDialog,
  Stack,
  Typography,
} from '@mui/joy';
import { CopyIcon } from 'lucide-react';
import useSWR from 'swr';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import { useAuth } from 'renderer/lib/authContext';

interface HelpLink {
  label: string;
  href: string;
}

interface KvItem {
  label: string;
  value_key: string;
  optional?: boolean;
}

interface InstructionBlock {
  kind: 'url' | 'code' | 'command' | 'kv' | 'text';
  title?: string;
  description?: string;
  value_key?: string;
  placeholder?: string;
  copy_label?: string;
  help_links?: HelpLink[];
  example_template?: string;
  items?: KvItem[];
  template?: string;
}

interface PortDef {
  port: number;
  label: string;
  protocol: string;
}

type InteractiveModalProps = {
  jobId: number;
  setJobId: (jobId: number) => void;
  embeddedOutput?: React.ReactNode;
};

function resolveTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] || key);
}

function handleCopy(text: string | undefined | null) {
  if (!text) return;
  try {
    navigator.clipboard?.writeText(text);
  } catch {
    // ignore copy failures
  }
}

function UrlBlock({
  block,
  values,
}: {
  block: InstructionBlock;
  values: Record<string, string>;
}) {
  const urlValue = block.value_key ? values[block.value_key] : null;

  return (
    <Box>
      {block.title && <Typography level="title-md">{block.title}</Typography>}
      {block.description && (
        <Typography level="body-sm" sx={{ mt: 0.5 }}>
          {block.description}
        </Typography>
      )}
      <Box
        sx={{
          mt: 1,
          p: 1.5,
          borderRadius: 'sm',
          border: '1px solid var(--joy-palette-neutral-outlinedBorder)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        {urlValue ? (
          <>
            <Link
              href={urlValue}
              target="_blank"
              rel="noreferrer"
              level="title-md"
              sx={{ wordBreak: 'break-all', flex: 1, minWidth: 0 }}
            >
              {urlValue}
            </Link>
            <Stack direction="row" spacing={1}>
              <Button
                size="sm"
                variant="soft"
                onClick={() => handleCopy(urlValue)}
              >
                {block.copy_label || 'Copy URL'}
              </Button>
            </Stack>
          </>
        ) : (
          <Typography level="body-sm" sx={{ flex: 1 }}>
            {block.placeholder || 'Waiting for URL...'}
          </Typography>
        )}
      </Box>

      {urlValue && block.example_template && (
        <Box
          sx={{
            mt: 2,
            p: 1.5,
            bgcolor: 'background.level1',
            borderRadius: 'sm',
          }}
        >
          <Typography level="body-sm" sx={{ mb: 1, fontWeight: 'bold' }}>
            API Usage Example:
          </Typography>
          <Typography
            level="body-xs"
            component="pre"
            sx={{
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              fontSize: '0.75rem',
            }}
          >
            {resolveTemplate(block.example_template, values)}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

function CodeBlock({
  block,
  values,
}: {
  block: InstructionBlock;
  values: Record<string, string>;
}) {
  const codeValue = block.value_key ? values[block.value_key] : null;

  return (
    <Box>
      {block.title && <Typography level="title-md">{block.title}</Typography>}
      {block.description && (
        <Typography level="body-sm" sx={{ mt: 0.5 }}>
          {block.description}
          {block.help_links?.map((link) => (
            <React.Fragment key={link.href}>
              {' '}
              <Link href={link.href} target="_blank" rel="noreferrer">
                {link.label}
              </Link>
            </React.Fragment>
          ))}
        </Typography>
      )}
      <Box
        sx={{
          mt: 1,
          p: 1.5,
          borderRadius: 'sm',
          border: '1px solid var(--joy-palette-neutral-outlinedBorder)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Typography
          level="h4"
          sx={{ fontFamily: 'monospace', letterSpacing: '0.12em' }}
        >
          {codeValue || block.placeholder || 'Waiting...'}
        </Typography>
        <IconButton
          size="sm"
          variant="soft"
          onClick={() => handleCopy(codeValue)}
          disabled={!codeValue}
        >
          <CopyIcon size={16} />
        </IconButton>
      </Box>
    </Box>
  );
}

function CommandBlock({
  block,
  values,
}: {
  block: InstructionBlock;
  values: Record<string, string>;
}) {
  const cmdValue = block.value_key ? values[block.value_key] : null;

  return (
    <Box>
      {block.title && <Typography level="title-md">{block.title}</Typography>}
      {block.description && (
        <Typography level="body-sm" sx={{ mt: 0.5 }}>
          {block.description}
        </Typography>
      )}
      <Box
        sx={{
          mt: 1,
          p: 1.5,
          borderRadius: 'sm',
          border: '1px solid var(--joy-palette-neutral-outlinedBorder)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          flexWrap: 'wrap',
          bgcolor: 'background.level1',
        }}
      >
        {cmdValue ? (
          <>
            <Typography
              level="body-md"
              component="code"
              sx={{
                fontFamily: 'monospace',
                wordBreak: 'break-all',
                flex: 1,
                minWidth: 0,
              }}
            >
              {cmdValue}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                size="sm"
                variant="soft"
                onClick={() => handleCopy(cmdValue)}
              >
                {block.copy_label || 'Copy Command'}
              </Button>
            </Stack>
          </>
        ) : (
          <Typography level="body-sm" sx={{ flex: 1 }}>
            {block.placeholder || 'Waiting...'}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

function KvBlock({
  block,
  values,
}: {
  block: InstructionBlock;
  values: Record<string, string>;
}) {
  const items = block.items || [];
  const hasAnyValue = items.some((item) => values[item.value_key]);
  if (!hasAnyValue) return null;

  return (
    <Box>
      {block.title && (
        <Typography level="body-sm" sx={{ mb: 1, fontWeight: 'bold' }}>
          {block.title}
        </Typography>
      )}
      <Stack spacing={0.5}>
        {items.map((item) => {
          const val = values[item.value_key];
          if (item.optional && !val) return null;
          return (
            <Typography key={item.value_key} level="body-xs">
              {item.label}: <code>{val || '—'}</code>
            </Typography>
          );
        })}
      </Stack>
    </Box>
  );
}

function TextBlock({
  block,
  values,
}: {
  block: InstructionBlock;
  values: Record<string, string>;
}) {
  const content = block.template
    ? resolveTemplate(block.template, values)
    : '';
  if (!content) return null;

  return (
    <Box
      sx={{
        mt: 1,
        p: 1.5,
        bgcolor: 'background.level1',
        borderRadius: 'sm',
      }}
    >
      {block.title && (
        <Typography level="body-sm" sx={{ mb: 1, fontWeight: 'bold' }}>
          {block.title}
        </Typography>
      )}
      <Typography
        level="body-xs"
        component="pre"
        sx={{
          fontFamily: 'monospace',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          fontSize: '0.75rem',
        }}
      >
        {content}
      </Typography>
    </Box>
  );
}

function InstructionRenderer({
  block,
  values,
}: {
  block: InstructionBlock;
  values: Record<string, string>;
}) {
  switch (block.kind) {
    case 'url':
      return <UrlBlock block={block} values={values} />;
    case 'code':
      return <CodeBlock block={block} values={values} />;
    case 'command':
      return <CommandBlock block={block} values={values} />;
    case 'kv':
      return <KvBlock block={block} values={values} />;
    case 'text':
      return <TextBlock block={block} values={values} />;
    default:
      return null;
  }
}

function InstructionsContent({
  instructions,
  ports,
  values,
  isLoading,
  isReady,
  error,
}: {
  instructions: InstructionBlock[];
  ports: PortDef[];
  values: Record<string, string>;
  isLoading: boolean;
  isReady: boolean;
  error: boolean;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center">
        <Chip color={isReady ? 'success' : 'warning'} variant="soft">
          {isReady ? 'Ready' : 'Waiting for connection'}
        </Chip>
        {isLoading && <CircularProgress size="sm" />}
        {error && (
          <Typography level="body-xs" color="danger">
            Failed to load connection info
          </Typography>
        )}
      </Stack>

      {instructions.map((block, i) => (
        <React.Fragment key={i}>
          {i > 0 && block.kind !== 'text' && block.kind !== 'kv' && (
            <Divider />
          )}
          <InstructionRenderer block={block} values={values} />
        </React.Fragment>
      ))}

      {ports.length > 0 && (
        <>
          <Divider />
          <Box>
            <Typography level="title-md">Exposed Ports</Typography>
            <Typography level="body-sm" sx={{ mt: 0.5 }}>
              This service exposes the following ports on the remote host:
            </Typography>
            <Stack spacing={1} direction="row" sx={{ mt: 1 }}>
              {ports.map((p) => (
                <Chip key={p.port} variant="outlined" color="neutral">
                  {p.label}: port {p.port} ({p.protocol})
                </Chip>
              ))}
            </Stack>
          </Box>
        </>
      )}
    </Box>
  );
}

export default function InteractiveModal({
  jobId,
  setJobId,
  embeddedOutput,
}: InteractiveModalProps) {
  const { experimentInfo } = useExperimentInfo();
  const { team } = useAuth();

  const url = React.useMemo(() => {
    if (jobId === -1 || !experimentInfo?.id) {
      return null;
    }
    return chatAPI.Endpoints.Experiment.GetTunnelInfo(
      experimentInfo.id,
      String(jobId),
    );
  }, [experimentInfo?.id, jobId]);

  const {
    data,
    isLoading,
    error,
  }: {
    data: any;
    isLoading: boolean;
    error: any;
  } = useSWR(url, fetcher, {
    refreshInterval: 3000,
    revalidateOnFocus: true,
  });

  const handleClose = () => {
    setJobId(-1);
  };

  if (jobId === -1 || !experimentInfo) {
    return null;
  }

  const isReady = Boolean(data?.is_ready);
  const modalTitle = data?.modal_title || 'Interactive Session';
  const modalSubtitle = data?.modal_subtitle || '';
  const instructions: InstructionBlock[] = data?.instructions || [];
  const ports: PortDef[] = data?.ports || [];

  // Build a flat values map from tunnel_info data for template resolution
  // Includes derived fields like team_id and ssh_command with key injection
  const baseSshCommand: string = data?.ssh_command || '';
  const sshKeyPath = team?.id
    ? `~/org_ssh_key_${team.id}`
    : '~/org_ssh_key_YOUR_TEAM_ID';
  const sshCommandWithKey =
    baseSshCommand && !baseSshCommand.includes('-i')
      ? baseSshCommand.replace(/^ssh\s+/, `ssh -i ${sshKeyPath} `)
      : baseSshCommand;

  const values: Record<string, string> = {
    ...(data || {}),
    team_id: team?.id || 'YOUR_TEAM_ID',
    ssh_command: sshCommandWithKey || baseSshCommand,
    org_ssh_key_path: sshKeyPath,
  };

  // Stringify non-string values for template resolution
  for (const [k, v] of Object.entries(values)) {
    if (v !== null && v !== undefined && typeof v !== 'string') {
      values[k] = String(v);
    }
  }

  return (
    <Modal open={jobId !== -1} onClose={handleClose}>
      <ModalDialog
        sx={{
          maxWidth: '95vw',
          width: '95vw',
          height: '85vh',
          overflow: 'hidden',
        }}
      >
        <ModalClose />
        <Stack spacing={1} sx={{ mb: 1 }}>
          <Typography level="title-lg">
            {modalTitle} (Job {jobId})
          </Typography>
          {modalSubtitle && (
            <Typography level="body-sm" color="neutral">
              {modalSubtitle}
            </Typography>
          )}
        </Stack>
        <Divider />
        {embeddedOutput ? (
          <Box sx={{ display: 'flex', flex: 1, minHeight: 0, gap: 2, mt: 2 }}>
            <Box sx={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
              <InstructionsContent
                instructions={instructions}
                ports={ports}
                values={values}
                isLoading={isLoading}
                isReady={isReady}
                error={!!error}
              />
            </Box>
            <Box
              sx={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {embeddedOutput}
            </Box>
          </Box>
        ) : (
          <Box
            sx={{
              mt: 2,
              maxHeight: '60vh',
              overflow: 'auto',
            }}
          >
            <InstructionsContent
              instructions={instructions}
              ports={ports}
              values={values}
              isLoading={isLoading}
              isReady={isReady}
              error={!!error}
            />
          </Box>
        )}
      </ModalDialog>
    </Modal>
  );
}

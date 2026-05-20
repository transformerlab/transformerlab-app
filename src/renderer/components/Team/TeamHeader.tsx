import { Box, Button, Option, Select, Stack, Typography } from '@mui/joy';
import { BarChart3Icon, PlusIcon, Trash2Icon, User2Icon } from 'lucide-react';

type TeamSummary = {
  id: string;
  name: string;
};

type Props = {
  teams: TeamSummary[] | undefined;
  teamLogos: Record<string, string>;
  currentTeamId: string | undefined;
  onSelectTeam: (teamId: string) => void;
  loading: boolean;
  teamLogo: string | null;
  iAmOwner: boolean;
  isPersonalTeam: boolean;
  hasCurrentTeam: boolean;
  onNewTeam: () => void;
  onRename: () => void;
  onDelete: () => void;
  onLeave: () => void;
  onViewUsageReport: () => void;
  onSetLogo: () => void;
  onRemoveLogo: () => void;
};

export default function TeamHeader({
  teams,
  teamLogos,
  currentTeamId,
  onSelectTeam,
  loading,
  teamLogo,
  iAmOwner,
  isPersonalTeam,
  hasCurrentTeam,
  onNewTeam,
  onRename,
  onDelete,
  onLeave,
  onViewUsageReport,
  onSetLogo,
  onRemoveLogo,
}: Props): JSX.Element {
  return (
    <Box>
      <Typography level="title-lg" mb={1}>
        Current Team:
      </Typography>
      <Stack direction="row" spacing={2} alignItems="center" maxWidth={500}>
        <Select
          value={currentTeamId ?? ''}
          onChange={(_, value) => {
            const selectedId = value as string;
            if (selectedId) onSelectTeam(selectedId);
          }}
          disabled={loading}
          aria-label="Select team"
          sx={{ minWidth: 300 }}
        >
          {teams?.map((team) => {
            const teamLogoUrl = teamLogos[team.id];
            return (
              <Option key={team.id} value={team.id}>
                <Stack direction="row" spacing={1} alignItems="center">
                  {teamLogoUrl ? (
                    <Box
                      component="img"
                      src={teamLogoUrl}
                      alt={`${team.name} logo`}
                      sx={{
                        width: 20,
                        height: 20,
                        objectFit: 'contain',
                        borderRadius: 'sm',
                      }}
                    />
                  ) : (
                    <Box
                      sx={{
                        width: 20,
                        height: 20,
                        borderRadius: 'sm',
                        bgcolor: 'neutral.200',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <User2Icon size={12} />
                    </Box>
                  )}
                  <Typography>{team.name}</Typography>
                </Stack>
              </Option>
            );
          })}
        </Select>

        <Box sx={{ mt: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button
            onClick={onNewTeam}
            disabled={loading}
            variant="soft"
            startDecorator={<PlusIcon />}
          >
            New Team
          </Button>
        </Box>
      </Stack>

      <Stack mt={3} gap={1} maxWidth={500}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          {teamLogo ? (
            <Box
              component="img"
              src={teamLogo}
              alt="Team logo"
              sx={{
                width: 64,
                height: 64,
                objectFit: 'contain',
                borderRadius: 'sm',
                border: '1px solid',
                borderColor: 'divider',
              }}
            />
          ) : (
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: 'sm',
                bgcolor: 'neutral.200',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <User2Icon size={32} />
            </Box>
          )}
          <Stack gap={1}>
            <Button variant="outlined" onClick={onRename} disabled={!iAmOwner}>
              Rename Team
            </Button>
            <Button
              variant="outlined"
              color="danger"
              startDecorator={<Trash2Icon size={16} />}
              onClick={onDelete}
              disabled={!iAmOwner || isPersonalTeam}
            >
              Delete Team
            </Button>
            <Button
              variant="soft"
              color="neutral"
              onClick={onLeave}
              disabled={isPersonalTeam || !hasCurrentTeam}
            >
              Leave Team
            </Button>
            <Button
              variant="outlined"
              startDecorator={<BarChart3Icon />}
              onClick={onViewUsageReport}
              disabled={!iAmOwner}
            >
              Usage Report {!iAmOwner ? '(Only owners can view)' : ''}
            </Button>
            <Button variant="outlined" onClick={onSetLogo} disabled={!iAmOwner}>
              {teamLogo ? 'Change Logo' : 'Set Logo'}
            </Button>
            {teamLogo && (
              <Button
                variant="outlined"
                color="danger"
                onClick={onRemoveLogo}
                disabled={!iAmOwner}
              >
                Remove Logo
              </Button>
            )}
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}

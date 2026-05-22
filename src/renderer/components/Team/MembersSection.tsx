import { Box, Button, Stack, Table, Tooltip, Typography } from '@mui/joy';
import { PlusIcon, User2Icon } from 'lucide-react';

type Member = {
  user_id?: string;
  email?: string;
  role?: string;
};

type Props = {
  members: Member[] | undefined;
  roleError?: string;
  iAmOwner: boolean;
  currentUserId?: string;
  onUpdateRole: (userId: string, currentRole: string) => void;
  onInvite: () => void;
};

export default function MembersSection({
  members,
  roleError,
  iAmOwner,
  currentUserId,
  onUpdateRole,
  onInvite,
}: Props): JSX.Element {
  const ownerCount = members?.filter((m) => m.role === 'owner').length ?? 0;
  return (
    <Box sx={{ mt: 3 }}>
      <Typography level="title-lg" mb={1}>
        Members: ({members?.length ?? 0})
      </Typography>

      {roleError ? (
        <Box sx={{ mb: 0 }}>
          <Typography level="body-sm" sx={{ color: 'red' }}>
            {roleError}
          </Typography>
        </Box>
      ) : null}

      <Table variant="soft" sx={{ mb: 2 }}>
        <thead>
          <tr>
            <th>Member</th>
            <th>Role</th>
            <th>&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          {members?.map((m, idx) => {
            const isSelf = !!currentUserId && m.user_id === currentUserId;
            // Hide the demote button when clicking it would leave the team
            // with zero owners (the backend rejects this, but hiding the
            // button avoids a dead-end click + error message).
            const wouldStrandTeam =
              isSelf && m.role === 'owner' && ownerCount <= 1;
            const showRoleButton = iAmOwner && !wouldStrandTeam;
            return (
              <tr key={m.user_id ?? m.email ?? idx}>
                <td>
                  <Stack direction="row" alignItems="center" gap={1}>
                    <User2Icon />
                    <Box>
                      <Typography fontWeight="md">{m?.email ?? '—'}</Typography>
                    </Box>
                  </Stack>
                </td>
                <td>{m?.role}</td>
                <td>
                  {showRoleButton ? (
                    <Box
                      sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
                    >
                      <Button
                        variant="outlined"
                        onClick={() =>
                          onUpdateRole(m.user_id ?? '', m.role ?? '')
                        }
                      >
                        {m?.role === 'owner'
                          ? 'Change role to member'
                          : 'Change role to owner'}
                      </Button>
                    </Box>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <Tooltip
        title={!iAmOwner ? 'Only owners can invite members' : ''}
        disableHoverListener={iAmOwner}
      >
        <span>
          <Button
            startDecorator={<PlusIcon />}
            onClick={onInvite}
            variant="soft"
            disabled={!iAmOwner}
          >
            Invite Member
          </Button>
        </span>
      </Tooltip>
    </Box>
  );
}

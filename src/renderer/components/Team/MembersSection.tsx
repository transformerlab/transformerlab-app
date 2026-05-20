import { Box, Button, Stack, Table, Typography } from '@mui/joy';
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
  onUpdateRole: (userId: string, currentRole: string) => void;
  onInvite: () => void;
};

export default function MembersSection({
  members,
  roleError,
  iAmOwner,
  onUpdateRole,
  onInvite,
}: Props): JSX.Element {
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
          {members?.map((m, idx) => (
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
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Button
                    variant="outlined"
                    onClick={() => onUpdateRole(m.user_id ?? '', m.role ?? '')}
                  >
                    {m?.role === 'owner'
                      ? 'Change role to member'
                      : 'Change role to owner'}
                  </Button>
                </Box>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Button
        startDecorator={<PlusIcon />}
        onClick={onInvite}
        variant="soft"
        disabled={!iAmOwner}
      >
        Invite Member {!iAmOwner ? '(Only owners can invite members)' : ''}
      </Button>
    </Box>
  );
}

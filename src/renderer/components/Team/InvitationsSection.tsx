import { Box, Button, Chip, Stack, Switch, Table, Typography } from '@mui/joy';

type Invitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  invited_by_email?: string;
  expires_at?: string | null;
};

type Props = {
  iAmOwner: boolean;
  allInvitations: Invitation[];
  visibleInvitations: Invitation[];
  acceptedInvitations: Invitation[];
  showExpiredInvitations: boolean;
  onToggleShowExpired: (value: boolean) => void;
  onViewAccepted: () => void;
  onCancelInvitation: (invitationId: string) => void;
};

export default function InvitationsSection({
  iAmOwner,
  allInvitations,
  visibleInvitations,
  acceptedInvitations,
  showExpiredInvitations,
  onToggleShowExpired,
  onViewAccepted,
  onCancelInvitation,
}: Props): JSX.Element | null {
  if (!iAmOwner) return null;

  return (
    <Box sx={{ mt: 3 }}>
      <Box
        sx={{
          mb: 1,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography level="title-lg">Invitations</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography level="body-sm">Show expired</Typography>
          <Switch
            size="sm"
            checked={showExpiredInvitations}
            onChange={(event) => onToggleShowExpired(event.target.checked)}
          />
          <Button size="sm" variant="outlined" onClick={onViewAccepted}>
            View Accepted ({acceptedInvitations.length})
          </Button>
        </Stack>
      </Box>
      {allInvitations.length === 0 && (
        <Typography level="body-sm" color="neutral">
          No invitations have been sent for this team yet.
        </Typography>
      )}
      {allInvitations.length > 0 && visibleInvitations.length === 0 && (
        <Typography level="body-sm" color="neutral" sx={{ mb: 2 }}>
          No pending invitations.
        </Typography>
      )}
      {visibleInvitations.length > 0 && (
        <Table variant="soft" sx={{ mb: 2 }}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Invited By</th>
              <th>Expires</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleInvitations.map((invitation) => (
              <tr key={invitation.id}>
                <td>
                  <Typography level="body-sm">{invitation.email}</Typography>
                </td>
                <td>
                  <Chip size="sm" variant="soft">
                    {invitation.role}
                  </Chip>
                </td>
                <td>
                  <Chip
                    size="sm"
                    variant="soft"
                    color={
                      invitation.status === 'pending'
                        ? 'primary'
                        : invitation.status === 'accepted'
                          ? 'success'
                          : invitation.status === 'rejected' ||
                              invitation.status === 'cancelled'
                            ? 'danger'
                            : 'neutral'
                    }
                  >
                    {invitation.status}
                  </Chip>
                </td>
                <td>
                  <Typography level="body-sm">
                    {invitation.invited_by_email}
                  </Typography>
                </td>
                <td>
                  <Typography level="body-xs">
                    {invitation.expires_at
                      ? new Date(invitation.expires_at).toLocaleDateString()
                      : '—'}
                  </Typography>
                </td>
                <td>
                  {invitation.status === 'pending' && (
                    <Button
                      size="sm"
                      variant="outlined"
                      color="neutral"
                      onClick={() => onCancelInvitation(invitation.id)}
                    >
                      Cancel
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Box>
  );
}

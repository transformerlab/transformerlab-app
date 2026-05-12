import {
  Modal,
  ModalDialog,
  ModalClose,
  Typography,
  Table,
  Chip,
} from '@mui/joy';

interface AcceptedInvitationsModalProps {
  open: boolean;
  onClose: () => void;
  invitations: any[];
}

export default function AcceptedInvitationsModal({
  open,
  onClose,
  invitations,
}: AcceptedInvitationsModalProps) {
  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        aria-labelledby="accepted-invitations-title"
        sx={{ minWidth: 700 }}
      >
        <ModalClose />
        <Typography id="accepted-invitations-title" level="h4" mb={1}>
          Accepted Invitations
        </Typography>
        {invitations.length === 0 ? (
          <Typography level="body-sm" color="neutral">
            No accepted invitations yet.
          </Typography>
        ) : (
          <Table variant="soft">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Invited By</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((invitation: any) => (
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
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </ModalDialog>
    </Modal>
  );
}

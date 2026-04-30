import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Card, Stack, Typography } from '@mui/joy';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from 'renderer/lib/authContext';
import { getPath } from 'renderer/lib/api-client/urls';

type InvitationData = {
  id: string;
  email: string;
  team_id: string;
  team_name: string;
  role: string;
  status: string;
  invited_by_email: string;
  expires_at: string;
  created_at: string;
};

export default function InvitationLanding() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user, fetchWithAuth } = useAuth();

  const token = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('token') ?? '';
  }, [location.search]);

  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!resultMessage) return;

    const nextPath =
      invitation?.status === 'accepted'
        ? '/user'
        : invitation?.status === 'rejected'
          ? '/'
          : null;
    if (!nextPath) return;

    const redirectTimer = window.setTimeout(() => {
      navigate(nextPath);
    }, 1500);

    return () => {
      window.clearTimeout(redirectTimer);
    };
  }, [resultMessage, invitation?.status, navigate]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError('Missing invitation token.');
      return;
    }

    const loadInvitation = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchWithAuth(
          getPath('invitations', ['byToken'], { token }),
          { method: 'GET' },
        );

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          setError(data.detail ?? 'Failed to load invitation.');
          return;
        }

        const data = (await response.json()) as InvitationData;
        setInvitation(data);
      } catch {
        setError('Failed to load invitation.');
      } finally {
        setLoading(false);
      }
    };

    loadInvitation();
  }, [fetchWithAuth, token]);

  const handleAccept = async () => {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetchWithAuth(
        getPath('invitations', ['accept'], {}),
        {
          method: 'POST',
          body: JSON.stringify({ token }),
        },
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.detail ?? 'Failed to accept invitation.');
        return;
      }

      setResultMessage(
        `Invitation accepted. You joined ${data.team_name ?? 'the team'}.`,
      );
      setInvitation((prev) =>
        prev
          ? {
              ...prev,
              status: 'accepted',
            }
          : prev,
      );
    } catch {
      setError('Failed to accept invitation.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = async () => {
    if (!invitation?.id) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetchWithAuth(
        getPath('invitations', ['reject'], { invitationId: invitation.id }),
        { method: 'POST' },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.detail ?? 'Failed to decline invitation.');
        return;
      }

      setResultMessage('Invitation declined.');
      setInvitation((prev) =>
        prev
          ? {
              ...prev,
              status: 'rejected',
            }
          : prev,
      );
    } catch {
      setError('Failed to decline invitation.');
    } finally {
      setSubmitting(false);
    }
  };

  const userEmail = user?.email ?? '';
  const isMismatch =
    isAuthenticated &&
    invitation &&
    userEmail &&
    invitation.email !== userEmail;
  const canAct =
    isAuthenticated &&
    invitation &&
    !isMismatch &&
    invitation.status === 'pending' &&
    !resultMessage;

  return (
    <Box sx={{ width: '100%', maxWidth: 680 }}>
      <Card variant="outlined" sx={{ p: 3 }}>
        <Typography level="h3" sx={{ mb: 1 }}>
          Team Invitation
        </Typography>

        {loading && <Typography>Loading invitation...</Typography>}
        {!loading && error && <Alert color="danger">{error}</Alert>}

        {!loading && invitation && (
          <Stack spacing={1.2}>
            <Typography>
              You were invited to join <strong>{invitation.team_name}</strong>{' '}
              as <strong>{invitation.role}</strong>.
            </Typography>
            <Typography level="body-sm" color="neutral">
              Invited email: {invitation.email}
            </Typography>
            <Typography level="body-sm" color="neutral">
              Invited by: {invitation.invited_by_email}
            </Typography>
            <Typography level="body-sm" color="neutral">
              Status: {invitation.status}
            </Typography>

            {!isAuthenticated && (
              <Alert color="warning">
                Sign in with <strong>{invitation.email}</strong> to accept or
                decline this invitation.
              </Alert>
            )}

            {isMismatch && (
              <Alert color="danger">
                You are signed in as {userEmail}, but this invitation is for{' '}
                {invitation.email}. Please sign out, then sign in with the
                invited account.
              </Alert>
            )}

            {resultMessage && (
              <Alert color="success">
                {resultMessage}{' '}
                {invitation?.status === 'accepted'
                  ? 'Redirecting to User Settings...'
                  : invitation?.status === 'rejected'
                    ? 'Redirecting to home...'
                    : null}
              </Alert>
            )}

            {canAct && (
              <Stack direction="row" spacing={1}>
                <Button loading={submitting} onClick={handleAccept}>
                  Accept
                </Button>
                <Button
                  loading={submitting}
                  variant="outlined"
                  color="neutral"
                  onClick={handleDecline}
                >
                  Decline
                </Button>
              </Stack>
            )}

            {!isAuthenticated && (
              <Button
                onClick={() => {
                  localStorage.setItem(
                    'redirectAfterLogin',
                    window.location.hash,
                  );
                  navigate('/');
                }}
              >
                Go to Login
              </Button>
            )}
          </Stack>
        )}
      </Card>
    </Box>
  );
}

/**
 * Universal notifications summary: aggregates pending items (team invites,
 * outdated plugins, etc.) for sidebar and menu badges.
 */

import { useAPI } from 'renderer/lib/authContext';

interface NotificationsByCategory {
  teamInvites: number;
}

export interface NotificationsSummary {
  totalCount: number;
  byCategory: NotificationsByCategory;
}

/**
 * Returns a single summary of all pending notifications.
 * - teamInvites: from invitations/me (when logged in).
 */
export function useNotificationsSummary(
  _experimentInfo?: { id?: string } | null,
): NotificationsSummary {
  const { data: invitationsData } = useAPI('invitations', ['me'], {});

  const teamInvites = invitationsData?.invitations?.length ?? 0;

  const byCategory: NotificationsByCategory = {
    teamInvites,
  };

  const totalCount = teamInvites;

  return {
    totalCount,
    byCategory,
  };
}

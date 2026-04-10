/**
 * Universal notifications summary: aggregates pending items (team invites,
 * outdated plugins, etc.) for sidebar and menu badges.
 */

import { useAPI } from 'renderer/lib/authContext';

/** Category IDs for notification types. Extend when adding new sources. */
export const NOTIFICATION_CATEGORIES = {
  TEAM_INVITES: 'teamInvites',
} as const;

export type NotificationCategoryId =
  (typeof NOTIFICATION_CATEGORIES)[keyof typeof NOTIFICATION_CATEGORIES];

export interface NotificationsByCategory {
  teamInvites: number;
}

export interface NotificationsSummary {
  totalCount: number;
  byCategory: NotificationsByCategory;
}

const EMPTY_SUMMARY: NotificationsSummary = {
  totalCount: 0,
  byCategory: {
    teamInvites: 0,
  },
};

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

export { EMPTY_SUMMARY };

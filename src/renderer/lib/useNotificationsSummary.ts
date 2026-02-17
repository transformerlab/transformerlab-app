/**
 * Universal notifications summary: aggregates pending items (team invites,
 * outdated plugins, etc.) for sidebar and menu badges.
 */

import { useAPI } from 'renderer/lib/authContext';
import { usePluginStatus } from 'renderer/lib/transformerlab-api-sdk';

/** Category IDs for notification types. Extend when adding new sources. */
export const NOTIFICATION_CATEGORIES = {
  TEAM_INVITES: 'teamInvites',
  OUTDATED_PLUGINS: 'outdatedPlugins',
} as const;

export type NotificationCategoryId =
  (typeof NOTIFICATION_CATEGORIES)[keyof typeof NOTIFICATION_CATEGORIES];

export interface NotificationsByCategory {
  teamInvites: number;
  outdatedPlugins: number;
}

export interface NotificationsSummary {
  totalCount: number;
  byCategory: NotificationsByCategory;
}

const EMPTY_SUMMARY: NotificationsSummary = {
  totalCount: 0,
  byCategory: {
    teamInvites: 0,
    outdatedPlugins: 0,
  },
};

/**
 * Returns a single summary of all pending notifications.
 * - teamInvites: from invitations/me (when logged in).
 * - outdatedPlugins: from plugin status when experimentInfo is provided (local mode).
 */
export function useNotificationsSummary(
  experimentInfo?: { id?: string } | null,
): NotificationsSummary {
  const { data: invitationsData } = useAPI('invitations', ['me'], {});
  const isLocalMode = window?.platform?.multiuser !== true;
  const { data: outdatedPlugins } = usePluginStatus(
    isLocalMode ? (experimentInfo ?? null) : null,
  );

  const teamInvites = invitationsData?.invitations?.length ?? 0;
  const outdatedPluginsCount = outdatedPlugins?.length ?? 0;

  const byCategory: NotificationsByCategory = {
    teamInvites,
    outdatedPlugins: outdatedPluginsCount,
  };

  const totalCount = teamInvites + outdatedPluginsCount;

  return {
    totalCount,
    byCategory,
  };
}

export { EMPTY_SUMMARY };

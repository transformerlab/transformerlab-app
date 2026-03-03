import { Box, IconButton, Typography } from '@mui/joy';
import { useState, useEffect } from 'react';
import { XIcon } from 'lucide-react';
import { API_URL } from 'renderer/lib/api-client/urls';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Announcement {
  date: string;
  title: string;
  content: string;
  expires?: string | null;
}

function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

const localStorageKey = 'latestAnnouncementDate';

async function getStoredDate(): Promise<string | null> {
  if ((window as any).storage) {
    return (window as any).storage.get(localStorageKey);
  }
  return localStorage.getItem(localStorageKey);
}

async function setStoredDate(date: string): Promise<void> {
  if ((window as any).storage) {
    await (window as any).storage.set(localStorageKey, date);
  } else {
    localStorage.setItem(localStorageKey, date);
  }
}

// Set to true to force-show a test announcement for development
const FORCE_SHOW = false;

export default function AnnouncementBanner() {
  const [currentAnnouncement, setCurrentAnnouncement] =
    useState<Announcement | null>(() =>
      FORCE_SHOW
        ? {
            date: '2025-01-01',
            title: 'Test Announcement',
            content: 'This is a test announcement for development purposes.',
          }
        : null,
    );
  const [hasChecked, setHasChecked] = useState(FORCE_SHOW);

  useEffect(() => {
    const isConnected = API_URL() !== null;
    if (!isConnected || hasChecked) return;

    const checkForAnnouncements = async () => {
      try {
        const response = await chatAPI.authenticatedFetch(
          `${API_URL()}server/announcements`,
        );
        if (!response.ok) {
          setHasChecked(true);
          return;
        }

        const result = await response.json();
        const announcements: Announcement[] = result.data || [];

        if (!announcements || announcements.length === 0) {
          setHasChecked(true);
          return;
        }

        const lastViewedDate = await getStoredDate();
        const now = new Date();

        const sortedAll = [...announcements].sort(
          (a, b) =>
            parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime(),
        );
        const latestOverall = sortedAll[0];

        // If no announcement viewed yet and the latest is expired, mark viewed silently
        if (!lastViewedDate && latestOverall?.expires) {
          if (parseLocalDate(latestOverall.expires) < now) {
            await setStoredDate(latestOverall.date);
            setHasChecked(true);
            return;
          }
        }

        // Mark expired unseen announcements as viewed
        let latestViewed = lastViewedDate;
        for (const a of announcements) {
          const aDate = parseLocalDate(a.date);
          const isNewer =
            !lastViewedDate || aDate > parseLocalDate(lastViewedDate);
          if (isNewer && a.expires && parseLocalDate(a.expires) < now) {
            if (
              aDate >
              (latestViewed ? parseLocalDate(latestViewed) : new Date(0))
            ) {
              latestViewed = a.date;
            }
          }
        }

        if (latestViewed !== lastViewedDate && latestViewed) {
          await setStoredDate(latestViewed);
        }
        const effectiveLastViewed = latestViewed ?? lastViewedDate;

        // Filter valid (non-expired) announcements
        const valid = announcements.filter(
          (a) => !a.expires || parseLocalDate(a.expires) >= now,
        );
        if (valid.length === 0) {
          setHasChecked(true);
          return;
        }

        const latest = [...valid].sort(
          (a, b) =>
            parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime(),
        )[0];

        setHasChecked(true);

        if (
          latest &&
          (!effectiveLastViewed ||
            parseLocalDate(latest.date) > parseLocalDate(effectiveLastViewed))
        ) {
          setCurrentAnnouncement(latest);
        }
      } catch {
        setHasChecked(true);
      }
    };

    const timer = setTimeout(checkForAnnouncements, 1000);
    return () => clearTimeout(timer);
  }, [hasChecked]);

  async function handleDismiss() {
    if (currentAnnouncement) {
      await setStoredDate(currentAnnouncement.date);
    }
    setCurrentAnnouncement(null);
  }

  if (!currentAnnouncement) return null;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1,
        px: 2,
        py: 1,
        mx: -4,
        mt: -2,
        mb: 2,
        backgroundColor: 'var(--joy-palette-warning-softBg)',
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0, '& p': { margin: 0 } }}>
        <Typography level="title-sm" sx={{ mb: 0.5 }}>
          📢 {currentAnnouncement.title}
        </Typography>
        <Typography level="body-sm" component="div">
          <Markdown remarkPlugins={[remarkGfm]}>
            {currentAnnouncement.content}
          </Markdown>
        </Typography>
      </Box>
      <IconButton
        size="sm"
        variant="plain"
        color="neutral"
        onClick={handleDismiss}
        sx={{ mt: 0.25 }}
      >
        <XIcon size={16} />
      </IconButton>
    </Box>
  );
}

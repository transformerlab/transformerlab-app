import {
  Button,
  DialogContent,
  DialogTitle,
  Modal,
  ModalDialog,
  Typography,
} from '@mui/joy';
import React, { useState, useEffect } from 'react';
import { API_URL } from 'renderer/lib/api-client/urls';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import announcementsData from './announcements.json';

interface Announcement {
  date: string;
  title: string;
  content: string;
}

interface AnnouncementsData {
  announcements: Announcement[];
}

// Parse date string as local date to avoid timezone issues
// e.g., "2025-01-15" becomes a Date object for Jan 15 in local timezone
function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export default function AnnouncementsModal() {
  const [open, setOpen] = useState(false);
  const [currentAnnouncement, setCurrentAnnouncement] =
    useState<Announcement | null>(null);
  // Tracks whether we've already fetched announcements for the current connection
  const [hasChecked, setHasChecked] = useState(false);

  const { server, isLoading, isError } = chatAPI.useServerStats();
  const localStorageKey = 'latestAnnouncementDate';

  // Reset hasChecked when connection is lost
  useEffect(() => {
    const isConnected = API_URL() !== null;
    if (!isConnected && hasChecked) {
      setHasChecked(false);
      setOpen(false);
      setCurrentAnnouncement(null);
    }
  }, [hasChecked, server]);

  // Check for new announcements on connection
  useEffect(() => {
    // Only check when connected
    const isConnected = API_URL() !== null;

    // Wait for connection to be established
    if (!isConnected || isLoading || isError || !server) {
      return;
    }

    // Only check once per connection
    if (hasChecked) {
      return;
    }

    const checkForAnnouncements = async () => {
      try {
        const data = announcementsData as AnnouncementsData;
        if (!data.announcements || data.announcements.length === 0) {
          setHasChecked(true);
          return;
        }

        // Get the latest announcement only (even if there are many announcements,
        // new users will only see the most recent one)
        // Sort announcements by date descending to ensure we get the latest
        const sortedAnnouncements = [...data.announcements].sort(
          (a, b) =>
            parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime(),
        );
        const latestAnnouncement = sortedAnnouncements[0];

        if (!latestAnnouncement) {
          setHasChecked(true);
          return;
        }

        // Get the last viewed announcement date from localStorage
        let lastViewedDate: string | null = null;
        if ((window as any).storage) {
          lastViewedDate = await (window as any).storage.get(localStorageKey);
        } else {
          lastViewedDate = localStorage.getItem(localStorageKey);
        }

        // Mark as checked whether we show the announcement or not
        setHasChecked(true);

        // If no last viewed date, or if the latest announcement is newer, show it
        if (
          !lastViewedDate ||
          parseLocalDate(latestAnnouncement.date) >
            parseLocalDate(lastViewedDate)
        ) {
          setCurrentAnnouncement(latestAnnouncement);
          setOpen(true);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error checking announcements:', error);
        setHasChecked(true); // Mark as checked even on error to prevent infinite retries
      }
    };

    // Small delay to ensure connection is fully established
    const timer = setTimeout(() => {
      checkForAnnouncements();
    }, 1000);

    // eslint-disable-next-line consistent-return
    return function cleanup() {
      clearTimeout(timer);
    };
  }, [isLoading, server, isError, hasChecked]);

  async function handleClose() {
    if (currentAnnouncement) {
      // Save the announcement date to localStorage
      if ((window as any).storage) {
        await (window as any).storage.set(
          localStorageKey,
          currentAnnouncement.date,
        );
      } else {
        localStorage.setItem(localStorageKey, currentAnnouncement.date);
      }
    }
    setOpen(false);
  }

  if (!currentAnnouncement) {
    return null;
  }

  return (
    <Modal open={open} onClose={() => handleClose()}>
      <ModalDialog
        variant="soft"
        sx={{
          minWidth: '25vw',
          maxWidth: '50vw',
          maxHeight: '100%',
          overflowY: 'hidden',
        }}
        color="primary"
      >
        <DialogTitle level="h2">
          📢&nbsp;{currentAnnouncement.title}
        </DialogTitle>
        <DialogContent sx={{ pt: 2, overflowY: 'auto', overflowX: 'hidden' }}>
          <Typography level="body-md">{currentAnnouncement.content}</Typography>
          {currentAnnouncement.date && (
            <Typography level="body-sm" sx={{ mt: 2, opacity: 0.7 }}>
              {parseLocalDate(currentAnnouncement.date).toLocaleDateString()}
            </Typography>
          )}
        </DialogContent>
        <Button
          sx={{ width: 'fit-content', alignSelf: 'flex-end', mt: 1 }}
          onClick={() => {
            handleClose();
          }}
        >
          Got it
        </Button>
      </ModalDialog>
    </Modal>
  );
}

import React, {
  useState,
  useMemo,
  useCallback,
  createContext,
  useContext,
} from 'react';
import { Alert, IconButton, Stack } from '@mui/joy';
import {
  CheckCircleIcon,
  XIcon,
  InfoIcon,
  AlertCircleIcon,
  AlertTriangleIcon,
} from 'lucide-react';

interface Notification {
  id: string;
  type: 'success' | 'warning' | 'danger';
  message: string;
  autoClose?: boolean;
  duration?: number;
}

interface NotificationContextType {
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  removeNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType>({
  addNotification: () => {},
  removeNotification: () => {},
});

export const useNotification = () => useContext(NotificationContext);

interface NotificationProviderProps {
  children: React.ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({
  children,
}) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.filter((notification) => notification.id !== id),
    );
  }, []);

  const addNotification = useCallback(
    (notification: Omit<Notification, 'id'>) => {
      const id = Math.random().toString(36).substr(2, 9);
      const newNotification: Notification = {
        ...notification,
        id,
        autoClose: notification.autoClose ?? true,
        duration: notification.duration ?? 7000,
      };

      setNotifications((prev) => [...prev, newNotification]);

      if (newNotification.autoClose) {
        setTimeout(() => {
          removeNotification(id);
        }, newNotification.duration);
      }
    },
    [removeNotification],
  );

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircleIcon size={20} />;
      case 'warning':
        return <AlertTriangleIcon size={20} />;
      case 'danger':
        return <AlertCircleIcon size={20} />;
      default:
        return <InfoIcon size={20} />;
    }
  };

  const contextValue = useMemo(
    () => ({ addNotification, removeNotification }),
    [addNotification, removeNotification],
  );

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      {notifications.length > 0 && (
        <Stack
          spacing={1}
          sx={{
            position: 'fixed',
            bottom: 16,
            right: 16,
            zIndex: 9999,
            maxWidth: 400,
          }}
        >
          {notifications.map((notification) => (
            <Alert
              key={notification.id}
              color={notification.type}
              startDecorator={getIcon(notification.type)}
              endDecorator={
                <IconButton
                  variant="plain"
                  color={notification.type}
                  size="sm"
                  onClick={() => removeNotification(notification.id)}
                >
                  <XIcon size={16} />
                </IconButton>
              }
              sx={{
                boxShadow: 'md',
                border: '1px solid',
                borderColor: `${notification.type}.outlinedBorder`,
              }}
            >
              {notification.message}
            </Alert>
          ))}
        </Stack>
      )}
    </NotificationContext.Provider>
  );
};

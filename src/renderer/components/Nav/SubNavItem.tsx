import { ReactElement } from 'react';
import { useNavigate, useMatch } from 'react-router-dom';

import ListItem from '@mui/joy/ListItem';
import ListItemContent from '@mui/joy/ListItemContent';
import ListItemDecorator from '@mui/joy/ListItemDecorator';
import ListItemButton from '@mui/joy/ListItemButton';
import { Badge, Typography } from '@mui/joy';

const SubNavItem = ({
  title,
  path,
  icon,
  disabled = false,
  counter = null,
}: {
  title: string;
  path: string;
  icon: ReactElement;
  disabled?: boolean;
  counter?: number | null;
}) => {
  const navigate = useNavigate();
  const match = useMatch(path);

  return (
    <ListItem className="FirstSidebar_Content">
      <ListItemButton
        onClick={() => navigate(path)}
        variant={match ? 'soft' : 'plain'}
        selected={!!match}
        disabled={disabled}
      >
        <ListItemDecorator sx={{ minInlineSize: '30px' }}>
          {icon}
        </ListItemDecorator>
        <ListItemContent
          sx={{
            display: 'flex',
            justifyContent: 'flex-start',
            alignContent: 'center',
          }}
        >
          <Badge
            variant="plain"
            badgeContent={counter}
            badgeInset="8px -14px 0 0"
            size="sm"
          >
            <Typography level="body-sm">{title}</Typography>
          </Badge>
        </ListItemContent>
      </ListItemButton>
    </ListItem>
  );
};

export default SubNavItem;

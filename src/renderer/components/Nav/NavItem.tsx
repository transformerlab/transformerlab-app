import { cloneElement, ReactElement } from 'react';
import { useNavigate, useMatch } from 'react-router-dom';

import { IconButton, Tooltip } from '@mui/joy';

const NavItem = ({
  title,
  path,
  icon,
  disabled = false,
}: {
  title: string;
  path: string;
  icon: ReactElement;
  disabled?: boolean;
}) => {
  const navigate = useNavigate();
  const match = useMatch(path);

  return (
    <Tooltip title={title} placement="right">
      <IconButton
        variant={match ? 'soft' : 'plain'}
        onClick={() => navigate(path)}
        disabled={disabled}
      >
        {cloneElement(icon, {
          strokeWidth: 1.5,
        })}
      </IconButton>
    </Tooltip>
  );
};

export default NavItem;

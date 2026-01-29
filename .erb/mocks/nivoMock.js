const React = require('react');

const Bar = () => React.createElement('div', { 'data-testid': 'nivo-bar' });
const ResponsiveBar = () => React.createElement('div', { 'data-testid': 'nivo-responsive-bar' });
const ResponsiveLine = () => React.createElement('div', { 'data-testid': 'nivo-responsive-line' });
const ResponsiveRadar = () => React.createElement('div', { 'data-testid': 'nivo-responsive-radar' });

module.exports = { 
  Bar, 
  ResponsiveBar, 
  ResponsiveLine,
  ResponsiveRadar,
};

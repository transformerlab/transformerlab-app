const React = require('react');

function Markdown({ children }) {
  return React.createElement('div', { 'data-testid': 'markdown' }, children);
}

module.exports = Markdown;
module.exports.default = Markdown;

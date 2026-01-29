import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../renderer/App';

describe('App', () => {
  it('should render', () => {
    expect(
      render(
        <MemoryRouter>
          <App />
        </MemoryRouter>
      )
    ).toBeTruthy();
  });
});

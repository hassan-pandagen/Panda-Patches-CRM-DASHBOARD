import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import LoginPage from './pages/LoginPage';

describe('LoginPage', () => {
  it('renders the login page with the correct title', () => {
    render(<LoginPage />);
    expect(screen.getByText('Panda Patches CRM')).toBeInTheDocument();
  });
});

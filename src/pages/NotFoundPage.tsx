import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';

const NotFoundPage: React.FC = () => {
  useEffect(() => {
    // Set noindex dynamically for this page
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f3f3f3',
      fontFamily: 'sans-serif',
      textAlign: 'center',
      padding: '20px',
    }}>
      <img
        src="/favicon.ico"
        alt="Panda Patches"
        style={{ width: 64, height: 64, marginBottom: 24, opacity: 0.4 }}
      />
      <h1 style={{ fontSize: 72, fontWeight: 800, color: '#0b0b0b', margin: 0 }}>404</h1>
      <p style={{ fontSize: 18, color: '#555', margin: '12px 0 32px' }}>
        This page doesn't exist.
      </p>
      <Link
        to="/login"
        style={{
          backgroundColor: '#fb6e1d',
          color: '#fff',
          padding: '12px 28px',
          borderRadius: 6,
          textDecoration: 'none',
          fontWeight: 700,
          fontSize: 15,
        }}
      >
        Go to Login
      </Link>
    </div>
  );
};

export default NotFoundPage;

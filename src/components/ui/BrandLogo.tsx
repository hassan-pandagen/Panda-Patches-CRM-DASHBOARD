import React from 'react';
// 👇 Import the PNG instead
import logoSrc from '../../assets/logo.png'; 

interface BrandLogoProps {
  className?: string;
  variant?: 'light' | 'dark';
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ className = "h-10", variant = 'dark' }) => {
  return (
    <img 
      src={logoSrc} 
      className={className}
      alt="Panda Patches"
      style={{ objectFit: 'contain' }} 
    />
  );
};
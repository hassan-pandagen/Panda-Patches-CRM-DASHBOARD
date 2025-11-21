import React from 'react';

interface AvatarProps {
  name: string;
  className?: string;
}

// Simple hash function to get a consistent color from a string
const nameToColor = (name: string): string => {
  const colors = [
    'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-yellow-500',
    'bg-lime-500', 'bg-green-500', 'bg-emerald-500', 'bg-teal-500',
    'bg-cyan-500', 'bg-sky-500', 'bg-blue-500', 'bg-indigo-500',
    'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500', 'bg-pink-500', 'bg-rose-500'
  ];
  // A more robust hashing function to ensure consistent color mapping
  const charCodes = name
    .split('')
    .map((char) => char.charCodeAt(0))
    .reduce((acc, curr) => acc + curr, 0);

  const index = charCodes % colors.length;
  return colors[index];
};

const getInitials = (name: string): string => {
    const names = name.split(' ');
    const initials = names.map(n => n[0]).join('');
    return initials.slice(0, 2).toUpperCase();
};

const Avatar: React.FC<AvatarProps> = ({ name, className = '' }) => {
  const initials = getInitials(name);
  const color = nameToColor(name);
  return (
    <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-white font-bold text-xs ${color} ${className}`}>
      {initials}
    </div>
  );
};

export default Avatar;
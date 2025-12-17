import React from 'react';
import LoadingScreen from './LoadingScreen';

const AppLoader: React.FC = () => {
  return <LoadingScreen message="Loading your CRM..." size="md" />;
};

export default AppLoader;
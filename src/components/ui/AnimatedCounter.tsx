import React from 'react';
import CountUp from 'react-countup';

interface AnimatedCounterProps {
  value: number;
  prefix?: string;
  decimals?: number;
  className?: string;
}

const AnimatedCounter: React.FC<AnimatedCounterProps> = ({ value, prefix = '', decimals = 0, className }) => {
  return (
    <CountUp
      end={value}
      prefix={prefix}
      duration={2.5}
      decimals={decimals}
      className={className}
      separator=","
    />
  );
};

export default AnimatedCounter;
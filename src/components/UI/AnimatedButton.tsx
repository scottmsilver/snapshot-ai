import React from 'react';
import { motion } from 'framer-motion';

interface AnimatedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost';
  size?: 'sm' | 'md';
  children: React.ReactNode;
}

export const AnimatedButton: React.FC<AnimatedButtonProps> = ({
  variant = 'default',
  size = 'sm',
  children,
  disabled,
  style,
  ...props
}) => {
  const variants = {
    default: {
      backgroundColor: 'transparent',
      border: '1px solid #ddd',
      color: '#666',
    },
    primary: {
      backgroundColor: '#4a90e2',
      border: 'none',
      color: 'white',
    },
    ghost: {
      backgroundColor: 'transparent',
      border: '1px solid transparent',
      color: '#666',
    },
  };

  const sizes = {
    sm: {
      padding: '0.25rem 0.75rem',
      fontSize: '0.75rem',
    },
    md: {
      padding: '0.5rem 1rem',
      fontSize: '0.875rem',
    },
  };

  const baseStyle = {
    borderRadius: '4px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    opacity: disabled ? 0.3 : 1,
    transition: 'all 0.2s',
    ...variants[variant],
    ...sizes[size],
    ...style,
  };

  const { 
    onClick,
    onMouseEnter,
    onMouseLeave,
    className,
    title,
    type,
    ...otherProps 
  } = props;
  
  return (
    <motion.button
      whileHover={disabled ? {} : { scale: 1.02 }}
      whileTap={disabled ? {} : { scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      style={baseStyle}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={className}
      title={title}
      type={type}
    >
      {children}
    </motion.button>
  );
};
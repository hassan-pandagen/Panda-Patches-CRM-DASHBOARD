// src/components/ui/SpotlightCard.tsx
// OPTIMIZED: Throttled mouse tracking to reduce re-renders
// Performance improvements:
// - Throttle to 20fps max (50ms) instead of unlimited mouse events
// - Only render gradient when hovered
// - Proper RAF cleanup on unmount
// - useCallback for stable references

import React, { useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";

interface SpotlightCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

const SpotlightCard: React.FC<SpotlightCardProps> = ({
  children,
  className = "",
  onClick,
}) => {
  const divRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  // Throttle refs to limit updates
  const lastUpdateRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  // Throttled mouse move - only update every 50ms using RAF
  // This reduces GPU load from continuous gradient recomputation
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!divRef.current) return;

      const now = Date.now();
      // Throttle to 20fps max (50ms between updates)
      if (now - lastUpdateRef.current < 50) return;

      // Cancel any pending RAF to avoid queuing multiple updates
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      // Use RAF for smooth, GPU-optimized updates
      rafRef.current = requestAnimationFrame(() => {
        if (!divRef.current) return;
        const rect = divRef.current.getBoundingClientRect();
        setPosition({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
        lastUpdateRef.current = now;
      });
    },
    []
  );

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    // Cleanup RAF on leave to prevent memory leaks
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  return (
    <motion.div
      ref={divRef}
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }} // Slightly faster for snappier feel
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      className={`relative rounded-2xl border border-white/10 bg-slate-900/40 overflow-hidden group cursor-default ${
        onClick ? "cursor-pointer" : ""
      } ${className}`}
    >
      {/* The Moving Spotlight Gradient - Only render when hovered */}
      {/* This conditional rendering saves GPU cycles when card is not interacted with */}
      {isHovered && (
        <div
          className="pointer-events-none absolute -inset-px transition-opacity duration-300 opacity-100"
          style={{
            background: `radial-gradient(600px circle at ${position.x}px ${position.y}px, rgba(251, 110, 29, 0.15), transparent 40%)`,
          }}
        />
      )}

      {/* Inner Content */}
      <div className="relative h-full">{children}</div>
    </motion.div>
  );
};

export default SpotlightCard;

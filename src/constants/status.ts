import {
  Clock,
  Truck,
  CheckCircle,
  XCircle,
  PauseCircle,
  Loader,
  type LucideIcon,
} from 'lucide-react';
import { OrderStatus } from '../types';

export type StatusInfo = {
  label: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
  Icon: LucideIcon;
  /** Legacy field — kept for backward compatibility with old badge code */
  color?: string;
};
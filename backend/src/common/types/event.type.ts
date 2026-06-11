import * as CryptoJS from 'crypto-js';

export interface Event {
  id?: string;
  source: string;
  timestamp: Date;
  labels: Record<string, string>;
  metricName?: string;
  value?: number;
  severity: 'info' | 'warning' | 'critical' | 'fatal';
  message?: string;
  status?: 'firing' | 'resolved';
}

export function calculateFingerprint(alertName: string, labels: Record<string, string>): string {
  const sortedLabels = Object.keys(labels)
    .sort()
    .map(key => `${key}=${labels[key]}`)
    .join(',');
  
  return CryptoJS.SHA256(alertName + sortedLabels).toString(CryptoJS.enc.Hex);
}

export function validateConditions(conditions: any[], maxConditions: number = 10): void {
  if (conditions.length > maxConditions) {
    throw new Error(`Rule cannot have more than ${maxConditions} conditions, please simplify`);
  }
}

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

export function calculateFingerprint(
  ruleId: string,
  labels: Record<string, string>,
  groupByLabels?: string[]
): string {
  let filteredLabels: Record<string, string>;

  if (groupByLabels && groupByLabels.length > 0) {
    filteredLabels = {};
    for (const label of groupByLabels) {
      if (labels[label] !== undefined) {
        filteredLabels[label] = labels[label];
      }
    }
  } else {
    filteredLabels = labels;
  }

  const sortedLabelStr = Object.keys(filteredLabels)
    .sort()
    .map(key => `${key}=${filteredLabels[key]}`)
    .join(',');

  return CryptoJS.SHA256(`${ruleId}:${sortedLabelStr}`).toString(CryptoJS.enc.Hex);
}

export function validateConditions(conditions: any[], maxConditions: number = 10): void {
  if (conditions.length > maxConditions) {
    throw new Error(`Rule cannot have more than ${maxConditions} conditions, please simplify`);
  }
}

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import type { TelemetryEvent } from './types.js';

export interface TelemetryStreamListener {
  (event: TelemetryEvent): void;
}

class StreamingTelemetryService extends EventEmitter {
  private enabled = false;

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  addTelemetryListener(listener: TelemetryStreamListener): void {
    this.on('telemetry', listener);
  }

  removeTelemetryListener(listener: TelemetryStreamListener): void {
    this.off('telemetry', listener);
  }

  emitEvent(event: TelemetryEvent): void {
    if (this.enabled) {
      this.emit('telemetry', event);
    }
  }
}

export const streamingTelemetryService = new StreamingTelemetryService();
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import stripAnsi from 'strip-ansi';
import type { SessionMetrics } from '../telemetry/uiTelemetry.js';
import type { JsonError } from './types.js';
import type { TelemetryEvent } from '../telemetry/types.js';

export interface StreamJsonTelemetryBlock {
  type: 'telemetry';
  event: TelemetryEvent;
}

export interface StreamJsonContentBlock {
  type: 'content';
  content: string;
}

export interface StreamJsonFinalBlock {
  type: 'final';
  response?: string;
  stats?: SessionMetrics;
  error?: JsonError;
}

export type StreamJsonBlock = StreamJsonTelemetryBlock | StreamJsonContentBlock | StreamJsonFinalBlock;

export class StreamJsonFormatter {
  formatTelemetryBlock(event: TelemetryEvent): string {
    const block: StreamJsonTelemetryBlock = {
      type: 'telemetry',
      event,
    };
    return JSON.stringify(block);
  }

  formatContentBlock(content: string): string {
    const block: StreamJsonContentBlock = {
      type: 'content',
      content: stripAnsi(content),
    };
    return JSON.stringify(block);
  }

  formatFinalBlock(response?: string, stats?: SessionMetrics, error?: JsonError): string {
    const block: StreamJsonFinalBlock = {
      type: 'final',
    };

    if (response !== undefined) {
      block.response = stripAnsi(response);
    }

    if (stats) {
      block.stats = stats;
    }

    if (error) {
      block.error = error;
    }

    return JSON.stringify(block);
  }

  formatError(error: Error, code?: string | number): string {
    const jsonError: JsonError = {
      type: error.constructor.name,
      message: stripAnsi(error.message),
      ...(code && { code }),
    };

    return this.formatFinalBlock(undefined, undefined, jsonError);
  }
}
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config, ToolCallRequestInfo, ResumedSessionData } from '@blocksuser/gemini-cli-core';
import {
  executeToolCall,
  shutdownTelemetry,
  isTelemetrySdkInitialized,
  GeminiEventType,
  FatalInputError,
  promptIdContext,
  OutputFormat,
  JsonFormatter,
  StreamJsonFormatter,
  uiTelemetryService,
  streamingTelemetryService,
} from '@blocksuser/gemini-cli-core';
import type { Content, Part } from '@google/genai';

import { ConsolePatcher } from './ui/utils/ConsolePatcher.js';
import { handleAtCommand } from './ui/hooks/atCommandProcessor.js';
import {
  handleError,
  handleToolError,
  handleCancellationError,
  handleMaxTurnsExceededError,
} from './utils/errors.js';

export async function runNonInteractive(
  config: Config,
  input: string,
  prompt_id: string,
  resumedSessionData?: ResumedSessionData,
): Promise<void> {
  return promptIdContext.run(prompt_id, async () => {
    const consolePatcher = new ConsolePatcher({
      stderr: true,
      debugMode: config.getDebugMode(),
    });

    try {
      consolePatcher.patch();
      
      // Set up streaming telemetry for stream-json format
      const isStreamJsonFormat = config.getOutputFormat() === OutputFormat.STREAM_JSON;
      let streamJsonFormatter: StreamJsonFormatter | undefined;
      
      if (isStreamJsonFormat) {
        streamJsonFormatter = new StreamJsonFormatter();
        streamingTelemetryService.enable();
        streamingTelemetryService.addTelemetryListener((event) => {
          process.stdout.write(streamJsonFormatter!.formatTelemetryBlock(event) + '\n');
        });
      }
      // Handle EPIPE errors when the output is piped to a command that closes early.
      process.stdout.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EPIPE') {
          // Exit gracefully if the pipe is closed.
          process.exit(0);
        }
      });
      
      const geminiClient = config.getGeminiClient();
      
      // Initialize chat recording service and handle resumed session
      if (resumedSessionData) {
        const chatRecordingService = geminiClient.getChatRecordingService();
        if (chatRecordingService) {
          chatRecordingService.initialize(resumedSessionData);
          
          // Convert resumed session messages to chat history
          const geminiChat = await geminiClient.getChat();
          if (geminiChat && resumedSessionData.conversation.messages.length > 0) {
            // Load the conversation history into the chat
            const historyContent: Content[] = resumedSessionData.conversation.messages.map(msg => ({
              role: msg.type === 'user' ? 'user' : 'model' as const,
              parts: Array.isArray(msg.content) 
                ? msg.content.map(part => typeof part === 'string' ? { text: part } : part)
                : [{ text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) }]
            }));
            
            // Set the chat history
            geminiChat.setHistory(historyContent);
          }
        }
      }

      const abortController = new AbortController();

      const { processedQuery, shouldProceed } = await handleAtCommand({
        query: input,
        config,
        addItem: (_item, _timestamp) => 0,
        onDebugMessage: () => {},
        messageId: Date.now(),
        signal: abortController.signal,
      });

      if (!shouldProceed || !processedQuery) {
        // An error occurred during @include processing (e.g., file not found).
        // The error message is already logged by handleAtCommand.
        throw new FatalInputError(
          'Exiting due to an error processing the @ command.',
        );
      }

      let currentMessages: Content[] = [
        { role: 'user', parts: processedQuery as Part[] },
      ];

      let turnCount = 0;
      while (true) {
        turnCount++;
        if (
          config.getMaxSessionTurns() >= 0 &&
          turnCount > config.getMaxSessionTurns()
        ) {
          handleMaxTurnsExceededError(config);
        }
        const toolCallRequests: ToolCallRequestInfo[] = [];

        const responseStream = geminiClient.sendMessageStream(
          currentMessages[0]?.parts || [],
          abortController.signal,
          prompt_id,
        );

        let responseText = '';
        for await (const event of responseStream) {
          if (abortController.signal.aborted) {
            handleCancellationError(config);
          }

          if (event.type === GeminiEventType.Content) {
            if (config.getOutputFormat() === OutputFormat.JSON) {
              responseText += event.value;
            } else if (config.getOutputFormat() === OutputFormat.STREAM_JSON) {
              responseText += event.value;
              if (streamJsonFormatter) {
                process.stdout.write(streamJsonFormatter.formatContentBlock(event.value) + '\n');
              }
            } else {
              process.stdout.write(event.value);
            }
          } else if (event.type === GeminiEventType.ToolCallRequest) {
            toolCallRequests.push(event.value);
          }
        }

        if (toolCallRequests.length > 0) {
          const toolResponseParts: Part[] = [];
          for (const requestInfo of toolCallRequests) {
            const toolResponse = await executeToolCall(
              config,
              requestInfo,
              abortController.signal,
            );

            if (toolResponse.error) {
              handleToolError(
                requestInfo.name,
                toolResponse.error,
                config,
                toolResponse.errorType || 'TOOL_EXECUTION_ERROR',
                typeof toolResponse.resultDisplay === 'string'
                  ? toolResponse.resultDisplay
                  : undefined,
              );
            }

            if (toolResponse.responseParts) {
              toolResponseParts.push(...toolResponse.responseParts);
            }
          }
          currentMessages = [{ role: 'user', parts: toolResponseParts }];
        } else {
          if (config.getOutputFormat() === OutputFormat.JSON) {
            const formatter = new JsonFormatter();
            const stats = uiTelemetryService.getMetrics();
            process.stdout.write(formatter.format(responseText, stats));
          } else if (config.getOutputFormat() === OutputFormat.STREAM_JSON) {
            if (streamJsonFormatter) {
              const stats = uiTelemetryService.getMetrics();
              process.stdout.write(streamJsonFormatter.formatFinalBlock(responseText, stats) + '\n');
            }
          } else {
            process.stdout.write('\n'); // Ensure a final newline
          }
          return;
        }
      }
    } catch (error) {
      handleError(error, config);
    } finally {
      consolePatcher.cleanup();
      if (config.getOutputFormat() === OutputFormat.STREAM_JSON) {
        streamingTelemetryService.disable();
      }
      if (isTelemetrySdkInitialized()) {
        await shutdownTelemetry(config);
      }
    }
  });
}

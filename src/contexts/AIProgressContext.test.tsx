import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { AIProgressProvider, useAIProgress } from './AIProgressContext';
import type { AIProgressEvent } from '@/types/aiProgress';

describe('AIProgressContext - Inpaint SSE Events', () => {
  const wrapper = ({ children }: { children: React.ReactNode }): React.ReactElement => (
    <AIProgressProvider>{children}</AIProgressProvider>
  );

  describe('log entry creation with newLogEntry flag', () => {
    it('should create new log entry when newLogEntry is true', () => {
      const { result } = renderHook(() => useAIProgress(), { wrapper });

      const event: AIProgressEvent = {
        step: 'processing',
        message: 'Analyzing masked area',
        newLogEntry: true,
      };

      act(() => {
        result.current.updateProgress(event);
      });

      expect(result.current.state.log.length).toBe(1);
      expect(result.current.state.log[0].message).toBe('Analyzing masked area');
    });

    it('should append new entry for each event (append-only)', () => {
      const { result } = renderHook(() => useAIProgress(), { wrapper });

      // First event creates new entry
      act(() => {
        result.current.updateProgress({
          step: 'processing',
          message: 'Analyzing masked area',
          newLogEntry: true,
        });
      });

      expect(result.current.state.log.length).toBe(1);
      expect(result.current.state.log[0].message).toBe('Analyzing masked area');

      // Second event appends a new entry (append-only log)
      act(() => {
        result.current.updateProgress({
          step: 'processing',
          message: 'Generating edit',
        });
      });

      // Append-only: now 2 entries
      expect(result.current.state.log.length).toBe(2);
      expect(result.current.state.log[0].message).toBe('Analyzing masked area');
      expect(result.current.state.log[1].message).toBe('Generating edit');
    });

    it('should create separate entries when newLogEntry is true on each event', () => {
      const { result } = renderHook(() => useAIProgress(), { wrapper });

      // First event
      act(() => {
        result.current.updateProgress({
          step: 'processing',
          message: 'First operation',
          newLogEntry: true,
        });
      });

      // Second event with newLogEntry: true (creates new entry)
      act(() => {
        result.current.updateProgress({
          step: 'processing',
          message: 'Second operation',
          newLogEntry: true,
        });
      });

      expect(result.current.state.log.length).toBe(2);
      expect(result.current.state.log[0].message).toBe('First operation');
      expect(result.current.state.log[1].message).toBe('Second operation');
    });
  });

  describe('sourceImage and maskImage handling', () => {
    it('should store sourceImage in log entry when provided', () => {
      const { result } = renderHook(() => useAIProgress(), { wrapper });
      const testSourceImage = 'data:image/png;base64,SOURCE';

      act(() => {
        result.current.updateProgress({
          step: 'processing',
          message: 'Processing',
          sourceImage: testSourceImage,
          newLogEntry: true,
        });
      });

      expect(result.current.state.log[0].sourceImage).toBe(testSourceImage);
    });

    it('should store maskImage in log entry when provided', () => {
      const { result } = renderHook(() => useAIProgress(), { wrapper });
      const testMaskImage = 'data:image/png;base64,MASK';

      act(() => {
        result.current.updateProgress({
          step: 'processing',
          message: 'Processing',
          maskImage: testMaskImage,
          newLogEntry: true,
        });
      });

      expect(result.current.state.log[0].maskImage).toBe(testMaskImage);
    });

    it('should inherit sourceImage and maskImage in new entries', () => {
      const { result } = renderHook(() => useAIProgress(), { wrapper });
      const testSourceImage = 'data:image/png;base64,SOURCE';
      const testMaskImage = 'data:image/png;base64,MASK';
      const testPrompt = 'Edit this image';

      // First event with all data
      act(() => {
        result.current.updateProgress({
          step: 'processing',
          message: 'Analyzing',
          sourceImage: testSourceImage,
          maskImage: testMaskImage,
          prompt: testPrompt,
          newLogEntry: true,
        });
      });

      // Second event creates new entry but inherits images
      act(() => {
        result.current.updateProgress({
          step: 'processing',
          message: 'Generating',
          thinkingText: 'AI is thinking...',
          // No sourceImage, maskImage - should inherit from previous entry
        });
      });

      // Append-only: now we have 2 entries
      expect(result.current.state.log.length).toBe(2);
      // New entry inherits images from previous
      expect(result.current.state.log[1].sourceImage).toBe(testSourceImage);
      expect(result.current.state.log[1].maskImage).toBe(testMaskImage);
      expect(result.current.state.log[1].message).toBe('Generating');
      expect(result.current.state.log[1].thinkingText).toBe('AI is thinking...');
    });
  });

  describe('complete inpaint flow simulation', () => {
    it('should handle full inpaint SSE flow with append-only log', () => {
      const { result } = renderHook(() => useAIProgress(), { wrapper });
      const testSourceImage = 'data:image/png;base64,SOURCE';
      const testMaskImage = 'data:image/png;base64,MASK';
      const testPrompt = 'Remove background';

      // Step 1: First progress event (creates entry with inputs)
      act(() => {
        result.current.updateProgress({
          step: 'processing',
          message: 'Analyzing masked area',
          sourceImage: testSourceImage,
          maskImage: testMaskImage,
          prompt: testPrompt,
          newLogEntry: true,
        });
      });

      expect(result.current.state.log.length).toBe(1);
      expect(result.current.state.step).toBe('processing');
      expect(result.current.state.message).toBe('Analyzing masked area');

      // Step 2: Second progress event (appends new entry, inherits images)
      act(() => {
        result.current.updateProgress({
          step: 'processing',
          message: 'Generating edit',
          thinkingText: 'Thinking about the edit...',
          prompt: 'Enhanced: Remove background completely',
        });
      });

      // Append-only: now we have 2 entries
      expect(result.current.state.log.length).toBe(2);
      expect(result.current.state.message).toBe('Generating edit');
      expect(result.current.state.log[1].message).toBe('Generating edit');
      // Images are inherited from the first entry
      expect(result.current.state.log[1].sourceImage).toBe(testSourceImage);
      expect(result.current.state.log[1].maskImage).toBe(testMaskImage);
      expect(result.current.state.log[1].thinkingText).toBe('Thinking about the edit...');

      // Step 3: Complete event (appends new entry)
      act(() => {
        result.current.updateProgress({
          step: 'complete',
          message: 'Done',
        });
      });

      expect(result.current.state.step).toBe('complete');
      expect(result.current.state.log.length).toBe(3);
      // Images are inherited through all entries
      expect(result.current.state.log[2].sourceImage).toBe(testSourceImage);
      expect(result.current.state.log[2].maskImage).toBe(testMaskImage);
    });

    it('should append thinking deltas to last entry instead of creating new', () => {
      const { result } = renderHook(() => useAIProgress(), { wrapper });

      // First event creates entry
      act(() => {
        result.current.updateProgress({
          step: 'planning',
          message: 'Planning edit',
          newLogEntry: true,
        });
      });

      expect(result.current.state.log.length).toBe(1);

      // Thinking delta appends to last entry
      act(() => {
        result.current.updateProgress({
          step: 'planning',
          message: 'AI is thinking...',
          thinkingTextDelta: 'First chunk of thinking. ',
        });
      });

      // Still 1 entry, thinking appended
      expect(result.current.state.log.length).toBe(1);
      expect(result.current.state.log[0].thinkingText).toBe('First chunk of thinking. ');

      // Another delta
      act(() => {
        result.current.updateProgress({
          step: 'planning',
          message: 'AI is thinking...',
          thinkingTextDelta: 'Second chunk.',
        });
      });

      expect(result.current.state.log.length).toBe(1);
      expect(result.current.state.log[0].thinkingText).toBe('First chunk of thinking. Second chunk.');
    });
  });
});

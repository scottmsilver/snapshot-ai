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

  describe('inputImages handling', () => {
    it('should store inputImages in log entry when provided', () => {
      const { result } = renderHook(() => useAIProgress(), { wrapper });
      const testInputImages = [
        { label: 'Source Image', dataUrl: 'data:image/png;base64,SOURCE' },
        { label: 'Mask', dataUrl: 'data:image/png;base64,MASK' },
      ];

      act(() => {
        result.current.updateProgress({
          step: 'processing',
          message: 'Processing',
          inputImages: testInputImages,
          newLogEntry: true,
        });
      });

      expect(result.current.state.log[0].inputImages).toEqual(testInputImages);
    });

    it('should handle single input image', () => {
      const { result } = renderHook(() => useAIProgress(), { wrapper });
      const testInputImages = [
        { label: 'Source Image', dataUrl: 'data:image/png;base64,SOURCE' },
      ];

      act(() => {
        result.current.updateProgress({
          step: 'processing',
          message: 'Processing',
          inputImages: testInputImages,
          newLogEntry: true,
        });
      });

      expect(result.current.state.log[0].inputImages).toEqual(testInputImages);
    });

    it('should not inherit inputImages in new entries', () => {
      const { result } = renderHook(() => useAIProgress(), { wrapper });
      const testInputImages = [
        { label: 'Source Image', dataUrl: 'data:image/png;base64,SOURCE' },
      ];
      const testPrompt = 'Edit this image';

      // First event with inputImages
      act(() => {
        result.current.updateProgress({
          step: 'processing',
          message: 'Analyzing',
          inputImages: testInputImages,
          prompt: testPrompt,
          newLogEntry: true,
        });
      });

      // Second event creates new entry without inputImages
      act(() => {
        result.current.updateProgress({
          step: 'processing',
          message: 'Generating',
          thinkingText: 'AI is thinking...',
        });
      });

      // Append-only: now we have 2 entries
      expect(result.current.state.log.length).toBe(2);
      // First entry has inputImages
      expect(result.current.state.log[0].inputImages).toEqual(testInputImages);
      // Second entry does NOT inherit inputImages (they are only on the first event)
      expect(result.current.state.log[1].inputImages).toBeUndefined();
      expect(result.current.state.log[1].message).toBe('Generating');
      expect(result.current.state.log[1].thinkingText).toBe('AI is thinking...');
    });
  });

  describe('complete inpaint flow simulation', () => {
    it('should handle full inpaint SSE flow with append-only log', () => {
      const { result } = renderHook(() => useAIProgress(), { wrapper });
      const testInputImages = [
        { label: 'Source Image', dataUrl: 'data:image/png;base64,SOURCE' },
        { label: 'Mask', dataUrl: 'data:image/png;base64,MASK' },
      ];
      const testPrompt = 'Remove background';

      // Step 1: First progress event (creates entry with inputs)
      act(() => {
        result.current.updateProgress({
          step: 'processing',
          message: 'Analyzing masked area',
          inputImages: testInputImages,
          prompt: testPrompt,
          newLogEntry: true,
        });
      });

      expect(result.current.state.log.length).toBe(1);
      expect(result.current.state.step).toBe('processing');
      expect(result.current.state.message).toBe('Analyzing masked area');
      expect(result.current.state.log[0].inputImages).toEqual(testInputImages);

      // Step 2: Second progress event (appends new entry, no inherited images)
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
      // inputImages are only on the first entry (not inherited)
      expect(result.current.state.log[1].inputImages).toBeUndefined();
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

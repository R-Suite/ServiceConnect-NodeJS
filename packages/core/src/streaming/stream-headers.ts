export const StreamHeaders = {
  StreamId: 'StreamId',
  SequenceNumber: 'SequenceNumber',
  IsStartOfStream: 'IsStartOfStream',
  IsEndOfStream: 'IsEndOfStream',
  StreamFault: 'StreamFault',
} as const;

export type StreamHeaderKey = (typeof StreamHeaders)[keyof typeof StreamHeaders];

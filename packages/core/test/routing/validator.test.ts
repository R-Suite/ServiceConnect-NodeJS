import { describe, expect, it } from 'vitest';
import { RoutingSlipDestinationError } from '../../src/errors.js';
import { parseRoutingSlip, serialiseRoutingSlip } from '../../src/routing/slip.js';
import {
  assertValidDestination,
  destinationFailureReason,
  isValidDestination,
} from '../../src/routing/validator.js';

describe('RoutingSlipDestinationValidator', () => {
  it.each([
    ['', 'is null or whitespace'],
    ['   ', 'is null or whitespace'],
    ['a'.repeat(129), 'exceeds the 128-character cap'],
    ['has*wildcard', 'reserved character'],
    ['has#hash', 'reserved character'],
    ['null\0byte', 'reserved character'],
    ['line\rbreak', 'reserved character'],
    ['line\nbreak', 'reserved character'],
    ['tab\there', 'reserved character'],
    ['quote"in', 'reserved character'],
    ["apos'in", 'reserved character'],
    ['amq.gen-abc', "'amq.*'"],
    ['AMQ.rabbitmq.trace', "'amq.*'"],
  ])('rejects %j with reason matching /%s/', (input, expectedFragment) => {
    expect(isValidDestination(input)).toBe(false);
    const reason = destinationFailureReason(input);
    expect(reason).toContain(expectedFragment);
    expect(() => assertValidDestination(input)).toThrow(RoutingSlipDestinationError);
  });

  it('accepts plain queue names', () => {
    expect(isValidDestination('inventory-queue')).toBe(true);
    expect(isValidDestination('orders.v1.processing')).toBe(true);
    expect(isValidDestination('a')).toBe(true);
    expect(destinationFailureReason('inventory-queue')).toBeNull();
  });
});

describe('routing slip header codec', () => {
  it('round-trips destinations through serialise + parse', () => {
    const slip = ['a', 'b', 'c'];
    const json = serialiseRoutingSlip(slip);
    const parsed = parseRoutingSlip(json);
    expect(parsed).toEqual(slip);
  });

  it('parse returns [] for undefined / empty', () => {
    expect(parseRoutingSlip(undefined)).toEqual([]);
    expect(parseRoutingSlip('')).toEqual([]);
  });

  it('parse throws on malformed JSON', () => {
    expect(() => parseRoutingSlip('not-json')).toThrow();
  });

  it('parse throws when content is not a string array', () => {
    expect(() => parseRoutingSlip('{"a":1}')).toThrow();
    expect(() => parseRoutingSlip('[1,2,3]')).toThrow();
  });
});

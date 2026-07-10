# routing-slip

A starter bus calls `bus.route<Step>('Step', msg, [queueA, queueB, queueC])`. Each of the three transient bus instances consumes from its own queue. The dispatcher's forward hook automatically advances the message through the itinerary.

The example asserts the visit order: queueA → queueB → queueC.

## Run

`bash run.sh`

## Expected output

```
[starter] routing through 3 hops
[queueA] visited (slip remaining: 2)
[queueB] visited (slip remaining: 1)
[queueC] visited (slip remaining: 0)
[OK] all 3 hops visited in order
```

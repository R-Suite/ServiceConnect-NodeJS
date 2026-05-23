# streaming

A sender opens a stream via `bus.openStream`, sends 50 numbered chunks, calls `complete()`. The receiver registers a `handleStream` handler that collects chunks in order. The example asserts all 50 arrived and their indices match `[0..49]`.

## Run

`bash run.sh`

## Expected output

```
[sender] opening stream to streaming-example-receiver
[sender] sent 50 chunks
[receiver] consumed 50 chunks in order
[OK] streaming round-trip complete
```

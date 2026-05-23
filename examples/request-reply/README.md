# request-reply

Two scenarios:

1. **Single reply** — `bus.sendRequest<Req, Rep>(...)` returns one reply.
2. **Scatter-gather** — `bus.sendRequestMulti<Req, Rep>(...)` returns multiple replies. Three responder buses race; the requester collects all three.

## Run

`bash run.sh`

## Expected output

```
[requester] sendRequest: hello → got pong:hello
[requester] sendRequestMulti to 3 responders
[requester] got 3 replies: [r0, r1, r2]
[OK] both scenarios passed
```

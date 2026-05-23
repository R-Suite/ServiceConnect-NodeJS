# send

Demonstrates `bus.send` directed at a specific queue endpoint. The sender targets the receiver's queue by name; no fanout exchange involved.

## Run

`bash run.sh`

## Expected output

```
[sender] sending to send-example-receiver
[receiver] got c-42 for order-42
[OK] received expected message
```

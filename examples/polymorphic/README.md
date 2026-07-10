# polymorphic

A subscriber registers a handler on a **base** message type (`DomainEvent`). The publisher emits a **derived** type (`OrderShipped extends DomainEvent`). The framework's polymorphic dispatch routes the derived message to the base-type handler via exchange-to-exchange bindings.

## Run

`bash run.sh`

## Expected output

```
[publisher] publishing OrderShipped
[subscriber] DomainEvent handler received order-1
[OK] base-type handler ran for derived message
```

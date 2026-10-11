# Events

PowerDNS emits no events and runs no hooks. Its callers decide when records
change:

- the rDNS API upserts or deletes the records a customer sets;
- the `delete-server` workflow deletes the records of a server's addresses
  before the addresses return to the pool.

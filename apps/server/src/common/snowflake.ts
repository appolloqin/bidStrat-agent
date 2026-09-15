export class Snowflake {
  private static seq = 0;
  private static lastTs = 0;
  private static machine = BigInt(Math.floor(Math.random() * 1024));
  private static epoch = 1735689600000;

  static next(): string {
    const now = Date.now();
    if (now === Snowflake.lastTs) {
      Snowflake.seq = (Snowflake.seq + 1) & 0xfff;
      if (Snowflake.seq === 0) {
        while (Date.now() <= now) {}
      }
    } else {
      Snowflake.seq = 0;
    }
    Snowflake.lastTs = Date.now();
    const id =
      (BigInt(Snowflake.lastTs - Snowflake.epoch) << 22n) |
      (Snowflake.machine << 12n) |
      BigInt(Snowflake.seq);
    return id.toString();
  }
}

export const nextId = (): string => Snowflake.next();

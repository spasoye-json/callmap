export interface Ink {
  colour(): string;
}

export interface Printer {
  ink(): Ink;
}

export class BlackInk implements Ink {
  colour(): string {
    return 'black';
  }
}

export class RedInk implements Ink {
  colour(): string {
    return 'red';
  }
}

export class Laser implements Printer {
  ink(): Ink {
    return new BlackInk();
  }
}

export class Jet implements Printer {
  ink(): Ink {
    return new RedInk();
  }
}

export const colourOf = (printer: Printer): string => printer.ink().colour();

export const titleColourOf = (printer: Printer): string =>
  printer
    .ink()
    .colour()
    .replace(/^./, (first) => first.toUpperCase());

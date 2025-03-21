export interface Value {

    type: string;
    TYPE: string;

    parse(str: string): Value;
    toString(): string;
    is(value: Value): boolean;
}

export class Length implements Value {
    length: number;
    unit: string;
    TYPE: '<length>';
    type: '<length>';
    UNITS: string[];

    px(length: number): Length;
    em(length: number): Length;
}
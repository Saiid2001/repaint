import type { Length } from "../css/values.d.ts";

export declare type ElementStyle = {
    [key: string]: string;
};

declare class Widths {
    top: number;
    right: number;
    bottom: number;
    left: number;

    some(): boolean;
    reset(): void;
}

export default class Box {
    style: ElementStyle;
    position: {
        x: number;
        y: number;
    }
    dimensions: {
        width: number;
        height: number;
    }
    margin: Widths;
    padding: Widths;
    border: Widths;

    constructor(style: ElementStyle);

    topWidth(): number;
    rightWidth(): number;
    bottomWidth(): number;
    leftWidth(): number;
    innerWidth(): number;
    innerHeight(): number;
    outerWidth(): number;
    outerHeight(): number;
    width(): number;
    height(): number;
    translate(dx: number, dy: number): void;
    styledBorderWidth(direction: string): Length;
    afterLayout(): void;

    abstract layout(): void;
}
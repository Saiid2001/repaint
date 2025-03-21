import Box from './box.d.ts';

export declare type ViewportConf = {
    position: {
        x: number;
        y: number;
    };
    dimensions: {
        width: number;
        height: number;
    };
};

export declare class Viewport extends Box {

    children: Box[];

    clone(): Viewport;
    layout(): void;

    constructor(position: { x: number, y: number }, dimensions: { width: number, height: number });


    // implements ParentBox but we will not include it yet
    attach(node: Box, i?: number): void;
    detach(node: Box): void;
    collapseWhitespace(strip: boolean): boolean;
    addLink(box: Box): void;
    visibleWidth(): number;
    visibleHeight(): number;

    // implements it from BlockBox but we will not include it yet
    addLine(child: Box, branch: Box): void;
}
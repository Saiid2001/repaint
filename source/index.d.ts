import type { ViewportConf } from "./layout/viewport";

declare type Options = {
    viewport: ViewportConf;
    content: string;
    context: CanvasRenderingContext2D;
    url: string;
    stylesheets: string[];
}

declare type Callback = (error?: Error, page: EvenEtmitter) => void

declare function repaint(options: Options, callback: Callback): void

export default repaint
import { Node } from "domhandler";
import type { Viewport, ViewportConf } from "./layout/viewport";
import type {HTMLElement} from "jsdom";

declare function layout(html: HTMLElement, viewport: ViewportConf): Viewport;

export default layout;
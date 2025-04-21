import { Node } from "domhandler";
import type { Viewport, ViewportConf } from "./layout/viewport";

declare function layout(body: Node[], viewport: ViewportConf): Viewport;

export default layout;
import { Node, Element } from 'domhandler'

export declare type Document = {
    html: Node[],
    stylesheets: Element[],
    scripts: Element[],
    images: Element[],
    anchors: Element[],
    title: Element
}

declare type Callback = (error: Error | null, document: Document) => void

declare function html(html: string, callback: Callback): void

export default html
import { createBrowserFieldCapability, type EditableElement } from './browser_field.js';
import { createBrowserSliceController, type BrowserCoreBridge, type BrowserSliceController, type BrowserCoreRequest } from './browser_slice.js';

/** Renderer-side desktop service shape. Electron APIs stay behind preload. */
export interface DesktopRendererService {
  checkText(text: string): Promise<unknown>;
}

export function createDesktopSliceController({
  core,
  field,
  service,
  documentID = 'desktop-editor',
  language = 'auto',
  chunkBudget,
}: {
  core: BrowserCoreBridge;
  field: EditableElement;
  service: DesktopRendererService;
  documentID?: string;
  language?: string;
  chunkBudget?: number;
}): BrowserSliceController {
  return createBrowserSliceController({
    core,
    field: createBrowserFieldCapability(field),
    documentID,
    language,
    chunkBudget,
    check: (request: BrowserCoreRequest) => service.checkText(request.text),
  });
}

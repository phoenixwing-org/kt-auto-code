export const KTC_PRIMARY_SHELL_TAG = "ktc-primary-shell";

const STYLE = `
  :host {
    display:block; width:100%; height:100%; min-width:0; min-height:0; flex:1 1 auto;
    margin:0; padding:0; overflow:hidden;
    color:var(--vscode-foreground); background:var(--vscode-sideBar-background);
  }
  :host([hidden]) { display:none !important; }
  * { box-sizing:border-box; }
  .shell {
    display:grid; width:100%; height:100%; min-width:0; min-height:0;
    grid-template-rows:auto auto minmax(0,1fr) auto; gap:0;
    margin:0; padding:0; overflow:hidden;
  }
  .fixed, .current { min-width:0; min-height:0; margin:0; padding:0; }
  .current { overflow:hidden; }
  slot { display:block; min-width:0; margin:0; padding:0; }
  slot[name="current"] { height:100%; min-height:0; overflow:hidden; }
  ::slotted(*) { box-sizing:border-box; width:100%; min-width:0; max-width:100%; margin:0; }
  ::slotted([slot="current"]) { height:100%; min-height:0; }
`;

export class KtcPrimaryShell extends HTMLElement {
  private readonly root = this.attachShadow({ mode: "open" });
  private initialized = false;

  connectedCallback(): void { this.ensureDom(); }

  private ensureDom(): void {
    if (this.initialized) return;
    const style = document.createElement("style");
    style.textContent = STYLE;

    const shell = document.createElement("div");
    shell.className = "shell";
    shell.setAttribute("part", "shell");
    shell.append(
      this.region("directory", "fixed directory"),
      this.region("toolbar", "fixed toolbar"),
      this.region("current", "current"),
      this.region("open-items", "fixed open-items"),
    );

    this.root.replaceChildren(style, shell);
    this.initialized = true;
  }

  private region(slotName: string, className: string): HTMLElement {
    const region = document.createElement("div");
    region.className = className;
    region.setAttribute("part", slotName);
    const slot = document.createElement("slot");
    slot.name = slotName;
    region.append(slot);
    return region;
  }
}

export function ktcDefinePrimaryShell(tagName = KTC_PRIMARY_SHELL_TAG): typeof KtcPrimaryShell {
  const existing = customElements.get(tagName);
  if (existing) return existing as typeof KtcPrimaryShell;
  customElements.define(tagName, KtcPrimaryShell);
  return KtcPrimaryShell;
}

declare global {
  interface HTMLElementTagNameMap {
    "ktc-primary-shell": KtcPrimaryShell;
  }
}

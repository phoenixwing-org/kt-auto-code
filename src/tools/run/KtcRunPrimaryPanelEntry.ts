import { pnwCodeDefineCleanupDialog, pnwCodeDefineNavigationTree } from "@phoenix-wing/code-core/ui";
import { KtcDefineRunPrimaryPanel } from "./KtcRunPrimaryPanel.js";

pnwCodeDefineNavigationTree();
// Run owns its Primary dialog; AutoBuild's Right Webview has a separate registry.
pnwCodeDefineCleanupDialog();
KtcDefineRunPrimaryPanel();

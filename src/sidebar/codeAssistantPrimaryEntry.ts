import { ktcDefineTextRepairPrimary } from "../ui/KtcTextRepairPrimary.js";
import { ktcDefineCaaPrimary } from "../ui/KtcCaaPrimary.js";
import { ktcDefineSelectionPrimary } from "../ui/KtcSelectionPrimary.js";
import { ktcCreateTextRepairPrimaryModel, ktcTextRepairPrimaryActionToMessage } from "./textRepairPrimaryAdapter.js";
import { ktcCreateCaaPrimaryModel, ktcCaaPrimaryMessageForAction } from "./caaPrimaryAdapter.js";
import { ktcProjectSelectionPrimary, ktcSelectionPrimaryMessage } from "./selectionPrimaryAdapter.js";

ktcDefineTextRepairPrimary();
ktcDefineCaaPrimary();
ktcDefineSelectionPrimary();

// The nonce-authorized shell owns VS Code messaging and UI persistence. These
// projections contain no Host services, Preview fixtures or business algorithms.
Object.assign(globalThis, { ktcCodeAssistantPrimary: {
  ktcCreateTextRepairPrimaryModel,
  ktcTextRepairPrimaryActionToMessage,
  ktcCreateCaaPrimaryModel,
  ktcCaaPrimaryMessageForAction,
  ktcProjectSelectionPrimary,
  ktcSelectionPrimaryMessage,
} });

/**
 * The Vuetify components no part of the landing page renders: registered
 * globally on first need, not at boot (vuetifyDeferred.ts). The ones it does
 * render are registered in main.ts.
 *
 * Moving a component between the two lists: a component used anywhere in the
 * landing page's tree (App.vue, CourseHeader and what it renders, the landing
 * page and its sections, including the question views the walkthrough embeds,
 * and the framework's SnackbarService) must be in main.ts's list; it would
 * otherwise render as an unknown element there. Everything else belongs here.
 */
import {
  VAlertTitle, VAppBarNavIcon, VAutocomplete, VBadge, VBanner, VBreadcrumbs,
  VBtnGroup, VBtnToggle, VCardActions, VCardSubtitle, VCardTitle, VCheckbox,
  VChip, VChipGroup, VCode, VDataTable, VDialog, VExpandTransition, VFadeTransition,
  VExpansionPanel, VExpansionPanelText, VExpansionPanelTitle, VExpansionPanels,
  VFooter, VListItemSubtitle, VNavigationDrawer, VProgressCircular,
  VProgressLinear, VRadio, VRadioGroup, VSelect, VSlider, VSpeedDial, VSwitch,
  VTab, VTable, VTabs, VTextarea, VTimeline, VTimelineItem, VToolbar,
  VToolbarItems, VTooltip, VWindow, VWindowItem,
} from "vuetify/components";

export const deferredComponents = {
  VAlertTitle, VAppBarNavIcon, VAutocomplete, VBadge, VBanner, VBreadcrumbs,
  VBtnGroup, VBtnToggle, VCardActions, VCardSubtitle, VCardTitle, VCheckbox,
  VChip, VChipGroup, VCode, VDataTable, VDialog, VExpandTransition, VFadeTransition,
  VExpansionPanel, VExpansionPanelText, VExpansionPanelTitle, VExpansionPanels,
  VFooter, VListItemSubtitle, VNavigationDrawer, VProgressCircular,
  VProgressLinear, VRadio, VRadioGroup, VSelect, VSlider, VSpeedDial, VSwitch,
  VTab, VTable, VTabs, VTextarea, VTimeline, VTimelineItem, VToolbar,
  VToolbarItems, VTooltip, VWindow, VWindowItem,
};
